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
 *   304  Upstream returned Not Modified (ETag / Last-Modified matched).
 *   400  Missing/malformed ?url= parameter, DNS failure, bad redirect.
 *   403  SSRF violation or blocked by robots.txt policy.
 *   413  Upstream response exceeds 10 MB size cap.
 *   415  Upstream Content-Type not in the allow-list.
 *   504  Upstream did not respond within timeout window.
 * ─────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateUrl,
  resolveAndValidate,
  validateRedirectTarget,
} from '@/lib/server/ssrf-guard';

// ─── Configuration constants ──────────────────────────────────────

/** Upstream fetch timeout (ms). From spec: 15 seconds. */
export const FETCH_TIMEOUT_MS = 15_000;

/** Maximum allowed upstream response body size in bytes: 10 MB. */
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

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
  'application/x-rss+xml',
  'application/rdf+xml',
  'text/rss+xml',
  'text/atom+xml',
  'application/xml+rss',
] as const;

/**
 * Permitted CORS origin.
 * Set ALLOWED_ORIGIN env var to the deployed frontend domain in production.
 */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000';

// ─── Robots.txt In-Memory Cache ───────────────────────────────────

const robotsCache = new Map<string, { disallowed: boolean; expiresAt: number }>();

async function isDisallowedByRobots(url: URL): Promise<boolean> {
  const host = url.hostname.toLowerCase();
  const cached = robotsCache.get(host);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.disallowed;
  }

  try {
    const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(robotsUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SmallWebReader/1.0 (+https://github.com/PECathon-2026/Team-PF7UDRPK)',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      // 404 / 403 or non-standard means no crawler restrictions
      robotsCache.set(host, { disallowed: false, expiresAt: Date.now() + 60 * 60 * 1000 });
      return false;
    }

    const text = await res.text();
    // Check if Disallow: / applies globally or to SmallWebReader
    const isDisallowed = /User-agent:\s*(\*|SmallWebReader)[\s\S]*?Disallow:\s*\/\s*$/im.test(text);
    robotsCache.set(host, { disallowed: isDisallowed, expiresAt: Date.now() + 60 * 60 * 1000 });
    return isDisallowed;
  } catch {
    // If robots.txt times out or cannot be fetched, fail open (standard RSS reader practice)
    return false;
  }
}

// ─── CORS header builder ──────────────────────────────────────────

/**
 * Build CORS headers that permit only the configured ALLOWED_ORIGIN.
 */
export function buildCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const allowedOrigin =
    requestOrigin === ALLOWED_ORIGIN ? requestOrigin : ALLOWED_ORIGIN;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match, If-Modified-Since',
    'Access-Control-Expose-Headers': 'ETag, Last-Modified',
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

  // ── Step 3.5: Robots.txt Check ─────────────────────────────────
  const blockedByRobots = await isDisallowedByRobots(currentUrl);
  if (blockedByRobots) {
    return jsonError(
      403,
      'Upstream domain explicitly disallows crawler access via robots.txt (Disallow: /).',
      origin,
    );
  }

  // ── Step 4: Fetch with timeout + manual redirect handling ────────
  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT_MS,
  );

  // Extract conditional headers from client
  const ifNoneMatch = req.headers.get('if-none-match');
  const ifModifiedSince = req.headers.get('if-modified-since');

  const upstreamHeaders: Record<string, string> = {
    'User-Agent':
      'SmallWebReader/1.0 (+https://github.com/PECathon-2026/Team-PF7UDRPK)',
    Accept: ALLOWED_CONTENT_TYPES.join(', '),
  };

  if (ifNoneMatch) {
    upstreamHeaders['If-None-Match'] = ifNoneMatch;
  }
  if (ifModifiedSince) {
    upstreamHeaders['If-Modified-Since'] = ifModifiedSince;
  }

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
          headers: upstreamHeaders,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          return jsonError(504, 'Upstream request timed out after 15 seconds.', origin);
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

    // ── Step 4.5: Handle HTTP 304 Not Modified ───────────────────────
    if (upstreamResponse.status === 304) {
      const responseHeaders: Record<string, string> = {
        ...buildCorsHeaders(origin),
        'Cache-Control': 'no-store',
      };
      const etag = upstreamResponse.headers.get('etag');
      if (etag) responseHeaders['ETag'] = etag;
      const lastModified = upstreamResponse.headers.get('last-modified');
      if (lastModified) responseHeaders['Last-Modified'] = lastModified;

      return new NextResponse(null, {
        status: 304,
        headers: responseHeaders,
      });
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

    // ── Step 6: Bounded body read (10 MB cap) ─────────────────────────
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

    // ── Step 7: Return raw body with ETag and Last-Modified forwarded ─
    const responseHeaders: Record<string, string> = {
      ...buildCorsHeaders(origin),
      'Content-Type': upstreamContentType ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    const etag = upstreamResponse.headers.get('etag');
    if (etag) responseHeaders['ETag'] = etag;
    const lastModified = upstreamResponse.headers.get('last-modified');
    if (lastModified) responseHeaders['Last-Modified'] = lastModified;

    return new NextResponse(body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}
