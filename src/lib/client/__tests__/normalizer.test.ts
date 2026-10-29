import { describe, it, expect } from 'vitest';
import { normalizeFeedUrl } from '../feed-manager';

describe('normalizeFeedUrl', () => {
  it('strips https:// and trailing slash', () => {
    expect(normalizeFeedUrl('https://danluu.com/')).toBe('danluu.com');
  });

  it('strips http:// scheme', () => {
    expect(normalizeFeedUrl('http://danluu.com')).toBe('danluu.com');
  });

  it('strips www. subdomain', () => {
    expect(normalizeFeedUrl('https://www.danluu.com/')).toBe('danluu.com');
  });

  it('strips http:// and www. together', () => {
    expect(normalizeFeedUrl('http://www.danluu.com')).toBe('danluu.com');
  });

  it('produces identical canonical key for http and https variants', () => {
    const a = normalizeFeedUrl('https://danluu.com/');
    const b = normalizeFeedUrl('http://danluu.com');
    expect(a).toBe(b);
  });

  it('strips UTM tracking parameters', () => {
    const url = 'https://danluu.com/feed?utm_source=rss&utm_campaign=newsletter';
    expect(normalizeFeedUrl(url)).toBe('danluu.com/feed');
  });

  it('preserves meaningful path segments', () => {
    expect(normalizeFeedUrl('https://simonwillison.net/atom/entries/')).toBe(
      'simonwillison.net/atom/entries',
    );
  });

  it('handles bare domain input (no protocol)', () => {
    const result = normalizeFeedUrl('danluu.com');
    expect(result).toBe('danluu.com');
  });

  it('strips all known UTM params at once', () => {
    const url =
      'https://example.com/feed?utm_source=x&utm_medium=y&utm_campaign=z&utm_term=a&utm_content=b';
    expect(normalizeFeedUrl(url)).toBe('example.com/feed');
  });
});

