/**
 * src/lib/server/pow.ts
 * ─────────────────────────────────────────────────────────────────
 * Proof-of-Work (Hashcash) challenge engine.
 * SERVER-ONLY — never import from client-side or browser code.
 *
 * Protocol (from MEMBER_C_SERVER_SECURITY.md):
 *   1. Server issues: { id, challenge, difficulty, expiresAt }
 *   2. Client computes nonce such that sha256(challenge + nonce)
 *      starts with "0".repeat(difficulty) in hex.
 *   3. Server verifies hash, expiry, and single-use constraint.
 *
 * Security properties:
 *   ✓  Cryptographically unpredictable challenge value (32 random bytes).
 *   ✓  Challenge IDs are UUIDs (unpredictable, unique).
 *   ✓  Expiry enforced server-side (default: 5 minutes).
 *   ✓  Replay protection: challenge is marked consumed after first valid use.
 *   ✓  Bounded store: oldest entries evicted when store exceeds MAX_STORE_SIZE.
 *   ✓  Input length caps prevent hash-DoS attacks during verification.
 *   ✓  Difficulty configurable via POW_DIFFICULTY env var (default: 4).
 *
 * Deployment note:
 *   The challenge store is in-process memory. In a multi-instance or
 *   serverless deployment, a request could generate a challenge on
 *   instance A and attempt verification on instance B. For a hackathon
 *   single-instance deployment this is acceptable. A shared Redis store
 *   would be required for multi-instance correctness.
 * ─────────────────────────────────────────────────────────────────
 */

import { createHash, randomBytes, randomUUID } from 'crypto';

// ─── Configuration ────────────────────────────────────────────────

/**
 * Number of leading hex zero characters required in a valid solution.
 * 4 zeros → expected ~65 536 SHA-256 attempts on average.
 * Configurable via POW_DIFFICULTY env var. Clamped to [1, 8].
 */
export const DIFFICULTY: number = (() => {
  const env = parseInt(process.env.POW_DIFFICULTY ?? '4', 10);
  if (Number.isNaN(env) || env < 1) return 4;
  if (env > 8) return 8;
  return env;
})();

/**
 * Challenge time-to-live in milliseconds.
 * Configurable via POW_CHALLENGE_TTL_SECONDS env var (default: 300 s = 5 min).
 */
export const CHALLENGE_TTL_MS: number = (() => {
  const env = parseInt(process.env.POW_CHALLENGE_TTL_SECONDS ?? '300', 10);
  if (Number.isNaN(env) || env < 10) return 300_000;
  return env * 1_000;
})();

/**
 * Maximum number of pending/consumed challenges held in memory.
 * Oldest entries are evicted when this ceiling is reached.
 * Prevents unbounded memory growth from a flood of challenge requests.
 */
const MAX_STORE_SIZE = 50_000;

/** Maximum allowed byte length for challenge ID input during verification. */
const MAX_CHALLENGE_ID_LENGTH = 64;

/** Maximum allowed byte length for nonce input during verification. */
const MAX_NONCE_LENGTH = 256;

// ─── In-memory challenge store ────────────────────────────────────

interface ChallengeRecord {
  /** The random hex challenge string sent to the client. */
  challenge: string;
  /** Unix timestamp (ms) after which the challenge is invalid. */
  expiresAt: number;
  /** True once the challenge has been successfully solved and consumed. */
  consumed: boolean;
}

/**
 * Map from challenge ID → ChallengeRecord.
 * Insertion order is preserved (ES2015+ Map), which enables O(1) eviction
 * of the oldest entries by deleting the first key.
 */
const challengeStore = new Map<string, ChallengeRecord>();

// ─── Store maintenance ────────────────────────────────────────────

/**
 * Evict the oldest entries when the store exceeds MAX_STORE_SIZE.
 * Also removes expired entries opportunistically.
 */
function pruneStore(): void {
  const now = Date.now();

  // First pass: remove expired entries (they can never be valid anyway)
  for (const [id, record] of challengeStore) {
    if (record.expiresAt < now) {
      challengeStore.delete(id);
    }
  }

  // Second pass: if still over limit, evict oldest (first inserted) entries
  while (challengeStore.size >= MAX_STORE_SIZE) {
    const oldestKey = challengeStore.keys().next().value;
    if (oldestKey !== undefined) {
      challengeStore.delete(oldestKey);
    } else {
      break;
    }
  }
}

// ─── Public types ─────────────────────────────────────────────────

/** The response shape sent to the client when a challenge is issued. */
export interface PowChallenge {
  /** Unique ID used to look up this challenge during verification. */
  id: string;
  /** Random hex string the client must combine with a nonce. */
  challenge: string;
  /** Number of leading '0' hex chars required in sha256(challenge + nonce). */
  difficulty: number;
  /** Unix timestamp (ms) after which this challenge is invalid. */
  expiresAt: number;
}

/** Reasons why challenge verification may fail. */
export type PowVerifyError =
  | 'MISSING_INPUT'
  | 'INPUT_TOO_LONG'
  | 'CHALLENGE_NOT_FOUND'
  | 'CHALLENGE_EXPIRED'
  | 'CHALLENGE_CONSUMED'
  | 'INVALID_SOLUTION';

export interface PowVerifySuccess {
  ok: true;
}

export interface PowVerifyFailure {
  ok: false;
  error: PowVerifyError;
  message: string;
}

export type PowVerifyResult = PowVerifySuccess | PowVerifyFailure;

// ─── generateChallenge ────────────────────────────────────────────

/**
 * Issue a new Proof-of-Work challenge.
 *
 * @returns A PowChallenge object to be sent to the client as JSON.
 *
 * Example response:
 *   {
 *     id: "550e8400-e29b-41d4-a716-446655440000",
 *     challenge: "a3f9c2...(64 hex chars)...",
 *     difficulty: 4,
 *     expiresAt: 1700000300000
 *   }
 */
export function generateChallenge(): PowChallenge {
  pruneStore(); // opportunistic cleanup before adding new entry

  const id = randomUUID();
  const challenge = randomBytes(32).toString('hex'); // 64 hex chars
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;

  challengeStore.set(id, { challenge, expiresAt, consumed: false });

  return { id, challenge, difficulty: DIFFICULTY, expiresAt };
}

// ─── verifyPoWChallenge ───────────────────────────────────────────

/**
 * Verify a client's Proof-of-Work solution.
 *
 * Called by Member D's /api/discovery/submit route via
 * validateSubmissionIntegrity() in security-helpers.ts.
 *
 * @param challengeId  The `id` from the original PowChallenge.
 * @param nonce        The nonce computed by the client.
 * @returns PowVerifyResult — check .ok before proceeding.
 *
 * Verification steps:
 *   1. Input presence and length bounds checked.
 *   2. Challenge ID looked up in the server-side store.
 *   3. Expiry checked against current time.
 *   4. Consumed flag checked (replay protection).
 *   5. SHA-256(challenge + nonce) compared against difficulty prefix.
 *   6. On success, challenge is atomically marked consumed.
 */
export function verifyPoWChallenge(
  challengeId: string,
  nonce: string,
): PowVerifyResult {
  // ── Input validation (bounds checks before any crypto work) ────
  if (!challengeId || !nonce) {
    return {
      ok: false,
      error: 'MISSING_INPUT',
      message: 'Both challengeId and nonce are required.',
    };
  }
  if (challengeId.length > MAX_CHALLENGE_ID_LENGTH) {
    return {
      ok: false,
      error: 'INPUT_TOO_LONG',
      message: 'Challenge ID exceeds maximum allowed length.',
    };
  }
  if (nonce.length > MAX_NONCE_LENGTH) {
    return {
      ok: false,
      error: 'INPUT_TOO_LONG',
      message: 'Nonce exceeds maximum allowed length.',
    };
  }

  // ── Challenge lookup ────────────────────────────────────────────
  const record = challengeStore.get(challengeId);
  if (!record) {
    return {
      ok: false,
      error: 'CHALLENGE_NOT_FOUND',
      message: 'Challenge not found. It may have expired and been evicted.',
    };
  }

  // ── Expiry check ────────────────────────────────────────────────
  if (Date.now() > record.expiresAt) {
    // Clean up expired record
    challengeStore.delete(challengeId);
    return {
      ok: false,
      error: 'CHALLENGE_EXPIRED',
      message: 'The PoW challenge has expired. Request a new one.',
    };
  }

  // ── Replay / reuse check ────────────────────────────────────────
  if (record.consumed) {
    return {
      ok: false,
      error: 'CHALLENGE_CONSUMED',
      message: 'This PoW challenge has already been used.',
    };
  }

  // ── Hash verification ───────────────────────────────────────────
  const hash = createHash('sha256')
    .update(record.challenge + nonce)
    .digest('hex');

  const requiredPrefix = '0'.repeat(DIFFICULTY);
  if (!hash.startsWith(requiredPrefix)) {
    return {
      ok: false,
      error: 'INVALID_SOLUTION',
      message: 'PoW solution is incorrect. The hash does not meet the difficulty requirement.',
    };
  }

  // ── Consume the challenge (atomic in single-threaded Node.js) ───
  // Node.js event loop is single-threaded; setting consumed = true here
  // and checking it above is race-condition-free within a single process.
  record.consumed = true;

  return { ok: true };
}

// ─── Utility: solve (for testing / client reference) ─────────────

/**
 * Compute a valid nonce for a given challenge string and difficulty.
 * This is a helper for tests and local development.
 * In production the client computes this in the browser.
 *
 * WARNING: This is CPU-intensive. Do not call in production server code.
 */
export function solveChallenge(challenge: string, difficulty: number): string {
  const prefix = '0'.repeat(difficulty);
  let nonce = 0;
  while (true) {
    const nonceStr = nonce.toString();
    const hash = createHash('sha256')
      .update(challenge + nonceStr)
      .digest('hex');
    if (hash.startsWith(prefix)) {
      return nonceStr;
    }
    nonce++;
  }
}

// ─── Store introspection (for tests only) ────────────────────────

/** @internal Exposed for test assertions only. */
export function _getChallengeStoreSize(): number {
  return challengeStore.size;
}

/** @internal Exposed for test cleanup only. */
export function _clearChallengeStore(): void {
  challengeStore.clear();
}

