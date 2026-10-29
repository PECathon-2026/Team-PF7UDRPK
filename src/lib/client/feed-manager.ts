/**
 * feed-manager.ts — Public API for Member B's Client Feed Engine
 *
 * This module is the single integration point for Member A (UI) and is the
 * bridge between:
 *   - The Dexie IndexedDB store (db.ts)
 *   - The feed-parsing Web Worker (workers/feed-worker.ts)
 *   - Member C's SSRF-safe proxy (proxy.ts)
 *   - The autodiscovery logic (autodiscovery.ts)
 *
 * Public API consumed by Member A:
 *   subscribeFeed(inputUrl)       → Add a new feed (autodiscovers URL, syncs)
 *   syncFeed(feedId)              → Refresh a single feed
 *   syncAllFeeds()                → Refresh all active/error feeds
 *   fetchAndCacheArticle(post)    → Fetch + Readability extract + DOMPurify + cache
 *   getTopSubscribedTopics()      → TF-IDF keywords across all subscribed feeds
 *   unsubscribeFeed(feedId)       → Remove feed + all its posts + cached articles
 *   markPostRead(postId, isRead)  → Toggle read state
 *   toggleStarred(postId)         → Toggle starred state
 *   normalizeFeedUrl(url)         → Canonical URL key (used by Member D for discovery)
 */

import { localDB, LocalFeed, LocalPost, CachedArticle } from './db';
import { safeFetchThroughProxy } from './proxy';
import { discoverFeedUrl } from './autodiscovery';
import { extractTopics } from './tfidf';
import { XMLParser } from 'fast-xml-parser';
import type { WorkerInMessage, WorkerOutMessage } from './workers/feed-worker';

// ── Worker Singleton with Graceful Fallback ───────────────────────────────────

let _worker: Worker | null = null;
let _workerFailed = false;

function getWorker(): Worker | null {
  if (typeof window === 'undefined' || _workerFailed) {
    return null;
  }
  if (!_worker) {
    try {
      _worker = new Worker(new URL('./workers/feed-worker.ts', import.meta.url), {
        type: 'module',
      });
      _worker.onerror = (e) => {
        console.warn('[FeedWorker] Worker error, falling back to main-thread parser:', e);
        _workerFailed = true;
        _worker = null;
      };
    } catch (err) {
      console.warn('[FeedWorker] Could not instantiate Web Worker, using fallback:', err);
      _workerFailed = true;
      _worker = null;
    }
  }
  return _worker;
}

// ── Fallback Parser (Main thread when Worker is unavailable) ──────────────────

const fallbackXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '__cdata',
  allowBooleanAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

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

function parseFeedFallback(
  rawXml: string,
  feedUrl: string,
): { title: string; posts: LocalPost[]; topics: string[] } {
  const parsed = fallbackXmlParser.parse(rawXml) as Record<string, unknown>;

  // Atom 1.0
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
        id: btoa(unescape(encodeURIComponent(`${feedUrl}::${guid}`))).slice(0, 40),
        feedId: feedUrl,
        title: extractText(entry.title) || '(untitled)',
        link,
        author: authorObj ? extractText(authorObj.name) || undefined : undefined,
        publishedAt: Date.parse(extractText(entry.published) || extractText(entry.updated)) || Date.now(),
        summary: extractText(entry.summary) || extractText(entry.content) || '',
        isRead: false,
        isStarred: false,
      };
    });
    return { title, posts, topics: extractTopics(posts) };
  }

  // RSS 2.0 / 0.9x
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
        id: btoa(unescape(encodeURIComponent(`${feedUrl}::${guid}`))).slice(0, 40),
        feedId: feedUrl,
        title: extractText(item.title) || '(untitled)',
        link: extractText(item.link) || '',
        author: extractText(item.author) || extractText(item['dc:creator']) || undefined,
        publishedAt: Date.parse(extractText(item.pubDate) || extractText(item['dc:date'])) || Date.now(),
        summary: extractText(item.description) || extractText(item['content:encoded']) || '',
        isRead: false,
        isStarred: false,
      };
    });
    return { title, posts, topics: extractTopics(posts) };
  }

  throw new Error('Unrecognized feed format (expected RSS or Atom XML)');
}

// ── Promise-wrapped Worker Communication ──────────────────────────────────────

function parseFeedInWorker(
  rawXml: string,
  feedUrl: string,
): Promise<{ title: string; posts: LocalPost[]; topics: string[] }> {
  const worker = getWorker();
  if (!worker) {
    return Promise.resolve(parseFeedFallback(rawXml, feedUrl));
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.removeEventListener('message', handler);
      console.warn('[FeedWorker] Timeout waiting for worker, falling back');
      try {
        resolve(parseFeedFallback(rawXml, feedUrl));
      } catch (e) {
        reject(e);
      }
    }, 5000);

    const handler = (e: MessageEvent<WorkerOutMessage>) => {
      const data = e.data;
      if (data.type === 'FEED_PARSED' && data.feedUrl === feedUrl) {
        clearTimeout(timeout);
        worker.removeEventListener('message', handler);
        resolve({ title: data.title, posts: data.posts, topics: data.topics });
      } else if (data.type === 'WORKER_ERROR') {
        clearTimeout(timeout);
        worker.removeEventListener('message', handler);
        reject(new Error(data.error));
      }
    };

    worker.addEventListener('message', handler);
    const msg: WorkerInMessage = { type: 'PARSE_FEED', rawXml, feedUrl };
    worker.postMessage(msg);
  });
}

async function extractArticleFallback(
  rawHtml: string,
  postId: string,
  fallbackSummary: string,
): Promise<Pick<CachedArticle, 'content' | 'byline' | 'readingTimeMinutes'>> {
  try {
    const { Readability } = await import('@mozilla/readability');
    const dompurifyModule = await import('dompurify');
    const rawPurify = dompurifyModule.default || dompurifyModule;
    const DOMPurify = rawPurify as unknown as {
      sanitize?: (s: string, cfg?: Record<string, unknown>) => string;
      (win: Window): { sanitize: (s: string, cfg?: Record<string, unknown>) => string };
    };

    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
    const article = new Readability(doc).parse();

    if (!article) throw new Error('Readability returned null');

    const sanitizeFn = typeof DOMPurify.sanitize === 'function' ? DOMPurify.sanitize.bind(DOMPurify) : DOMPurify(window).sanitize;
    const safeContent = sanitizeFn(article.content ?? '', {
      ALLOWED_TAGS: [
        'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li',
        'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'hr', 'span', 'div', 'section', 'article',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel'],
    });

    const wordCount = (article.textContent ?? '').trim().split(/\s+/).filter(Boolean).length;
    const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

    return {
      content: safeContent,
      byline: article.byline ?? undefined,
      readingTimeMinutes,
    };
  } catch {
    return {
      content: `<p>${fallbackSummary}</p>`,
      readingTimeMinutes: 1,
    };
  }
}

function extractArticleInWorker(
  rawHtml: string,
  postId: string,
  fallbackSummary: string,
): Promise<Pick<CachedArticle, 'content' | 'byline' | 'readingTimeMinutes'>> {
  const worker = getWorker();
  if (!worker) {
    return extractArticleFallback(rawHtml, postId, fallbackSummary);
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      worker.removeEventListener('message', handler);
      resolve(extractArticleFallback(rawHtml, postId, fallbackSummary));
    }, 5000);

    const handler = (e: MessageEvent<WorkerOutMessage>) => {
      const data = e.data;
      if (data.type === 'ARTICLE_EXTRACTED' && data.postId === postId) {
        clearTimeout(timeout);
        worker.removeEventListener('message', handler);
        resolve({
          content: data.content,
          byline: data.byline,
          readingTimeMinutes: data.readingTimeMinutes,
        });
      } else if (data.type === 'WORKER_ERROR') {
        clearTimeout(timeout);
        worker.removeEventListener('message', handler);
        resolve(extractArticleFallback(rawHtml, postId, fallbackSummary));
      }
    };

    worker.addEventListener('message', handler);
    const msg: WorkerInMessage = { type: 'EXTRACT_ARTICLE', rawHtml, postId, fallbackSummary };
    worker.postMessage(msg);
  });
}

// ── URL Normalizer ────────────────────────────────────────────────────────────

/**
 * Produces the canonical key for a feed URL.
 * Strips: protocol (http/https), www. subdomain, trailing slashes, UTM params.
 *
 * Examples:
 *   https://danluu.com/         → danluu.com
 *   http://www.danluu.com       → danluu.com
 *   https://danluu.com/?utm_source=rss  → danluu.com
 */
export function normalizeFeedUrl(url: string): string {
  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const u = new URL(fullUrl);
    u.hostname = u.hostname.replace(/^www\./, '');
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source'].forEach(
      (p) => u.searchParams.delete(p),
    );
    const path = (u.pathname + u.search).replace(/\/+$/, '');
    return u.hostname + (path === '/' ? '' : path);
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
  }
}

// ── Public Feed API ───────────────────────────────────────────────────────────

/**
 * Subscribe to a new feed given any URL (blog homepage or direct feed URL).
 * Autodiscovers the feed URL, creates a record, and triggers an immediate sync.
 */
export async function subscribeFeed(inputUrl: string): Promise<LocalFeed> {
  const feedUrl = await discoverFeedUrl(inputUrl);
  const normalized = normalizeFeedUrl(feedUrl);

  const existing = await localDB.feeds.get(normalized);
  if (existing) {
    // If it already exists, refresh it
    await syncFeed(normalized);
    return (await localDB.feeds.get(normalized))!;
  }

  const stub: LocalFeed = {
    id: normalized,
    url: feedUrl,
    title: feedUrl,
    status: 'syncing',
  };
  await localDB.feeds.put(stub);

  await syncFeed(normalized);

  return (await localDB.feeds.get(normalized))!;
}

/**
 * Refresh a single feed by its normalized ID (canonical URL key).
 * Fetches new XML, parses it in the worker, upserts posts without
 * overwriting user-controlled flags (isRead, isStarred).
 */
export async function syncFeed(feedId: string): Promise<void> {
  const feed = await localDB.feeds.get(feedId);
  if (!feed) throw new Error(`Feed not found in IndexedDB: ${feedId}`);

  await localDB.feeds.update(feedId, { status: 'syncing', errorMessage: undefined });

  try {
    const rawXml = await safeFetchThroughProxy(feed.url);
    const { title, posts, topics } = await parseFeedInWorker(rawXml, feedId);

    await localDB.feeds.update(feedId, {
      title,
      topics,
      status: 'active',
      lastFetchedAt: Date.now(),
      errorMessage: undefined,
    });

    // Upsert posts: skip if already stored (preserves isRead / isStarred)
    const existingIds = new Set(
      (await localDB.posts.where('feedId').equals(feedId).primaryKeys()) as string[],
    );
    const newPosts = posts.filter((p) => !existingIds.has(p.id));
    if (newPosts.length > 0) {
      await localDB.posts.bulkPut(newPosts);
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await localDB.feeds.update(feedId, { status: 'error', errorMessage });
  }
}

/**
 * Refresh all feeds that are currently active or in error state.
 * Runs concurrently and never throws (errors are stored per-feed).
 */
export async function syncAllFeeds(): Promise<void> {
  const feeds = await localDB.feeds.where('status').anyOf(['active', 'error']).toArray();
  await Promise.allSettled(feeds.map((f) => syncFeed(f.id)));
}

/**
 * Remove a feed and all its associated posts and cached articles from IndexedDB.
 */
export async function unsubscribeFeed(feedId: string): Promise<void> {
  const postIds = (await localDB.posts.where('feedId').equals(feedId).primaryKeys()) as string[];
  await localDB.transaction('rw', localDB.feeds, localDB.posts, localDB.articles, async () => {
    await localDB.articles.bulkDelete(postIds);
    await localDB.posts.where('feedId').equals(feedId).delete();
    await localDB.feeds.delete(feedId);
  });
}

// ── Article API ───────────────────────────────────────────────────────────────

/**
 * Returns a fully sanitized CachedArticle for a post.
 * - If already cached in IndexedDB, returns immediately (offline-ready).
 * - If offline and not cached, returns the post's summary as fallback.
 * - Otherwise, fetches via proxy, extracts via Readability in Worker, sanitizes
 *   via DOMPurify, stores in IndexedDB, and returns.
 */
export async function fetchAndCacheArticle(post: LocalPost): Promise<CachedArticle> {
  // Serve from cache first (offline-first)
  const cached = await localDB.articles.get(post.id);
  if (cached) return cached;

  // Offline with no cache: graceful degradation to summary
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      postId: post.id,
      content: `<p>${post.summary || 'Content unavailable offline'}</p>`,
      readingTimeMinutes: 1,
      cachedAt: Date.now(),
    };
  }

  const rawHtml = await safeFetchThroughProxy(post.link);
  const extracted = await extractArticleInWorker(rawHtml, post.id, post.summary);

  const article: CachedArticle = {
    postId: post.id,
    ...extracted,
    cachedAt: Date.now(),
  };

  await localDB.articles.put(article);
  return article;
}

// ── Post State API ────────────────────────────────────────────────────────────

/** Mark a post as read or unread. */
export async function markPostRead(postId: string, isRead: boolean): Promise<void> {
  await localDB.posts.update(postId, { isRead });
}

/** Toggle the starred state of a post. */
export async function toggleStarred(postId: string): Promise<boolean> {
  const post = await localDB.posts.get(postId);
  if (!post) throw new Error('Post not found in IndexedDB: ' + postId);
  const nextStarred = !Boolean(post.isStarred);
  await localDB.posts.update(postId, { isStarred: nextStarred });
  return nextStarred;
}

/** Explicitly set the starred state of a post. */
export async function setPostStarred(postId: string, isStarred: boolean): Promise<void> {
  await localDB.posts.update(postId, { isStarred: Boolean(isStarred) });
}

// ── Topic Aggregation (for Member A's Discovery view) ────────────────────────

/**
 * Aggregates TF-IDF topic keywords across all subscribed feeds.
 * Returns the top 10 terms by frequency, for use as semantic boost signals
 * in the Discovery view (passed to /api/discovery/recommendations).
 *
 * NOTE: No content ever leaves the browser — this is purely client-side.
 */
export async function getTopSubscribedTopics(): Promise<string[]> {
  const feeds = await localDB.feeds.toArray();
  const freq: Record<string, number> = {};

  for (const feed of feeds) {
    for (const topic of feed.topics ?? []) {
      freq[topic] = (freq[topic] ?? 0) + 1;
    }
  }

  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([term]) => term);
}

// ── Sync Manager — Auto-refresh on Network Reconnect ─────────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.info('[SyncManager] Network reconnected — refreshing all feeds');
    syncAllFeeds().catch(console.error);
  });
}
