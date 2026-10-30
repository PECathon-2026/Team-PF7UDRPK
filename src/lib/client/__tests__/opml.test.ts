import { describe, it, expect } from 'vitest';
import { exportToOpml, parseOpml } from '../opml';
import type { LocalFeed } from '../db';

describe('OPML Portability (Import & Export)', () => {
  const sampleFeeds: LocalFeed[] = [
    {
      id: 'simonwillison.net/atom/entries',
      url: 'https://simonwillison.net/atom/entries/',
      title: 'Simon Willison’s Weblog',
      siteUrl: 'https://simonwillison.net/',
      status: 'active',
      topics: ['python', 'sqlite', 'llms'],
    },
    {
      id: 'danluu.com',
      url: 'https://danluu.com/atom.xml',
      title: 'Dan Luu',
      siteUrl: 'https://danluu.com',
      status: 'active',
      topics: ['systems', 'hardware'],
    },
  ];

  it('exports feeds into valid OPML 2.0 XML with headers and outlines', () => {
    const opml = exportToOpml(sampleFeeds);

    expect(opml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(opml).toContain('<opml version="2.0">');
    expect(opml).toContain('<title>Small Web Reader Subscriptions</title>');
    expect(opml).toContain('xmlUrl="https://simonwillison.net/atom/entries/"');
    expect(opml).toContain('xmlUrl="https://danluu.com/atom.xml"');
    expect(opml).toContain('type="rss"');
  });

  it('parses flat OPML files correctly and extracts unique feed URLs', () => {
    const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Feedly Export</title>
  </head>
  <body>
    <outline text="Overreacted" title="Overreacted" type="rss" xmlUrl="https://overreacted.io/rss.xml" />
    <outline text="Dan Luu" title="Dan Luu" type="rss" xmlUrl="https://danluu.com/atom.xml" />
  </body>
</opml>`;

    const result = parseOpml(opmlXml);
    expect(result.title).toBe('Feedly Export');
    expect(result.feedUrls).toHaveLength(2);
    expect(result.feedUrls).toContain('https://overreacted.io/rss.xml');
    expect(result.feedUrls).toContain('https://danluu.com/atom.xml');
  });

  it('parses nested folder OPML files (e.g. NetNewsWire categories)', () => {
    const nestedOpml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>My Subscriptions</title>
  </head>
  <body>
    <outline text="Tech Blogs" title="Tech Blogs">
      <outline text="Simon Willison" type="rss" xmlUrl="https://simonwillison.net/atom/entries/" />
      <outline text="Hacker News" type="rss" xmlUrl="https://news.ycombinator.com/rss" />
    </outline>
    <outline text="Personal" title="Personal">
      <outline text="Dan Luu" type="rss" xmlUrl="https://danluu.com/atom.xml" />
    </outline>
  </body>
</opml>`;

    const result = parseOpml(nestedOpml);
    expect(result.feedUrls).toHaveLength(3);
    expect(result.feedUrls).toContain('https://simonwillison.net/atom/entries/');
    expect(result.feedUrls).toContain('https://news.ycombinator.com/rss');
    expect(result.feedUrls).toContain('https://danluu.com/atom.xml');
  });

  it('round-trips export -> import preserving all feed URLs', () => {
    const exported = exportToOpml(sampleFeeds);
    const parsed = parseOpml(exported);

    expect(parsed.feedUrls).toHaveLength(2);
    expect(parsed.feedUrls).toContain('https://simonwillison.net/atom/entries/');
    expect(parsed.feedUrls).toContain('https://danluu.com/atom.xml');
  });
});

