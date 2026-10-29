/**
 * feed-worker.ts — Web Worker
 *
 * Runs feed parsing (fast-xml-parser), TF-IDF topic extraction, and article
 * content extraction (Mozilla Readability + DOMPurify) entirely off the main
 * thread to guarantee 60 FPS UI performance even when syncing 15+ feeds.
 *
 * Message protocol:
 *   IN:  WorkerInMessage  (posted from feed-manager.ts via Worker.postMessage)
 *   OUT: WorkerOutMessage (received in feed-manager.ts via worker.onmessage)
 */

import { XMLParser } from 'fast-xml-parser';
import type { LocalPost } from '../db';
import { extractTopics } from '../tfidf';

// ── Message Protocol ──────────────────────────────────────────────────────────

export type WorkerInMessage =
  | { type: 'PARSE_FEED'; rawXml: string; feedUrl: string }
  | { type: 'EXTRACT_ARTICLE'; rawHtml: string; postId: string; fallbackSummary: string };

export type WorkerOutMessage =
  | { type: 'FEED_PARSED'; feedUrl: string; title: string; posts: LocalPost[]; topics: string[] }
  | { type: 'ARTICLE_EXTRACTED'; postId: string; content: string; byline?: string; readingTimeMinutes: number }
  | { type: 'WORKER_ERROR'; error: string };

// ── XML Parser Setup ──────────────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '__cdata',
  allowBooleanAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

// ── Utility Helpers ───────────────────────────────────────────────────────────

function normalizeDateToTimestamp(dateStr?: string): number {
  if (!dateStr) return Date.now();
  const ts = Date.parse(String(dateStr));
  return isNaN(ts) ? Date.now() : ts;
}

function extractText(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (obj['__cdata']) return String(obj['__cdata']);
    if (obj['#text']) return String(obj['#text']);
  }
  return String(val);
}

function makePostId(feedUrl: string, guid: string): string {
  // Deterministic ID: base64 of "feedUrl::guid", truncated to 40 chars
  const raw = `${feedUrl}::${guid}`;
  try {
    return btoa(unescape(encodeURIComponent(raw))).slice(0, 40);
  } catch {
    return raw.slice(0, 40);
  }
}

// ── RSS / Atom Parser ─────────────────────────────────────────────────────────

function parseRssOrAtom(rawXml: string, feedUrl: string): { title: string; posts: LocalPost[] } {
  const parsed = xmlParser.parse(rawXml) as Record<string, unknown>;

  // ── Atom 1.0 ──────────────────────────────────────────────────────────────
  if (parsed?.feed) {
    const feed = parsed.feed as Record<string, unknown>;
    const title = extractText(feed.title) || feedUrl;
    const rawEntries = feed.entry;
    const entries: unknown[] = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : [];

    const posts: LocalPost[] = entries.map((e) => {
      const entry = e as Record<string, unknown>;
      let link = '';
      if (typeof entry.link === 'string') {
        link = entry.link;
      } else if (entry.link && typeof entry.link === 'object') {
        const l = entry.link as Record<string, unknown>;
        link = String(l['@_href'] ?? '');
      }

      const guid = extractText(entry.id) || link || extractText(entry.title) || String(Math.random());
      const authorObj = entry.author as Record<string, unknown> | undefined;

      return {
        id: makePostId(feedUrl, guid),
        feedId: feedUrl,
        title: extractText(entry.title) || '(untitled)',
        link,
        author: authorObj ? extractText(authorObj.name) || undefined : undefined,
        publishedAt: normalizeDateToTimestamp(
          extractText(entry.published) || extractText(entry.updated),
        ),
        summary: extractText(entry.summary) || extractText(entry.content) || '',
        isRead: false,
        isStarred: false,
      };
    });

    return { title, posts };
  }

  // ── RSS 2.0 / RSS 0.9x ────────────────────────────────────────────────────
  const rssRoot = parsed?.rss as Record<string, unknown> | undefined;
  const channel = rssRoot?.channel as Record<string, unknown> | undefined;
  if (channel) {
    const title = extractText(channel.title) || feedUrl;
    const rawItems = channel.item;
    const items: unknown[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

    const posts: LocalPost[] = items.map((i) => {
      const item = i as Record<string, unknown>;
      const guidRaw = item.guid;
      const guidText =
        typeof guidRaw === 'object' && guidRaw !== null
          ? extractText((guidRaw as Record<string, unknown>)['#text'])
          : extractText(guidRaw);

      const guid = guidText || extractText(item.link) || extractText(item.title) || String(Math.random());

      return {
        id: makePostId(feedUrl, guid),
        feedId: feedUrl,
        title: extractText(item.title) || '(untitled)',
        link: extractText(item.link) || '',
        author: extractText(item.author) || extractText(item['dc:creator']) || undefined,
        publishedAt: normalizeDateToTimestamp(extractText(item.pubDate) || extractText(item['dc:date'])),
        summary: extractText(item.description) || extractText(item['content:encoded']) || '',
        isRead: false,
        isStarred: false,
      };
    });

    return { title, posts };
  }

  throw new Error('Unrecognized feed format (expected RSS <channel> or Atom <feed>)');
}

// ── Article Extraction (Readability + DOMPurify) ──────────────────────────────

function estimateReadingTime(text: string): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

async function extractArticle(rawHtml: string, postId: string, fallbackSummary: string): Promise<void> {
  try {
    const { Readability } = await import('@mozilla/readability');
    const DOMPurify = (await import('dompurify')).default;

    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
    const article = new Readability(doc).parse();

    if (!article) {
      throw new Error('Readability returned null — likely a SPA shell or paywall');
    }

    const safeContent = DOMPurify.sanitize(article.content ?? '', {
      ALLOWED_TAGS: [
        'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li',
        'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'hr', 'span', 'div', 'section', 'article',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel'],
    });

    const out: WorkerOutMessage = {
      type: 'ARTICLE_EXTRACTED',
      postId,
      content: safeContent,
      byline: article.byline ?? undefined,
      readingTimeMinutes: estimateReadingTime(article.textContent ?? ''),
    };
    self.postMessage(out);
  } catch {
    const out: WorkerOutMessage = {
      type: 'ARTICLE_EXTRACTED',
      postId,
      content: `<p>${fallbackSummary}</p>`,
      readingTimeMinutes: 1,
    };
    self.postMessage(out);
  }
}

// ── Main Message Handler ──────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  if (msg.type === 'PARSE_FEED') {
    try {
      const { title, posts } = parseRssOrAtom(msg.rawXml, msg.feedUrl);
      const topics = extractTopics(posts);
      const out: WorkerOutMessage = {
        type: 'FEED_PARSED',
        feedUrl: msg.feedUrl,
        title,
        posts,
        topics,
      };
      self.postMessage(out);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      const out: WorkerOutMessage = { type: 'WORKER_ERROR', error };
      self.postMessage(out);
    }
    return;
  }

  if (msg.type === 'EXTRACT_ARTICLE') {
    await extractArticle(msg.rawHtml, msg.postId, msg.fallbackSummary);
  }
};
