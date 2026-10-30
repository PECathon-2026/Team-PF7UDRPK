import { XMLParser } from 'fast-xml-parser';
import type { LocalFeed } from './db';

/**
 * OPML 2.0 Importer and Exporter for Small Web Reader.
 * Enables zero-lock-in portability with Feedly, NetNewsWire, Miniflux, etc.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  trimValues: true,
});

/**
 * Generates valid OPML 2.0 XML from an array of subscribed LocalFeeds.
 */
export function exportToOpml(feeds: LocalFeed[]): string {
  const dateStr = new Date().toUTCString();

  const outlines = feeds
    .map((feed) => {
      const title = escapeXml(feed.title || feed.url);
      const xmlUrl = escapeXml(feed.url);
      const htmlUrl = escapeXml(feed.siteUrl || `https://${feed.id}`);
      return `      <outline text="${title}" title="${title}" type="rss" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}" />`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Small Web Reader Subscriptions</title>
    <dateCreated>${dateStr}</dateCreated>
    <docs>http://opml.org/spec2.opml</docs>
  </head>
  <body>
${outlines}
  </body>
</opml>`;
}

/**
 * Parses OPML XML and extracts all feed URLs (xmlUrl) found in <outline> nodes,
 * supporting both flat and nested folder structures.
 */
export function parseOpml(rawXml: string): { title?: string; feedUrls: string[] } {
  const parsed = parser.parse(rawXml) as Record<string, unknown>;
  const opml = parsed?.opml as Record<string, unknown> | undefined;

  if (!opml) {
    throw new Error('Invalid OPML file: missing root <opml> tag');
  }

  const head = opml.head as Record<string, unknown> | undefined;
  const title = head?.title ? String(head.title) : undefined;
  const body = opml.body as Record<string, unknown> | undefined;

  if (!body) {
    return { title, feedUrls: [] };
  }

  const feedUrls: string[] = [];

  function collectOutlines(node: unknown) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach(collectOutlines);
      return;
    }

    const obj = node as Record<string, unknown>;

    // If this node is a feed outline with xmlUrl
    const xmlUrl = obj['@_xmlUrl'] || obj['@_xmlurl'] || obj['@_url'];
    if (typeof xmlUrl === 'string' && xmlUrl.trim()) {
      feedUrls.push(xmlUrl.trim());
    }

    // Traverse nested outlines (e.g. folders / categories)
    if (obj.outline) {
      collectOutlines(obj.outline);
    }
  }

  collectOutlines(body.outline);

  // Deduplicate URLs
  const uniqueUrls = Array.from(new Set(feedUrls));

  return { title, feedUrls: uniqueUrls };
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

