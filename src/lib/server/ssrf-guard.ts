/**
 * ssrf-guard.ts
 * ─────────────────────────────────────────────────────────────────
 * Reusable SSRF-defense utilities for the Small Web Reader proxy.
 * SERVER-ONLY — never import from client-side or browser code.
 *
 * Responsibilities:
 *  1. URL scheme & credential validation
 *  2. IPv4 / IPv6 address classification using ipaddr.js
 *  3. DNS resolution + per-address validation
 *  4. Redirect-target re-validation
 *
 * Security model:
 *  - Fail-closed: any ambiguity is treated as a rejection.
 *  - Resolves ALL DNS addresses; rejects if ANY is forbidden.
 *  - IPv4-mapped IPv6 addresses are unwrapped and checked as IPv4.
 *  - IPv6 zone identifiers are rejected outright.
 *  - Cloud metadata hostnames are blocked by name AND by IP range.
 *
 * Known limitation (TOCTOU / DNS rebinding):
 *  DNS is resolved at validation time. The HTTP connection that follows
 *  uses the hostname, not a pinned resolved IP, so a narrow TOCTOU
 *  window remains. Node.js's built-in DNS TTL cache provides partial
 *  mitigation. Full connection-pinning requires a custom TCP stack and
 *  is documented as a residual risk.
 * ─────────────────────────────────────────────────────────────────
 */

import * as dns from 'dns/promises';
import * as ipaddr from 'ipaddr.js';

// ─── Constants ────────────────────────────────────────────────────

/** Only these URL schemes are permitted through the proxy. */
const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/**
 * Hostnames that must be blocked by name (secondary defense;
 * primary defense is always the IP-range check).
 */
const BLOCKED_HOSTNAMES = new Set([
  '169.254.169.254',           // AWS/GCP/Azure IMDS (IPv4 link-local)
  '[::ffff:169.254.169.254]',  // Same, IPv6-mapped form
  'metadata.google.internal',  // GCP metadata hostname
  'metadata',                  // bare metadata label
  'instance-data',             // Ubuntu cloud-init metadata
]);

/** Cap on DNS-resolved addresses inspected per hostname (DoS guard). */
const MAX_DNS_ADDRESSES = 32;

// ─── Types ────────────────────────────────────────────────────────

export type UrlValidationError =
  | 'INVALID_URL'
  | 'DISALLOWED_SCHEME'
  | 'EMBEDDED_CREDENTIALS'
  | 'BLOCKED_HOSTNAME'
  | 'EMPTY_HOSTNAME'
  | 'IPV6_ZONE_ID';

export type DnsValidationError =
  | 'DNS_RESOLUTION_FAILED'
  | 'NO_ADDRESSES_RESOLVED'
  | 'FORBIDDEN_IP_RANGE'
  | 'ALL_ADDRESSES_FORBIDDEN';

export interface ValidationSuccess {
  ok: true;
  parsedUrl: URL;
}

export interface ValidationFailure {
  ok: false;
  error: UrlValidationError | DnsValidationError;
  message: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

// ─── URL structural validation ────────────────────────────────────

/**
 * Parse and structurally validate a raw URL string.
 * Does NOT perform DNS resolution — call resolveAndValidate() after this.
 *
 * Rejects:
 *  • Malformed URLs
 *  • Non-http/https schemes  (file:, ftp:, javascript:, data:, …)
 *  • Embedded username/password credentials
 *  • Empty or missing hostnames
 *  • IPv6 zone identifiers  (%25 or bare % in hostname)
 *  • Explicitly blocked cloud-metadata hostnames
 */
export function validateUrl(rawUrl: string): ValidationResult {
  // ── 1. Parse ────────────────────────────────────────────────────
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      ok: false,
      error: 'INVALID_URL',
      message: 'The provided URL is malformed and cannot be parsed.',
    };
  }

  // ── 2. Scheme ───────────────────────────────────────────────────
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return {
      ok: false,
      error: 'DISALLOWED_SCHEME',
      message: `URL scheme "${parsed.protocol}" is not permitted. Only http: and https: are allowed.`,
    };
  }

  // ── 3. No embedded credentials ──────────────────────────────────
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      error: 'EMBEDDED_CREDENTIALS',
      message: 'URLs with embedded credentials (user:password@host) are not permitted.',
    };
  }

  // ── 4. Non-empty hostname ───────────────────────────────────────
  const hostname = parsed.hostname;
  if (!hostname) {
    return {
      ok: false,
      error: 'EMPTY_HOSTNAME',
      message: 'URL has no hostname.',
    };
  }

  // ── 5. Reject IPv6 zone identifiers ────────────────────────────
  // Zone IDs (e.g. fe80::1%eth0) survive URL-encoding as %25.
  // They are OS-specific, ambiguous, and can confuse ipaddr.js.
  if (hostname.includes('%')) {
    return {
      ok: false,
      error: 'IPV6_ZONE_ID',
      message: 'IPv6 zone identifiers in hostnames are not permitted.',
    };
  }

  // ── 6. Blocked hostname names ───────────────────────────────────
  const normalizedHost = hostname.toLowerCase().replace(/\.$/, ''); // strip trailing dot
  if (BLOCKED_HOSTNAMES.has(normalizedHost)) {
    return {
      ok: false,
      error: 'BLOCKED_HOSTNAME',
      message: `Access to hostname "${hostname}" is forbidden.`,
    };
  }

  return { ok: true, parsedUrl: parsed };
}

// ─── IP address classification ────────────────────────────────────

/**
 * Returns true if the IP address string falls in any forbidden range.
 *
 * Forbidden IPv4 ranges:
 *  127.0.0.0/8     — loopback
 *  10.0.0.0/8      — private A
 *  172.16.0.0/12   — private B
 *  192.168.0.0/16  — private C
 *  169.254.0.0/16  — link-local (includes 169.254.169.254 IMDS)
 *  100.64.0.0/10   — carrier-grade NAT (RFC 6598)
 *  0.0.0.0/8       — unspecified / this-network
 *  192.0.2.0/24    — documentation (TEST-NET-1)
 *  198.51.100.0/24 — documentation (TEST-NET-2)
 *  203.0.113.0/24  — documentation (TEST-NET-3)
 *  224.0.0.0/4     — multicast
 *  240.0.0.0/4     — reserved
 *  255.255.255.255 — broadcast
 *
 * Forbidden IPv6 ranges:
 *  ::1/128         — loopback
 *  ::/128          — unspecified
 *  fe80::/10       — link-local
 *  fc00::/7        — unique-local (ULA)
 *  ::ffff:0:0/96   — IPv4-mapped (unwrapped and re-checked as IPv4)
 *  2001:db8::/32   — documentation
 *  ff00::/8        — multicast
 */
export function isAddressForbidden(ipString: string): boolean {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;

  try {
    addr = ipaddr.parse(ipString);
  } catch {
    // Unparseable address — fail closed
    return true;
  }

  // Unwrap IPv4-mapped IPv6 (::ffff:192.168.1.1 → 192.168.1.1)
  if (addr.kind() === 'ipv6') {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      return isAddressForbidden(v6.toIPv4Address().toString());
    }
  }

  const range = addr.range();

  /**
   * ipaddr.js named ranges that are forbidden.
   * Reference: https://github.com/whitequark/ipaddr.js#ipv4-ranges
   */
  const FORBIDDEN_RANGES = new Set([
    // IPv4
    'loopback',           // 127.0.0.0/8
    'private',            // 10/8, 172.16/12, 192.168/16
    'linkLocal',          // 169.254.0.0/16
    'carrierGradeNat',    // 100.64.0.0/10
    'broadcast',          // 255.255.255.255
    'unspecified',        // 0.0.0.0
    'documentation',      // 192.0.2/24, 198.51.100/24, 203.0.113/24
    'multicast',          // 224.0.0.0/4
    'reserved',           // 240.0.0.0/4 and other reserved
    // IPv6
    'uniqueLocal',        // fc00::/7
    'ipv4Mapped',         // ::ffff:0:0/96 (belt-and-suspenders; also unwrapped above)
    'rfc6145',            // ::ffff:0:0:0/96  (IPv4-translated)
    'rfc6052',            // 64:ff9b::/96    (NAT64)
    'teredo',             // 2001::/32
    '6to4',               // 2002::/16
    // multicast is shared name across both protocol versions
  ]);

  return FORBIDDEN_RANGES.has(range);
}

// ─── DNS resolution + validation ──────────────────────────────────

/**
 * Resolve a hostname via DNS and validate every returned IP address.
 *
 * Behavior:
 *  - If the input is a raw IP literal, validate it directly without DNS.
 *  - Otherwise performs dns.promises.lookup(hostname, { all: true }).
 *  - Rejects if ANY resolved address falls in a forbidden range.
 *  - Limits inspected addresses to MAX_DNS_ADDRESSES to prevent DoS.
 */
export async function resolveAndValidate(hostname: string): Promise<ValidationResult> {
  // Strip IPv6 brackets from literals: [::1] → ::1
  const cleanHost =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;

  // Direct IP literal — skip DNS, check inline
  if (ipaddr.isValid(cleanHost)) {
    if (isAddressForbidden(cleanHost)) {
      return {
        ok: false,
        error: 'FORBIDDEN_IP_RANGE',
        message: `IP address "${cleanHost}" is in a forbidden range.`,
      };
    }
    // Reconstruct parsedUrl just to satisfy the return type
    const scheme = 'http:'; // scheme doesn't matter for caller — they have original URL
    return { ok: true, parsedUrl: new URL(`${scheme}//${hostname}/`) };
  }

  // DNS resolution
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.lookup(cleanHost, { all: true });
  } catch (err) {
    return {
      ok: false,
      error: 'DNS_RESOLUTION_FAILED',
      message: `DNS resolution failed for "${hostname}": ${(err as NodeJS.ErrnoException).message}`,
    };
  }

  if (!addresses || addresses.length === 0) {
    return {
      ok: false,
      error: 'NO_ADDRESSES_RESOLVED',
      message: `No addresses resolved for "${hostname}".`,
    };
  }

  // Check every address (up to cap)
  const toCheck = addresses.slice(0, MAX_DNS_ADDRESSES);
  for (const { address } of toCheck) {
    if (isAddressForbidden(address)) {
      return {
        ok: false,
        error: 'FORBIDDEN_IP_RANGE',
        message: `Hostname "${hostname}" resolves to a forbidden address (${address}).`,
      };
    }
  }

  return { ok: true, parsedUrl: new URL(`http://${hostname}/`) };
}

// ─── Redirect-target re-validation ───────────────────────────────

/**
 * Validate a redirect Location header before following it.
 * Applies the same URL + DNS checks as the original request.
 *
 * @param location  Raw Location header value from upstream.
 * @param baseUrl   The URL that produced the redirect (for relative resolution).
 * @param hopNumber Current 1-based hop count.
 * @param maxHops   Reject when hopNumber exceeds this.
 */
export async function validateRedirectTarget(
  location: string,
  baseUrl: URL,
  hopNumber: number,
  maxHops: number,
): Promise<ValidationResult> {
  if (hopNumber > maxHops) {
    return {
      ok: false,
      error: 'INVALID_URL',
      message: `Redirect chain exceeded the limit of ${maxHops} hops.`,
    };
  }

  // Resolve relative Location values against the request base URL
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(location, baseUrl);
  } catch {
    return {
      ok: false,
      error: 'INVALID_URL',
      message: `Redirect Location "${location}" could not be parsed.`,
    };
  }

  // Full URL structural validation
  const urlResult = validateUrl(redirectUrl.toString());
  if (!urlResult.ok) return urlResult;

  // DNS + IP validation for the redirect target
  const dnsResult = await resolveAndValidate(redirectUrl.hostname);
  if (!dnsResult.ok) return dnsResult;

  return { ok: true, parsedUrl: redirectUrl };
}

