import { safeFetchThroughProxy } from './proxy';

const FEED_FALLBACKS = ['/feed', '/rss.xml', '/atom.xml', '/index.xml', '/feed.xml', '/rss', '/atom'];

/**
 * Given any URL (blog homepage or direct feed URL), returns the canonical feed URL.
 *
 * Strategy:
 *  1. Try the URL directly — if it looks like XML/Atom/RSS, return it as-is.
 *  2. Parse HTML <link rel="alternate" type="application/rss+xml|atom+xml"> tags.
 *  3. Probe common fallback paths (/feed, /rss.xml, etc.)
 *
 * Throws if no feed can be found.
 */
export async function discoverFeedUrl(inputUrl: string): Promise<string> {
  const url = inputUrl.startsWith('http') ? inputUrl : `https://${inputUrl}`;

  // Step 1: Try the URL directly — maybe it's already a feed
  let raw: string;
  try {
    raw = await safeFetchThroughProxy(url);
  } catch {
    throw new Error(`Could not reach ${url}`);
  }

  const trimmed = raw.trimStart();
  if (
    trimmed.startsWith('<?xml') ||
    trimmed.includes('<rss') ||
    trimmed.includes('<feed xmlns') ||
    trimmed.includes('<rdf:RDF')
  ) {
    return url;
  }

  // Step 2: Parse <link rel="alternate"> from HTML
  // Handle both attribute-order variants
  const altLinkPatterns = [
    /<link[^>]+rel=["']alternate["'][^>]+type=["']application\/(rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/(rss|atom)\+xml["']/i,
  ];

  for (const pattern of altLinkPatterns) {
    const match = raw.match(pattern);
    if (match) {
      // href is the last non-empty capture group
      const href = match[match.length - 1];
      if (href) {
        return href.startsWith('http') ? href : new URL(href, url).toString();
      }
    }
  }

  // Step 3: Probe fallback paths
  const base = new URL(url).origin;
  for (const path of FEED_FALLBACKS) {
    const candidate = base + path;
    try {
      const probe = await safeFetchThroughProxy(candidate);
      const t = probe.trimStart();
      if (t.startsWith('<?xml') || t.includes('<rss') || t.includes('<feed xmlns') || t.includes('<rdf:RDF')) {
        return candidate;
      }
    } catch {
      // Not a valid feed at this path — continue
    }
  }

  throw new Error(`Could not discover a feed URL for: ${inputUrl}`);
}

