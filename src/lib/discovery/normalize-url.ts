/**
 * URL Canonical Normalizer for Small Web Reader
 * Ensures that one blog under several URLs (e.g. protocol, www, feed paths, UTM params)
 * is recognized and counted as the same unique blog entity.
 */

const FEED_SUFFIXES = [
  /\/blog\.rss\/?$/i,
  /\/blog\.atom\/?$/i,
  /\/feed\/?$/i,
  /\/feed\.xml\/?$/i,
  /\/rss\/?$/i,
  /\/rss\.xml\/?$/i,
  /\/atom\/?$/i,
  /\/atom\.xml\/?$/i,
  /\/index\.xml\/?$/i,
  /\.rss\/?$/i,
];

const TRACKING_PARAM_PREFIXES = ['utm_', 'ref', 'source', 'rss', 'campaign'];

/**
 * Normalizes a URL to a clean canonical string representing the root blog entity.
 * Examples:
 *   "https://www.danluu.com/atom.xml?utm_source=rss" -> "danluu.com"
 *   "http://simonwillison.net/atom/entries/" -> "simonwillison.net/atom/entries"
 *   "https://example.com/blog/feed.xml" -> "example.com/blog"
 */
export function normalizeBlogUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('URL must be a non-empty string');
  }

  let trimmed = rawUrl.trim();

  // If protocol is missing, prepend https:// for standard URL parsing
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (err: any) {
    throw new Error(`Invalid URL format: ${rawUrl}`);
  }

  // 1. Lowercase hostname and strip 'www.'
  let hostname = parsed.hostname.toLowerCase();
  if (hostname.startsWith('www.')) {
    hostname = hostname.slice(4);
  }

  // 2. Clean pathname: remove trailing slash and standard feed endpoints
  let pathname = parsed.pathname.replace(/\/+$/, '');

  for (const pattern of FEED_SUFFIXES) {
    if (pattern.test(pathname)) {
      pathname = pathname.replace(pattern, '');
      break;
    }
  }

  // Clean trailing slashes again after replacement
  pathname = pathname.replace(/\/+$/, '');

  // 3. Filter query parameters to strip analytics / tracking params
  const cleanParams = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    const isTracking = TRACKING_PARAM_PREFIXES.some((prefix) =>
      lowerKey.startsWith(prefix)
    );
    if (!isTracking) {
      cleanParams.append(key, value);
    }
  }

  const search = cleanParams.toString() ? `?${cleanParams.toString()}` : '';

  // 4. Combine into canonical identifier (omit default port and protocol for identity)
  const canonical = `${hostname}${pathname}${search}`.replace(/\/+$/, '');
  return canonical || hostname;
}

/**
 * Normalizes an exact feed URL (preserving protocol and path for fetching)
 * but stripping tracking params and fragments.
 */
export function normalizeFeedEndpoint(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('URL must be a non-empty string');
  }

  let trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  const parsed = new URL(trimmed);
  // Strip tracking parameters
  const cleanParams = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    const isTracking = TRACKING_PARAM_PREFIXES.some((prefix) =>
      lowerKey.startsWith(prefix)
    );
    if (!isTracking) {
      cleanParams.append(key, value);
    }
  }

  const search = cleanParams.toString() ? `?${cleanParams.toString()}` : '';
  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}${search}`;
}
