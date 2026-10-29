/**
 * src/__tests__/pow.test.ts
 * ─────────────────────────────────────────────────────────────────
 * Unit tests for the Proof-of-Work engine.
 * No network calls — pure in-process crypto tests.
 * ─────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateChallenge,
  verifyPoWChallenge,
  solveChallenge,
  DIFFICULTY,
  CHALLENGE_TTL_MS,
  _clearChallengeStore,
  _getChallengeStoreSize,
} from '@/lib/server/pow';
import { createHash } from 'crypto';

// ─── Helpers ──────────────────────────────────────────────────────

/** Produce a correct nonce for a challenge using the brute-force solver. */
function solve(challenge: string): string {
  return solveChallenge(challenge, DIFFICULTY);
}

/** Produce an intentionally wrong hash by appending junk to nonce. */
function wrongNonce(): string {
  return 'definitely-not-a-valid-nonce-12345678';
}

// ─── Test lifecycle ───────────────────────────────────────────────

beforeEach(() => {
  _clearChallengeStore();
});

afterEach(() => {
  _clearChallengeStore();
  vi.useRealTimers();
});

// ─── generateChallenge ────────────────────────────────────────────

describe('generateChallenge()', () => {
  it('returns the required fields', () => {
    const ch = generateChallenge();
    expect(ch).toHaveProperty('id');
    expect(ch).toHaveProperty('challenge');
    expect(ch).toHaveProperty('difficulty');
    expect(ch).toHaveProperty('expiresAt');
  });

  it('returns a 64-character hex challenge string', () => {
    const { challenge } = generateChallenge();
    expect(challenge).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the configured difficulty', () => {
    const { difficulty } = generateChallenge();
    expect(difficulty).toBe(DIFFICULTY);
  });

  it('expiresAt is in the future', () => {
    const now = Date.now();
    const { expiresAt } = generateChallenge();
    expect(expiresAt).toBeGreaterThan(now);
    expect(expiresAt).toBeLessThanOrEqual(now + CHALLENGE_TTL_MS + 100);
  });

  it('generates unique IDs for each challenge', () => {
    const ids = Array.from({ length: 50 }, () => generateChallenge().id);
    const unique = new Set(ids);
    expect(unique.size).toBe(50);
  });

  it('generates unique challenge values for each challenge', () => {
    const challenges = Array.from({ length: 20 }, () => generateChallenge().challenge);
    const unique = new Set(challenges);
    expect(unique.size).toBe(20);
  });

  it('adds to the challenge store', () => {
    const before = _getChallengeStoreSize();
    generateChallenge();
    expect(_getChallengeStoreSize()).toBe(before + 1);
  });
});

// ─── verifyPoWChallenge — valid solutions ─────────────────────────

describe('verifyPoWChallenge() — valid solutions', () => {
  it('accepts a correct nonce', () => {
    const { id, challenge } = generateChallenge();
    const nonce = solve(challenge);
    const result = verifyPoWChallenge(id, nonce);
    expect(result.ok).toBe(true);
  });

  it('hash of correct solution starts with required prefix', () => {
    const { id, challenge } = generateChallenge();
    const nonce = solve(challenge);
    const hash = createHash('sha256').update(challenge + nonce).digest('hex');
    expect(hash.startsWith('0'.repeat(DIFFICULTY))).toBe(true);
    // Also verify we accept it
    const result = verifyPoWChallenge(id, nonce);
    expect(result.ok).toBe(true);
  });
});

// ─── verifyPoWChallenge — invalid / rejected inputs ───────────────

describe('verifyPoWChallenge() — rejection cases', () => {
  it('rejects missing challengeId', () => {
    const result = verifyPoWChallenge('', 'some-nonce');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('MISSING_INPUT');
  });

  it('rejects missing nonce', () => {
    const { id } = generateChallenge();
    const result = verifyPoWChallenge(id, '');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('MISSING_INPUT');
  });

  it('rejects unknown challengeId', () => {
    const result = verifyPoWChallenge('00000000-0000-0000-0000-000000000000', 'nonce');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('CHALLENGE_NOT_FOUND');
  });

  it('rejects incorrect nonce', () => {
    const { id } = generateChallenge();
    const result = verifyPoWChallenge(id, wrongNonce());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('INVALID_SOLUTION');
  });

  it('rejects expired challenge', () => {
    vi.useFakeTimers();
    const { id, challenge } = generateChallenge();
    const nonce = solve(challenge);

    // Advance time past the TTL
    vi.advanceTimersByTime(CHALLENGE_TTL_MS + 1_000);

    const result = verifyPoWChallenge(id, nonce);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('CHALLENGE_EXPIRED');
  });

  it('rejects challengeId that exceeds max length', () => {
    const longId = 'a'.repeat(200);
    const result = verifyPoWChallenge(longId, 'nonce');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('INPUT_TOO_LONG');
  });

  it('rejects nonce that exceeds max length', () => {
    const { id } = generateChallenge();
    const longNonce = 'n'.repeat(300);
    const result = verifyPoWChallenge(id, longNonce);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('INPUT_TOO_LONG');
  });
});

// ─── Replay protection ────────────────────────────────────────────

describe('verifyPoWChallenge() — replay protection', () => {
  it('rejects a second submission of the same valid solution', () => {
    const { id, challenge } = generateChallenge();
    const nonce = solve(challenge);

    const first = verifyPoWChallenge(id, nonce);
    expect(first.ok).toBe(true);

    const second = verifyPoWChallenge(id, nonce);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('CHALLENGE_CONSUMED');
  });

  it('cannot reuse challenge across different callers (simulated concurrency)', () => {
    const { id, challenge } = generateChallenge();
    const nonce = solve(challenge);

    // Node.js is single-threaded; simulate concurrent verification by
    // calling synchronously in rapid succession.
    const results = [
      verifyPoWChallenge(id, nonce),
      verifyPoWChallenge(id, nonce),
      verifyPoWChallenge(id, nonce),
    ];

    const successes = results.filter((r) => r.ok);
    const failures  = results.filter((r) => !r.ok);

    expect(successes).toHaveLength(1);  // exactly one winner
    expect(failures).toHaveLength(2);   // rest are consumed/rejected
  });

  it('rejected wrong nonce does NOT consume the challenge', () => {
    const { id, challenge } = generateChallenge();

    // Submit wrong nonce — should fail
    const bad = verifyPoWChallenge(id, wrongNonce());
    expect(bad.ok).toBe(false);

    // Submit correct nonce — should still succeed
    const nonce = solve(challenge);
    const good = verifyPoWChallenge(id, nonce);
    expect(good.ok).toBe(true);
  });
});

// ─── Challenge tamper detection ───────────────────────────────────

describe('verifyPoWChallenge() — tamper detection', () => {
  it('rejects a nonce computed for a different challenge', () => {
    const ch1 = generateChallenge();
    const ch2 = generateChallenge();

    // Solve ch2, try to use it for ch1
    const nonce = solve(ch2.challenge);
    const result = verifyPoWChallenge(ch1.id, nonce);
    expect(result.ok).toBe(false);
  });

  it('rejects solution with modified challenge in store (store lookup by ID)', () => {
    // Simulate: attacker attempts to look up ch by a manipulated ID
    // The ID they supply won't exist in the store
    const { challenge } = generateChallenge();
    const nonce = solve(challenge);
    const result = verifyPoWChallenge('tampered-id', nonce);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('CHALLENGE_NOT_FOUND');
  });
});

