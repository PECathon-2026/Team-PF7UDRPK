/**
 * src/__tests__/security-helpers.test.ts
 * ─────────────────────────────────────────────────────────────────
 * Integration tests for the Member D integration helper.
 * ─────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validateSubmissionIntegrity, type PoWSolution } from '@/lib/server/security-helpers';
import { generateChallenge, solveChallenge, DIFFICULTY, _clearChallengeStore } from '@/lib/server/pow';
import { _resetStore } from '@/lib/server/rate-limiter';
import { RATE_LIMIT_MAX } from '@/lib/server/rate-limiter';

// ─── Helpers ──────────────────────────────────────────────────────

function makeRequest(ip?: string): Request {
  const headers: Record<string, string> = {};
  if (ip) headers['x-forwarded-for'] = ip;
  return new Request('https://example.com/api/discovery/submit', {
    method: 'POST',
    headers,
  });
}

function validSolution(): PoWSolution & { _challenge: string; _id: string } {
  const { id, challenge } = generateChallenge();
  const nonce = solveChallenge(challenge, DIFFICULTY);
  return { challengeId: id, nonce, _challenge: challenge, _id: id };
}

// ─── Test lifecycle ───────────────────────────────────────────────

beforeEach(() => {
  _clearChallengeStore();
  _resetStore();
});

// ─── Happy path ───────────────────────────────────────────────────

describe('validateSubmissionIntegrity() — success path', () => {
  it('returns ok:true for a valid PoW solution within rate limit', async () => {
    const sol = validSolution();
    const req = makeRequest('1.2.3.4');
    const result = await validateSubmissionIntegrity(req, {
      challengeId: sol.challengeId,
      nonce: sol.nonce,
    });
    expect(result.ok).toBe(true);
  });
});

// ─── Missing input ────────────────────────────────────────────────

describe('validateSubmissionIntegrity() — missing input', () => {
  it('rejects null powSolution', async () => {
    const req = makeRequest('1.2.3.4');
    const result = await validateSubmissionIntegrity(req, null as unknown as PoWSolution);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(400);
      expect(result.code).toBe('MISSING_POW');
    }
  });

  it('rejects missing challengeId', async () => {
    const req = makeRequest('1.2.3.4');
    const result = await validateSubmissionIntegrity(req, {
      challengeId: '',
      nonce: 'some-nonce',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(400);
  });

  it('rejects missing nonce', async () => {
    const sol = validSolution();
    const req = makeRequest('1.2.3.4');
    const result = await validateSubmissionIntegrity(req, {
      challengeId: sol.challengeId,
      nonce: '',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(400);
  });
});

// ─── Rate limiting ────────────────────────────────────────────────

describe('validateSubmissionIntegrity() — rate limiting', () => {
  it('returns 429 when IP exceeds rate limit', async () => {
    const ip = '55.55.55.55';

    // Exhaust the rate limit with valid solutions
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const sol = validSolution();
      await validateSubmissionIntegrity(makeRequest(ip), {
        challengeId: sol.challengeId,
        nonce: sol.nonce,
      });
    }

    // Next request should be rate-limited
    const sol = validSolution();
    const result = await validateSubmissionIntegrity(makeRequest(ip), {
      challengeId: sol.challengeId,
      nonce: sol.nonce,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(429);
      expect(result.code).toBe('RATE_LIMITED');
    }
  });

  it('rate limit applies per IP — different IPs are independent', async () => {
    const ip1 = '1.1.1.1';
    const ip2 = '2.2.2.2';

    // Exhaust ip1
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const sol = validSolution();
      await validateSubmissionIntegrity(makeRequest(ip1), {
        challengeId: sol.challengeId,
        nonce: sol.nonce,
      });
    }

    // ip2 should still be allowed
    const sol = validSolution();
    const result = await validateSubmissionIntegrity(makeRequest(ip2), {
      challengeId: sol.challengeId,
      nonce: sol.nonce,
    });
    expect(result.ok).toBe(true);
  });
});

// ─── PoW verification failures ───────────────────────────────────

describe('validateSubmissionIntegrity() — PoW failures', () => {
  it('returns 422 for wrong nonce', async () => {
    const { id } = generateChallenge();
    const req = makeRequest('1.2.3.4');
    const result = await validateSubmissionIntegrity(req, {
      challengeId: id,
      nonce: 'completely-wrong-nonce',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(422);
      expect(result.code).toBe('INVALID_SOLUTION');
    }
  });

  it('returns 422 for unknown challenge ID', async () => {
    const req = makeRequest('1.2.3.4');
    const result = await validateSubmissionIntegrity(req, {
      challengeId: '00000000-0000-0000-0000-000000000000',
      nonce: 'any-nonce',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(422);
      expect(result.code).toBe('CHALLENGE_NOT_FOUND');
    }
  });

  it('returns 422 for replayed (consumed) challenge', async () => {
    const sol = validSolution();
    const req1 = makeRequest('1.2.3.4');
    const req2 = makeRequest('1.2.3.4');

    // First use: success
    const r1 = await validateSubmissionIntegrity(req1, {
      challengeId: sol.challengeId,
      nonce: sol.nonce,
    });
    expect(r1.ok).toBe(true);

    // Replay: should fail
    const r2 = await validateSubmissionIntegrity(req2, {
      challengeId: sol.challengeId,
      nonce: sol.nonce,
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.httpStatus).toBe(422);
      expect(r2.code).toBe('CHALLENGE_CONSUMED');
    }
  });
});

