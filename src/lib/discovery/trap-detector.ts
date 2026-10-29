import { normalizeBlogUrl } from './normalize-url';

export interface TrapFinding {
  type: 'DUPLICATE_CANONICAL' | 'REDIRECT_ALIAS' | 'MALFORMED_XML' | 'HTTP_ERROR' | 'IDENTICAL_FEED_TITLE';
  severity: 'HIGH' | 'CRITICAL';
  description: string;
  evidence: {
    urlA: string;
    urlB?: string;
    details: any;
  };
  bountyReportMessage: string;
}

export interface TrapDetectionReport {
  trapsFound: boolean;
  totalUrlsScanned: number;
  findings: TrapFinding[];
  summary: string;
}

/**
 * Parses basic XML feed title without external dependencies
 */
function extractFeedTitleFromXml(xmlText: string): string | null {
  const titleMatch = xmlText.match(/<title[^>]*>(.*?)<\/title>/is);
  if (!titleMatch) return null;
  return titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/is, '$1').trim();
}

/**
 * Validates XML structure basic well-formedness
 */
function validateXmlWellFormed(xmlText: string): { isValid: boolean; error?: string } {
  if (!xmlText || xmlText.trim().length === 0) {
    return { isValid: false, error: 'Empty response body' };
  }

  const trimmed = xmlText.trim();
  if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<rss') && !trimmed.startsWith('<feed')) {
    // Might be an HTML error page or raw JSON
    if (trimmed.toLowerCase().includes('<!doctype html') || trimmed.toLowerCase().includes('<html')) {
      return { isValid: false, error: 'Expected XML feed, but received HTML webpage' };
    }
  }

  // Check balanced root tag
  const hasRss = trimmed.includes('<rss') && trimmed.includes('</rss>');
  const hasFeed = trimmed.includes('<feed') && trimmed.includes('</feed>');
  const hasRdf = trimmed.includes('<rdf:RDF') && trimmed.includes('</rdf:RDF>');

  if (!hasRss && !hasFeed && !hasRdf) {
    return { isValid: false, error: 'Feed XML is missing closing root tag (corrupted or truncated XML)' };
  }

  return { isValid: true };
}

/**
 * Inspects a list of seed URLs for deliberate hackathon traps.
 * Can run locally against mock lists or perform live HTTP probes.
 */
export async function inspectSeedListForTraps(
  urls: string[],
  fetchFn: (url: string) => Promise<{ status: number; text: string; finalUrl?: string }> = defaultFetcher
): Promise<TrapDetectionReport> {
  const findings: TrapFinding[] = [];

  // Check 1: Duplicate Canonical Normalization Trap (Instant Static Analysis)
  const canonicalMap = new Map<string, string>(); // canonical -> originalUrl

  for (const rawUrl of urls) {
    try {
      const canonical = normalizeBlogUrl(rawUrl);
      if (canonicalMap.has(canonical)) {
        const original = canonicalMap.get(canonical)!;
        findings.push({
          type: 'DUPLICATE_CANONICAL',
          severity: 'HIGH',
          description: `Duplicate blog alias detected: '${rawUrl}' and '${original}' resolve to the exact same canonical blog '${canonical}'.`,
          evidence: {
            urlA: original,
            urlB: rawUrl,
            details: { canonical },
          },
          bountyReportMessage: `Trap Report: Seed list contains duplicate URLs for the same blog: "${original}" and "${rawUrl}" both represent canonical blog "${canonical}".`,
        });
      } else {
        canonicalMap.set(canonical, rawUrl);
      }
    } catch (err: any) {
      findings.push({
        type: 'HTTP_ERROR',
        severity: 'HIGH',
        description: `Invalid URL format: ${rawUrl}`,
        evidence: { urlA: rawUrl, details: { error: err.message } },
        bountyReportMessage: `Trap Report: Seed list contains invalid URL format: "${rawUrl}".`,
      });
    }
  }

  // Check 2: Live Fetch Verification (XML Well-formedness, Redirects, Titles)
  const titleMap = new Map<string, string>(); // title -> originalUrl

  for (const rawUrl of urls) {
    try {
      const res = await fetchFn(rawUrl);

      if (res.status >= 400) {
        findings.push({
          type: 'HTTP_ERROR',
          severity: 'CRITICAL',
          description: `Feed URL returned HTTP error status ${res.status}: ${rawUrl}`,
          evidence: { urlA: rawUrl, details: { status: res.status } },
          bountyReportMessage: `Trap Report: Seed URL "${rawUrl}" returned HTTP error ${res.status}.`,
        });
        continue;
      }

      // Check if redirect points to an already listed seed
      if (res.finalUrl && res.finalUrl !== rawUrl) {
        const finalCanonical = normalizeBlogUrl(res.finalUrl);
        const originalCanonical = normalizeBlogUrl(rawUrl);
        if (finalCanonical !== originalCanonical && canonicalMap.has(finalCanonical)) {
          findings.push({
            type: 'REDIRECT_ALIAS',
            severity: 'HIGH',
            description: `Redirect trap: '${rawUrl}' redirects to '${res.finalUrl}', which is already present as a seed item.`,
            evidence: { urlA: rawUrl, urlB: res.finalUrl, details: { redirectedTo: res.finalUrl } },
            bountyReportMessage: `Trap Report: Seed "${rawUrl}" redirects to "${res.finalUrl}" which duplicates another seed entry.`,
          });
        }
      }

      // Check XML well-formedness
      const xmlCheck = validateXmlWellFormed(res.text);
      if (!xmlCheck.isValid) {
        findings.push({
          type: 'MALFORMED_XML',
          severity: 'CRITICAL',
          description: `Malformed feed trap detected at '${rawUrl}': ${xmlCheck.error}`,
          evidence: { urlA: rawUrl, details: { error: xmlCheck.error, sample: res.text.slice(0, 200) } },
          bountyReportMessage: `Trap Report: Feed at "${rawUrl}" is malformed: ${xmlCheck.error}.`,
        });
        continue;
      }

      // Check duplicate feed titles (different URLs, same blog title)
      const feedTitle = extractFeedTitleFromXml(res.text);
      if (feedTitle && feedTitle.length > 2) {
        if (titleMap.has(feedTitle)) {
          const priorUrl = titleMap.get(feedTitle)!;
          if (priorUrl !== rawUrl) {
            findings.push({
              type: 'IDENTICAL_FEED_TITLE',
              severity: 'HIGH',
              description: `Identical feed title trap: '${rawUrl}' and '${priorUrl}' both declare the exact same title '${feedTitle}'.`,
              evidence: { urlA: priorUrl, urlB: rawUrl, details: { title: feedTitle } },
              bountyReportMessage: `Trap Report: Feeds "${priorUrl}" and "${rawUrl}" have identical titles: "${feedTitle}".`,
            });
          }
        } else {
          titleMap.set(feedTitle, rawUrl);
        }
      }
    } catch (err: any) {
      findings.push({
        type: 'HTTP_ERROR',
        severity: 'HIGH',
        description: `Network or probe failure on '${rawUrl}': ${err.message}`,
        evidence: { urlA: rawUrl, details: { error: err.message } },
        bountyReportMessage: `Trap Report: Failed to fetch feed "${rawUrl}": ${err.message}.`,
      });
    }
  }

  const trapsFound = findings.length > 0;
  const summary = trapsFound
    ? `⚠️ Detected ${findings.length} trap(s) in seed list! Review bounty report messages to submit for 10 extra points.`
    : `✅ Seed list verified clean: No duplicate canonicals, redirect aliases, or malformed XML feeds found.`;

  return {
    trapsFound,
    totalUrlsScanned: urls.length,
    findings,
    summary,
  };
}

/**
 * Default native fetcher
 */
async function defaultFetcher(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const text = await res.text();
    return {
      status: res.status,
      text,
      finalUrl: res.url,
    };
  } finally {
    clearTimeout(timer);
  }
}

