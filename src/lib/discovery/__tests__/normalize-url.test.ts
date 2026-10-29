import { describe, it, expect } from 'vitest';
import { normalizeBlogUrl, normalizeFeedEndpoint } from '../normalize-url';

describe('normalizeBlogUrl', () => {
  it('strips https, http and trailing slash', () => {
    expect(normalizeBlogUrl('https://danluu.com/')).toBe('danluu.com');
    expect(normalizeBlogUrl('http://danluu.com')).toBe('danluu.com');
    expect(normalizeBlogUrl('danluu.com/')).toBe('danluu.com');
  });

  it('strips www prefix', () => {
    expect(normalizeBlogUrl('https://www.danluu.com')).toBe('danluu.com');
    expect(normalizeBlogUrl('http://www.simonwillison.net/')).toBe('simonwillison.net');
  });

  it('strips standard feed suffixes to identify root blog', () => {
    expect(normalizeBlogUrl('https://danluu.com/atom.xml')).toBe('danluu.com');
    expect(normalizeBlogUrl('https://simonwillison.net/feed')).toBe('simonwillison.net');
    expect(normalizeBlogUrl('https://robinsloan.com/rss.xml')).toBe('robinsloan.com');
    expect(normalizeBlogUrl('https://example.com/blog/feed/')).toBe('example.com/blog');
  });

  it('strips analytics and tracking query params', () => {
    expect(
      normalizeBlogUrl('https://danluu.com/?utm_source=rss&utm_medium=feed')
    ).toBe('danluu.com');
    expect(
      normalizeBlogUrl('https://www.example.com/blog/atom.xml?ref=producthunt&rss=true')
    ).toBe('example.com/blog');
  });

  it('preserves non-tracking legitimate query params', () => {
    expect(normalizeBlogUrl('https://example.com/articles?category=tech')).toBe(
      'example.com/articles?category=tech'
    );
  });
});

describe('normalizeFeedEndpoint', () => {
  it('preserves protocol and valid path but removes tracking', () => {
    expect(
      normalizeFeedEndpoint('https://danluu.com/atom.xml?utm_source=feed')
    ).toBe('https://danluu.com/atom.xml');
  });
});

