/**
 * src/lib/server/rate-limiter.ts
 * ─────────────────────────────────────────────────────────────────
 * Privacy-preserving salted IP rate limiter.
 * SERVER-ONLY — never import from client-side or browser code.
 *
 * Policy (from MEMBER_C_SERVER_SECURITY.md):
 *   Max 10 anonymous batch submissions per hour per salted IP hash.
 *
 * Privacy guarantees:
 *   ✓  Raw IP addresses are NEVER stored, logged, or persisted anywhere.
 *   ✓  Salt rotates every hour via crypto.randomUUID().
 *   ✓  On salt rotation the rate-limit store is cleared — old hashes
 *      become cryptographically unlinkable to the IPs that produced them.
 *   ✓  Hash function: SHA-256(ip + ":" + salt) — collision-resistant,
 *      one-way, and parameterized by the secret salt.
 *
 * Privacy limitation (documented):
 *   Salt rotation resets all windows. An IP that exhausted 9/10 of
 *   its quota just before rotation gets a fresh 10/10 after rotation.
 *   This is the spec-mandated tradeoff (privacy over perfect continuity).
 *
 * IP source limitation (documented):
 *   The spec instructs use of X-Forwarded-For header. This is only
 *   trustworthy when the application sits behind a known reverse proxy.
 *   Without proxy-trust validation, a client could spoof this header.
 *   The implementation validates that the extracted value is a parseable
 *   IP address; if not, it falls back to a sentinel value.
 *
 * Deployment limitation (documented):
 *   The rate-limit store is in-process memory. Multiple server instances
 *   (horizontal scaling, serverless cold starts) each maintain independent
 *   stores, so the effective limit per IP is (10 × number of instances).
 *   A Redis-based shared store is the recommended upgrade path.
 * ─────────────────────────────────────────────────────────────────
 */

import { createHash, randomUUID } from 'crypto';
import * as ipaddr from 'ipaddr.js';

// ─── Configuration ────────────────────────────────────────────────

/** Maximum requests allowed per IP hash per window. From spec: 10. */
export const RATE_LIMIT_MAX = 10;

/** Salt rotation interval in milliseconds: 1 hour. */
export const SALT_ROTATION_INTERVAL_MS = 60 * 60 * 1_000;

/**
 * Sentinel value used when a client IP cannot be determined.
 * All requests without a valid IP share this bucket — effectively
 * rate-limiting the "unknown IP" pool as a single entity.
 */
const UNKNOWN_IP_SENTINEL = 'UNKNOWN';

// ─── Salt state ───────────────────────────────────────────────────

interface SaltState {
  salt: string;
  /** Unix timestamp (ms) when this salt was generated. */
  generatedAt: number;
}

let currentSaltState: SaltState = {
  salt: randomUUID(),
  generatedAt: Date.now(),
};

// ─── Rate-limit store ─────────────────────────────────────────────

interface WindowRecord {
  /** Number of requests in the current window. */
  count: number;
  /** Unix timestamp (ms) when this window started. */
  windowStart: number;
}

/**
 * Map from salted IP hash → WindowRecord.
 * Cleared on every salt rotation (old hashes are unlinkable after rotation).
 */
let rateLimitStore = new Map<string, WindowRecord>();

// ─── Salt rotation ────────────────────────────────────────────────

/**
 * Rotate the salt and clear the rate-limit store.
 * Called automatically every SALT_ROTATION_INTERVAL_MS.
 *
 * Effect: all previous ipHash keys become invalid (the salt that produced
 * them is discarded), so stored entries are cryptographically unlinkable
 * to the IPs that generated them. The cleared store starts fresh.
 *
 * Privacy note: no IP addresses were ever stored — only their hashes.
 * After rotation those hashes are orphaned and memory is reclaimed.
 */
export function rotateSalt(): void {
  currentSaltState = {
    salt: randomUUID(),
    generatedAt: Date.now(),
  };
  rateLimitStore = new Map(); // discard all previous hashed records
}

// ─── Automatic rotation timer ─────────────────────────────────────

// In Node.js server environments, setInterval keeps the process alive.
// We use unref() so it doesn't block process exit during tests.
const rotationTimer = setInterval(rotateSalt, SALT_ROTATION_INTERVAL_MS);
if (typeof rotationTimer.unref === 'function') {
  rotationTimer.unref();
}

// ─── IP extraction ────────────────────────────────────────────────

/**
 * Extract and validate a client IP address from a Next.js Request.
 *
 * Strategy (per spec):
 *   1. Read X-Forwarded-For header; take the first (leftmost) value.
 *   2. Validate it is a parseable IP address via ipaddr.js.
 *   3. Fall back to UNKNOWN_IP_SENTINEL if absent or invalid.
 *
 * Limitation: X-Forwarded-For can be spoofed unless the server sits
 * behind a trusted reverse proxy that strips/overwrites the header.
 * Documented as a residual risk in the threat model.
 *
 * Raw IP is used transiently only for hashing — it is never stored.
 */
export function extractClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (!forwarded) return UNKNOWN_IP_SENTINEL;

  // Take first IP from comma-separated list (leftmost = original client)
  const candidate = forwarded.split(',')[0].trim();
  if (!candidate) return UNKNOWN_IP_SENTINEL;

  // Validate it is a real IP address (prevents header-injection attacks)
  try {
    ipaddr.parse(candidate);
    return candidate; // valid — use as-is (for hashing only)
  } catch {
    return UNKNOWN_IP_SENTINEL;
  }
}

// ─── IP hashing ───────────────────────────────────────────────────

/**
 * Derive a privacy-preserving rate-limit key from a raw IP address.
 *
 * Hash function: SHA-256(ip + ":" + salt)
 * The raw IP is used only within this function call and is never stored.
 *
 * @internal Not exported to discourage direct use; use checkRateLimitBySaltedIp.
 */
function hashIp(ip: string): string {
  return createHash('sha256')
    .update(ip + ':' + currentSaltState.salt)
    .digest('hex');
}

// ─── Rate-limit check ─────────────────────────────────────────────

/**
 * Check whether the given raw IP address is within its rate limit.
 *
 * The raw IP is hashed immediately; it is never stored in any data
 * structure, logged, or passed outside this function.
 *
 * @param ip  Raw IP address string (transient — hashed and discarded).
 * @returns   true  → request is within limit, allow it.
 *            false → limit exceeded, respond with 429.
 */
export function checkRateLimitBySaltedIp(ip: string): boolean {
  const ipHash = hashIp(ip);
  const now = Date.now();

  const existing = rateLimitStore.get(ipHash);

  if (!existing) {
    // First request from this (hash of) IP in this salt window
    rateLimitStore.set(ipHash, { count: 1, windowStart: now });
    return true;
  }

  // Fixed window aligned to salt generation time.
  // The window resets when the salt rotates (store is cleared).
  if (existing.count < RATE_LIMIT_MAX) {
    existing.count++;
    return true;
  }

  // Limit exceeded
  return false;
}

// ─── Store introspection (for tests only) ────────────────────────

/** @internal Exposed for test assertions only — returns current store size. */
export function _getStoreSize(): number {
  return rateLimitStore.size;
}

/** @internal Exposed for test setup — returns current salt generation time. */
export function _getSaltGeneratedAt(): number {
  return currentSaltState.generatedAt;
}

/** @internal Force salt rotation in tests without waiting for the timer. */
export function _forceRotateSalt(): void {
  rotateSalt();
}

/** @internal Full store reset for test isolation. */
export function _resetStore(): void {
  rateLimitStore = new Map();
  currentSaltState = { salt: randomUUID(), generatedAt: Date.now() };
}

