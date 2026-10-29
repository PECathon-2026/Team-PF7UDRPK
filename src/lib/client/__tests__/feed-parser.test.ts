import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '__cdata',
  allowBooleanAttributes: true,
  trimValues: true,
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RSS_VALID_CDATA = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Test Blog</title>
    <link>https://example.com</link>
    <description>A test RSS feed</description>
    <item>
      <title><![CDATA[Hello & World — A Test Post]]></title>
      <link>https://example.com/posts/1</link>
      <guid>https://example.com/posts/1</guid>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
      <description><![CDATA[<p>First post content with <strong>HTML</strong></p>]]></description>
      <dc:creator>Test Author</dc:creator>
    </item>
    <item>
      <title><![CDATA[Second Post]]></title>
      <link>https://example.com/posts/2</link>
      <guid>https://example.com/posts/2</guid>
      <pubDate>Tue, 02 Jan 2024 12:00:00 GMT</pubDate>
      <description><![CDATA[Second post content]]></description>
    </item>
  </channel>
</rss>`;

const ATOM_VALID = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test Blog</title>
  <link href="https://example.com"/>
  <id>https://example.com/atom</id>
  <updated>2024-01-02T12:00:00Z</updated>
  <entry>
    <title>First Atom Entry</title>
    <link href="https://example.com/atom/1"/>
    <id>https://example.com/atom/1</id>
    <published>2024-01-01T00:00:00Z</published>
    <updated>2024-01-01T00:00:00Z</updated>
    <summary>Summary of the first entry</summary>
    <author><name>Jane Doe</name></author>
  </entry>
  <entry>
    <title>Second Atom Entry</title>
    <link href="https://example.com/atom/2"/>
    <id>https://example.com/atom/2</id>
    <published>2024-01-02T00:00:00Z</published>
    <updated>2024-01-02T00:00:00Z</updated>
    <summary>Summary of the second entry</summary>
  </entry>
</feed>`;

// Malformed XML: unclosed tags, missing closing elements
const MALFORMED_XML = `<rss version="2.0"><channel><title>Broken Feed<item><title>No closing tags anywhere`;

// Edge case: empty channel with no items
const RSS_EMPTY_CHANNEL = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Empty Feed</title>
  </channel>
</rss>`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RSS 2.0 parser', () => {
  it('parses channel title correctly', () => {
    const parsed = xmlParser.parse(RSS_VALID_CDATA);
    expect(parsed.rss.channel.title).toBe('Test Blog');
  });

  it('extracts CDATA title from items', () => {
    const parsed = xmlParser.parse(RSS_VALID_CDATA);
    const item = parsed.rss.channel.item[0];
    expect(item.title.__cdata).toBe('Hello & World — A Test Post');
  });

  it('extracts CDATA description from items', () => {
    const parsed = xmlParser.parse(RSS_VALID_CDATA);
    const item = parsed.rss.channel.item[0];
    expect(item.description.__cdata).toContain('First post content');
  });

  it('returns an array of items for multi-item feeds', () => {
    const parsed = xmlParser.parse(RSS_VALID_CDATA);
    expect(Array.isArray(parsed.rss.channel.item)).toBe(true);
    expect(parsed.rss.channel.item).toHaveLength(2);
  });

  it('returns empty/undefined item for empty channel', () => {
    const parsed = xmlParser.parse(RSS_EMPTY_CHANNEL);
    expect(parsed.rss.channel.title).toBe('Empty Feed');
    expect(parsed.rss.channel.item).toBeUndefined();
  });
});

describe('Atom 1.0 parser', () => {
  it('parses feed title correctly', () => {
    const parsed = xmlParser.parse(ATOM_VALID);
    expect(parsed.feed.title).toBe('Atom Test Blog');
  });

  it('returns an array of entries', () => {
    const parsed = xmlParser.parse(ATOM_VALID);
    expect(Array.isArray(parsed.feed.entry)).toBe(true);
    expect(parsed.feed.entry).toHaveLength(2);
  });

  it('extracts entry title, link, and author', () => {
    const parsed = xmlParser.parse(ATOM_VALID);
    const entry = parsed.feed.entry[0];
    expect(entry.title).toBe('First Atom Entry');
    expect(entry.link['@_href']).toBe('https://example.com/atom/1');
    expect(entry.author.name).toBe('Jane Doe');
  });

  it('parses ISO 8601 published date', () => {
    const parsed = xmlParser.parse(ATOM_VALID);
    const entry = parsed.feed.entry[0];
    const ts = Date.parse(entry.published);
    expect(isNaN(ts)).toBe(false);
    expect(ts).toBe(Date.parse('2024-01-01T00:00:00Z'));
  });
});

describe('Malformed XML handling', () => {
  it('does NOT throw on malformed XML — parser returns partial structure', () => {
    expect(() => xmlParser.parse(MALFORMED_XML)).not.toThrow();
  });

  it('returns a partial object (not null/undefined) on malformed XML', () => {
    const result = xmlParser.parse(MALFORMED_XML);
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});

