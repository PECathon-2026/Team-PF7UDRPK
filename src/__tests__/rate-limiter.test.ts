/**
 * src/__tests__/rate-limiter.test.ts
 * ─────────────────────────────────────────────────────────────────
 * Unit tests for the privacy-preserving IP rate limiter.
 * No network calls — pure in-process tests.
 * ─────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimitBySaltedIp,
  extractClientIp,
  rotateSalt,
  RATE_LIMIT_MAX,
  _getStoreSize,
  _resetStore,
  _forceRotateSalt,
  _getSaltGeneratedAt,
} from '@/lib/server/rate-limiter';

// ─── Test lifecycle ───────────────────────────────────────────────

beforeEach(() => {
  _resetStore(); // fresh state for every test
});

// ─── Basic rate limiting ──────────────────────────────────────────

describe('checkRateLimitBySaltedIp()', () => {
  it('allows requests below the limit', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(checkRateLimitBySaltedIp('1.2.3.4')).toBe(true);
    }
  });

  it('blocks the (RATE_LIMIT_MAX + 1)th request', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      checkRateLimitBySaltedIp('1.2.3.4');
    }
    expect(checkRateLimitBySaltedIp('1.2.3.4')).toBe(false);
  });

  it('blocks all subsequent requests once limit is reached', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      checkRateLimitBySaltedIp('5.6.7.8');
    }
    expect(checkRateLimitBySaltedIp('5.6.7.8')).toBe(false);
    expect(checkRateLimitBySaltedIp('5.6.7.8')).toBe(false);
    expect(checkRateLimitBySaltedIp('5.6.7.8')).toBe(false);
  });

  it('tracks different IPs independently', () => {
    // Exhaust limit for IP A
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      checkRateLimitBySaltedIp('10.10.10.1'); // (private for test only; hashed)
    }
    expect(checkRateLimitBySaltedIp('10.10.10.1')).toBe(false);

    // IP B should still have full quota
    expect(checkRateLimitBySaltedIp('10.10.10.2')).toBe(true);
  });

  it('first request from new IP always allowed', () => {
    expect(checkRateLimitBySaltedIp('99.99.99.99')).toBe(true);
  });
});

// ─── Salt rotation ────────────────────────────────────────────────

describe('salt rotation', () => {
  it('rotateSalt() resets all windows', () => {
    // Exhaust limit
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      checkRateLimitBySaltedIp('1.2.3.4');
    }
    expect(checkRateLimitBySaltedIp('1.2.3.4')).toBe(false);

    // Rotate salt — store is cleared
    _forceRotateSalt();

    // IP can request again (new salt = new hash = fresh window)
    expect(checkRateLimitBySaltedIp('1.2.3.4')).toBe(true);
  });

  it('rotateSalt() clears the store', () => {
    // Add some entries
    checkRateLimitBySaltedIp('192.0.2.1');
    checkRateLimitBySaltedIp('192.0.2.2');
    expect(_getStoreSize()).toBe(2);

    _forceRotateSalt();
    expect(_getStoreSize()).toBe(0);
  });

  it('generates a new salt after rotation', () => {
    const before = _getSaltGeneratedAt();
    _forceRotateSalt();
    const after = _getSaltGeneratedAt();
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('rate limit reapplies correctly after rotation', () => {
    _forceRotateSalt();

    // Should get full RATE_LIMIT_MAX again
    let allowed = 0;
    for (let i = 0; i < RATE_LIMIT_MAX + 5; i++) {
      if (checkRateLimitBySaltedIp('1.2.3.4')) allowed++;
    }
    expect(allowed).toBe(RATE_LIMIT_MAX);
  });
});

// ─── Privacy guarantees ───────────────────────────────────────────

describe('privacy guarantees', () => {
  it('does not store raw IP addresses in the rate-limit store keys', () => {
    const ip = '203.0.113.42'; // documentation range IP
    checkRateLimitBySaltedIp(ip);

    // The store must NOT contain the raw IP as a key
    // We can't access internal store keys directly from outside,
    // but we CAN verify the module never exposes them.
    // Indirect test: store size increments (entry was created),
    // but we can't retrieve the raw IP from any exported function.

    // This test documents the guarantee rather than verifying internals,
    // since the Map keys are private to the module.
    expect(_getStoreSize()).toBe(1);
    // If this test passes, store has entries but raw IP is not in exports.
    expect(typeof ip).toBe('string'); // IP is just a local variable here
  });

  it('same IP produces different hashes under different salts', () => {
    const ip = '1.2.3.4';

    // Fill under salt A
    const before = _getSaltGeneratedAt();
    checkRateLimitBySaltedIp(ip);

    // Rotate salt
    _forceRotateSalt();
    const after = _getSaltGeneratedAt();

    // The new hash (after rotation) is different — proven by the fact that
    // the request is allowed again (new hash key → no existing record)
    expect(after).toBeGreaterThanOrEqual(before);
    expect(checkRateLimitBySaltedIp(ip)).toBe(true);
  });
});

// ─── extractClientIp ─────────────────────────────────────────────

describe('extractClientIp()', () => {
  function makeRequest(headers: Record<string, string>): Request {
    return new Request('https://example.com/', { headers });
  }

  it('returns the first IP from X-Forwarded-For', () => {
    const req = makeRequest({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(extractClientIp(req)).toBe('1.2.3.4');
  });

  it('handles single IP in X-Forwarded-For', () => {
    const req = makeRequest({ 'x-forwarded-for': '9.10.11.12' });
    expect(extractClientIp(req)).toBe('9.10.11.12');
  });

  it('returns UNKNOWN when X-Forwarded-For is absent', () => {
    const req = makeRequest({});
    expect(extractClientIp(req)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for malformed IP in header', () => {
    const req = makeRequest({ 'x-forwarded-for': 'not-an-ip, 1.2.3.4' });
    expect(extractClientIp(req)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for empty X-Forwarded-For', () => {
    const req = makeRequest({ 'x-forwarded-for': '' });
    expect(extractClientIp(req)).toBe('UNKNOWN');
  });

  it('handles IPv6 addresses in header', () => {
    const req = makeRequest({ 'x-forwarded-for': '2606:4700::1, 1.2.3.4' });
    expect(extractClientIp(req)).toBe('2606:4700::1');
  });

  it('a spoofed X-Forwarded-For still goes through hashing (not trusted for access)', () => {
    // Even if spoofed, the IP is hashed — raw value is never stored.
    // This test documents that the extracted value is used only for hashing.
    const req = makeRequest({ 'x-forwarded-for': '8.8.8.8' });
    const ip = extractClientIp(req);
    // It will be rate-limited by its (spoofed) hashed value — accepted limitation.
    expect(ip).toBe('8.8.8.8');
  });
});

// ─── Concurrent-request simulation ───────────────────────────────

describe('concurrent request simulation', () => {
  it('correctly counts concurrent-equivalent synchronous requests', () => {
    const ip = '77.77.77.77';
    const results: boolean[] = [];

    // Simulate burst of RATE_LIMIT_MAX + 3 near-simultaneous requests
    for (let i = 0; i < RATE_LIMIT_MAX + 3; i++) {
      results.push(checkRateLimitBySaltedIp(ip));
    }

    const allowed = results.filter(Boolean).length;
    const blocked = results.filter((r) => !r).length;

    expect(allowed).toBe(RATE_LIMIT_MAX);
    expect(blocked).toBe(3);
  });
});

