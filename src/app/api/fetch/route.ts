/**
 * src/app/api/fetch/route.ts
 * ─────────────────────────────────────────────────────────────────
 * Secure CORS fetch proxy  —  GET /api/fetch?url=<encoded_url>
 *
 * Used by Member B's client engine to retrieve external blog HTML
 * and RSS/XML feeds without exposing the user's IP to upstream servers
 * and without allowing SSRF into internal infrastructure.
 *
 * HTTP contract (MEMBER_C_SERVER_SECURITY.md):
 *   200  Raw upstream body, with upstream Content-Type forwarded.
 *   400  Missing/malformed ?url= parameter, DNS failure, bad redirect.
 *   403  SSRF violation: private/reserved IP or blocked hostname.
 *   413  Upstream response exceeds 5 MB size cap.
 *   415  Upstream Content-Type not in the allow-list.
 *   504  Upstream did not respond within 8 seconds.
 *
 * Security guarantees:
 *   ✓  Only http: and https: schemes accepted.
 *   ✓  Every DNS-resolved IP validated against forbidden ranges.
 *   ✓  Redirects followed manually (≤ MAX_REDIRECTS), each re-validated.
 *   ✓  8-second AbortController timeout (Slowloris / slow-response defense).
 *   ✓  5 MB response-size cap enforced during streaming.
 *   ✓  No upstream content stored on the server (pure passthrough).
 *   ✓  No cookies, auth headers, or internal metadata forwarded upstream.
 *   ✓  CORS restricted to ALLOWED_ORIGIN (not wildcard *).
 *   ✓  Content-Type responses allow-listed.
 *
 * Known limitation:
 *   DNS is validated at lookup time; the TCP connection uses the hostname,
 *   so a narrow TOCTOU window remains (documented in threat model).
 * ─────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateUrl,
  resolveAndValidate,
  validateRedirectTarget,
} from '@/lib/server/ssrf-guard';

// ─── Configuration constants ──────────────────────────────────────

/** Upstream fetch timeout (ms). From spec: 8 seconds. */
export const FETCH_TIMEOUT_MS = 8_000;

/** Maximum allowed upstream response body size in bytes: 5 MB. */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/** Maximum redirect hops to follow. */
export const MAX_REDIRECTS = 3;

/**
 * Content-Type prefixes accepted from upstream.
 * Any other type is rejected with 415.
 */
export const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'application/xml',
  'text/xml',
  'application/rss+xml',
  'application/atom+xml',
  'application/feed+json',
  'text/plain',
] as const;

/**
 * Permitted CORS origin.
 * Set ALLOWED_ORIGIN env var to the deployed frontend domain in production.
 */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000';

// ─── CORS header builder ──────────────────────────────────────────

/**
 * Build CORS headers that permit only the configured ALLOWED_ORIGIN.
 * Wildcard '*' is never used.
 */
export function buildCorsHeaders(requestOrigin: string | null): Record<string, string> {
  // Echo back the specific origin only when it matches our allow-list.
  // This prevents cross-origin caching side-channels.
  const allowedOrigin =
    requestOrigin === ALLOWED_ORIGIN ? requestOrigin : ALLOWED_ORIGIN;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// ─── CORS preflight handler ───────────────────────────────────────

export function OPTIONS(req: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(req.headers.get('origin')),
  });
}

// ─── Internal helpers ─────────────────────────────────────────────

function jsonError(
  status: number,
  message: string,
  origin: string | null,
): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: buildCorsHeaders(origin) },
  );
}

function isContentTypeAllowed(rawContentType: string | null): boolean {
  if (!rawContentType) return true; // absent → pass through; client can decide
  const normalized = rawContentType.toLowerCase().split(';')[0].trim();
  return ALLOWED_CONTENT_TYPES.some((allowed) => normalized.startsWith(allowed));
}

// ─── GET handler ──────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const origin = req.headers.get('origin');

  // ── Step 1: Extract ?url= parameter ────────────────────────────
  const rawUrl = req.nextUrl.searchParams.get('url');
  if (!rawUrl || rawUrl.trim() === '') {
    return jsonError(400, 'Missing required query parameter: url', origin);
  }

  // ── Step 2: URL structural validation ──────────────────────────
  const urlResult = validateUrl(rawUrl);
  if (!urlResult.ok) {
    const httpStatus =
      urlResult.error === 'DISALLOWED_SCHEME' ||
      urlResult.error === 'BLOCKED_HOSTNAME'
        ? 403
        : 400;
    return jsonError(httpStatus, urlResult.message, origin);
  }

  let currentUrl: URL = urlResult.parsedUrl;

  // ── Step 3: DNS resolution + IP range validation ────────────────
  const dnsResult = await resolveAndValidate(currentUrl.hostname);
  if (!dnsResult.ok) {
    const httpStatus = dnsResult.error === 'FORBIDDEN_IP_RANGE' ? 403 : 400;
    return jsonError(httpStatus, dnsResult.message, origin);
  }

  // ── Step 4: Fetch with timeout + manual redirect handling ────────
  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT_MS,
  );

  try {
    let upstreamResponse: Response | null = null;
    let redirectHop = 0;

    fetchLoop: while (true) {
      let attempt: Response;
      try {
        attempt = await fetch(currentUrl.toString(), {
          method: 'GET',
          redirect: 'manual',           // never auto-follow
          signal: controller.signal,
          headers: {
            // Safe, minimal headers only — no forwarding of client headers
            'User-Agent':
              'SmallWebReader/1.0 (+https://github.com/PECathon-2026/Team-PF7UDRPK)',
            Accept: ALLOWED_CONTENT_TYPES.join(', '),
          },
        });
      } catch (err) {
        if (controller.signal.aborted) {
          return jsonError(504, 'Upstream request timed out after 8 seconds.', origin);
        }
        return jsonError(
          400,
          `Failed to connect to upstream server: ${(err as Error).message}`,
          origin,
        );
      }

      // ── Redirect branch ─────────────────────────────────────────
      if (attempt.status >= 301 && attempt.status <= 308 && attempt.status !== 304) {
        redirectHop++;
        const location = attempt.headers.get('location');
        if (!location) {
          return jsonError(400, 'Upstream redirect missing Location header.', origin);
        }

        const redirectResult = await validateRedirectTarget(
          location,
          currentUrl,
          redirectHop,
          MAX_REDIRECTS,
        );
        if (!redirectResult.ok) {
          return jsonError(
            403,
            `Redirect blocked by SSRF policy: ${redirectResult.message}`,
            origin,
          );
        }

        currentUrl = redirectResult.parsedUrl;
        continue fetchLoop;
      }

      // ── Non-redirect: we have our final response ─────────────────
      upstreamResponse = attempt;
      break;
    }

    if (!upstreamResponse) {
      return jsonError(400, 'No response received from upstream.', origin);
    }

    // ── Step 5: Content-Type allow-list ─────────────────────────────
    const upstreamContentType = upstreamResponse.headers.get('content-type');
    if (!isContentTypeAllowed(upstreamContentType)) {
      return jsonError(
        415,
        `Upstream Content-Type "${upstreamContentType}" is not permitted.`,
        origin,
      );
    }

    // ── Step 6: Bounded body read (5 MB cap) ─────────────────────────
    if (!upstreamResponse.body) {
      return jsonError(400, 'Upstream returned an empty response body.', origin);
    }

    const reader = upstreamResponse.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          return jsonError(
            413,
            `Upstream response exceeds the ${MAX_RESPONSE_BYTES / 1024 / 1024} MB limit.`,
            origin,
          );
        }
        chunks.push(value);
      }
    }

    // Reassemble body
    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // ── Step 7: Return raw body — no parsing, no storage ──────────────
    return new NextResponse(body, {
      status: upstreamResponse.status,
      headers: {
        ...buildCorsHeaders(origin),
        // Only forward Content-Type; strip all other upstream headers
        'Content-Type': upstreamContentType ?? 'application/octet-stream',
        // Prevent downstream caching of proxied content
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

