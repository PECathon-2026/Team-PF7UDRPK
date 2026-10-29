/**
 * src/__tests__/ssrf-guard.test.ts
 * ─────────────────────────────────────────────────────────────────
 * Unit tests for the SSRF-guard utilities.
 * All DNS calls are mocked — no real network requests are made.
 * ─────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateUrl,
  isAddressForbidden,
  resolveAndValidate,
  validateRedirectTarget,
} from '@/lib/server/ssrf-guard';

// ─── Mock dns/promises ────────────────────────────────────────────

vi.mock('dns/promises', () => ({
  lookup: vi.fn(),
}));

import * as dns from 'dns/promises';
const mockLookup = vi.mocked(dns.lookup);

// ─── validateUrl ──────────────────────────────────────────────────

describe('validateUrl()', () => {
  describe('valid URLs', () => {
    it('accepts a plain http URL', () => {
      const result = validateUrl('http://example.com/feed');
      expect(result.ok).toBe(true);
    });

    it('accepts a plain https URL', () => {
      const result = validateUrl('https://danluu.com/atom.xml');
      expect(result.ok).toBe(true);
    });

    it('accepts https URL with path and query', () => {
      const result = validateUrl('https://simonwillison.net/feeds/everything/?format=rss');
      expect(result.ok).toBe(true);
    });
  });

  describe('invalid schemes', () => {
    it.each([
      ['file://etc/passwd'],
      ['ftp://example.com'],
      ['javascript:alert(1)'],
      ['data:text/html,<h1>hi</h1>'],
      ['gopher://example.com'],
    ])('rejects %s', (url) => {
      const result = validateUrl(url);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('DISALLOWED_SCHEME');
      }
    });
  });

  describe('malformed URLs', () => {
    it('rejects completely invalid URL', () => {
      const result = validateUrl('not-a-url');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('INVALID_URL');
    });

    it('rejects empty string', () => {
      const result = validateUrl('');
      expect(result.ok).toBe(false);
    });

    it('rejects URL with no hostname', () => {
      const result = validateUrl('https:///path');
      expect(result.ok).toBe(false);
    });
  });

  describe('embedded credentials', () => {
    it('rejects URL with username', () => {
      const result = validateUrl('https://user@example.com');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('EMBEDDED_CREDENTIALS');
    });

    it('rejects URL with username:password', () => {
      const result = validateUrl('https://user:pass@example.com');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('EMBEDDED_CREDENTIALS');
    });
  });

  describe('IPv6 zone identifiers', () => {
    it('rejects IPv6 with zone ID (%25)', () => {
      const result = validateUrl('http://[fe80::1%25eth0]/');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('IPV6_ZONE_ID');
    });
  });

  describe('blocked hostnames', () => {
    it('rejects 169.254.169.254 (AWS IMDS)', () => {
      const result = validateUrl('http://169.254.169.254/latest/meta-data/');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('BLOCKED_HOSTNAME');
    });

    it('rejects metadata.google.internal', () => {
      const result = validateUrl('http://metadata.google.internal/computeMetadata/v1/');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('BLOCKED_HOSTNAME');
    });
  });
});

// ─── isAddressForbidden ───────────────────────────────────────────

describe('isAddressForbidden()', () => {
  describe('forbidden IPv4 addresses', () => {
    it.each([
      ['127.0.0.1',       'loopback'],
      ['127.255.255.255', 'loopback end'],
      ['10.0.0.1',        'private A'],
      ['10.255.255.255',  'private A end'],
      ['172.16.0.1',      'private B start'],
      ['172.31.255.255',  'private B end'],
      ['192.168.0.1',     'private C'],
      ['192.168.1.100',   'private C'],
      ['169.254.0.1',     'link-local'],
      ['169.254.169.254', 'AWS IMDS'],
      ['100.64.0.1',      'CGNAT start'],
      ['100.127.255.255', 'CGNAT end'],
      ['0.0.0.0',         'unspecified'],
      ['192.0.2.1',       'documentation TEST-NET-1'],
      ['198.51.100.1',    'documentation TEST-NET-2'],
      ['203.0.113.1',     'documentation TEST-NET-3'],
      ['224.0.0.1',       'multicast'],
      ['255.255.255.255', 'broadcast'],
    ])('blocks %s (%s)', (ip) => {
      expect(isAddressForbidden(ip)).toBe(true);
    });
  });

  describe('allowed IPv4 addresses', () => {
    it.each([
      ['1.1.1.1',         'Cloudflare DNS'],
      ['8.8.8.8',         'Google DNS'],
      ['93.184.216.34',   'example.com'],
      ['151.101.1.67',    'fastly CDN'],
    ])('allows %s (%s)', (ip) => {
      expect(isAddressForbidden(ip)).toBe(false);
    });
  });

  describe('forbidden IPv6 addresses', () => {
    it.each([
      ['::1',                     'loopback'],
      ['fe80::1',                 'link-local'],
      ['fc00::1',                 'unique-local'],
      ['fd00::1',                 'unique-local ULA'],
      ['ff02::1',                 'multicast'],
      ['::ffff:192.168.1.1',      'IPv4-mapped private'],
      ['::ffff:127.0.0.1',        'IPv4-mapped loopback'],
      ['::ffff:169.254.169.254',  'IPv4-mapped IMDS'],
      ['::ffff:10.0.0.1',         'IPv4-mapped private A'],
    ])('blocks %s (%s)', (ip) => {
      expect(isAddressForbidden(ip)).toBe(true);
    });
  });

  describe('allowed IPv6 addresses', () => {
    it.each([
      ['2606:4700:4700::1111',  'Cloudflare DNS v6'],
      ['2001:4860:4860::8888',  'Google DNS v6'],
    ])('allows %s (%s)', (ip) => {
      expect(isAddressForbidden(ip)).toBe(false);
    });
  });

  it('blocks unparseable address (fail-closed)', () => {
    expect(isAddressForbidden('not-an-ip')).toBe(true);
  });
});

// ─── resolveAndValidate ───────────────────────────────────────────

describe('resolveAndValidate()', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('allows hostname resolving to public IP', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const result = await resolveAndValidate('example.com');
    expect(result.ok).toBe(true);
  });

  it('blocks hostname resolving to loopback', async () => {
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
    const result = await resolveAndValidate('evil.internal');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('FORBIDDEN_IP_RANGE');
      expect(result.message).toContain('127.0.0.1');
    }
  });

  it('blocks hostname resolving to private IP', async () => {
    mockLookup.mockResolvedValue([{ address: '192.168.1.1', family: 4 }] as never);
    const result = await resolveAndValidate('internal.corp');
    expect(result.ok).toBe(false);
  });

  it('blocks hostname resolving to 10.x.x.x', async () => {
    mockLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }] as never);
    const result = await resolveAndValidate('internal.vpn');
    expect(result.ok).toBe(false);
  });

  it('blocks hostname resolving to AWS IMDS address', async () => {
    mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never);
    const result = await resolveAndValidate('imds.attacker.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('FORBIDDEN_IP_RANGE');
  });

  it('blocks hostname with mixed public + private IPs (fail-closed)', async () => {
    mockLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 }, // public
      { address: '10.0.0.1', family: 4 },      // private — triggers rejection
    ] as never);
    const result = await resolveAndValidate('mixed.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('FORBIDDEN_IP_RANGE');
  });

  it('blocks DNS resolution failure', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND nonexistent.example'));
    const result = await resolveAndValidate('nonexistent.example');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('DNS_RESOLUTION_FAILED');
  });

  it('handles IPv6 loopback IP literal directly', async () => {
    // IP literals bypass DNS — checked directly
    const result = await resolveAndValidate('::1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('FORBIDDEN_IP_RANGE');
  });

  it('handles IPv4 loopback IP literal directly', async () => {
    const result = await resolveAndValidate('127.0.0.1');
    expect(result.ok).toBe(false);
  });

  it('handles IPv4-mapped IPv6 literal', async () => {
    const result = await resolveAndValidate('::ffff:192.168.1.1');
    expect(result.ok).toBe(false);
  });

  it('handles bracketed IPv6 literal [::1]', async () => {
    const result = await resolveAndValidate('[::1]');
    expect(result.ok).toBe(false);
  });

  it('allows public IPv4 literal', async () => {
    const result = await resolveAndValidate('1.1.1.1');
    expect(result.ok).toBe(true);
  });

  it('returns DNS_RESOLUTION_FAILED when lookup returns empty array', async () => {
    mockLookup.mockResolvedValue([] as never);
    const result = await resolveAndValidate('empty.example');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('NO_ADDRESSES_RESOLVED');
  });
});

// ─── validateRedirectTarget ───────────────────────────────────────

describe('validateRedirectTarget()', () => {
  const base = new URL('https://example.com/page');

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('allows a valid redirect to a public host', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const result = await validateRedirectTarget(
      'https://other-example.com/new-page',
      base, 1, 3,
    );
    expect(result.ok).toBe(true);
  });

  it('blocks redirect to localhost', async () => {
    const result = await validateRedirectTarget(
      'http://localhost/admin',
      base, 1, 3,
    );
    expect(result.ok).toBe(false);
  });

  it('blocks redirect to 127.0.0.1', async () => {
    const result = await validateRedirectTarget(
      'http://127.0.0.1:8080/',
      base, 1, 3,
    );
    expect(result.ok).toBe(false);
  });

  it('blocks redirect to private network IP', async () => {
    const result = await validateRedirectTarget(
      'http://192.168.1.1/',
      base, 1, 3,
    );
    expect(result.ok).toBe(false);
  });

  it('blocks redirect to AWS IMDS', async () => {
    const result = await validateRedirectTarget(
      'http://169.254.169.254/latest/meta-data/',
      base, 1, 3,
    );
    expect(result.ok).toBe(false);
  });

  it('blocks redirect that exceeds hop limit', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const result = await validateRedirectTarget(
      'https://other-example.com/',
      base, 4, 3, // hopNumber=4 > maxHops=3
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('INVALID_URL');
  });

  it('blocks redirect to non-http scheme', async () => {
    const result = await validateRedirectTarget(
      'file:///etc/passwd',
      base, 1, 3,
    );
    expect(result.ok).toBe(false);
  });

  it('resolves relative redirect against base URL', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const result = await validateRedirectTarget(
      '/new-path',   // relative URL
      base, 1, 3,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsedUrl.hostname).toBe('example.com');
    }
  });

  it('blocks redirect to hostname resolving to private IP', async () => {
    mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as never);
    const result = await validateRedirectTarget(
      'https://intranet.corp/',
      base, 1, 3,
    );
    expect(result.ok).toBe(false);
  });
});

