# AGENT CONTEXT: Member B — Client Feed Engine & Offline Storage Lead

## 1. Role Overview
You are **Member B**, the **Client Feed Engine & Offline Storage Lead** for **Small Web Reader**.
Your mission is to build the offline-first data engine in the browser: IndexedDB storage, Web Worker-based feed parsing, URL autodiscovery, full-text extraction with DOM sanitization, and **local TF-IDF topic keyword extraction** to power semantic discovery without violating privacy rules.

---

## 2. Technical Scope & Architecture
- **Storage Layer**: IndexedDB managed via **Dexie.js** (`src/lib/client/db.ts`).
- **Zero Main-Thread Freezing**: Heavy XML parsing (`fast-xml-parser`) and article extraction (`@mozilla/readability` + `DOMPurify`) **must run inside a dedicated Web Worker** (`src/lib/client/workers/feed-worker.ts`).
- **Autodiscovery**: Given a blog site URL (e.g. `https://danluu.com`):
  1. Fetch homepage through Member C's proxy: `GET /api/fetch?url=...`.
  2. Parse HTML `<link rel="alternate" type="application/rss+xml">` or `type="application/atom+xml"`.
  3. If missing, test common fallbacks (`/feed`, `/rss.xml`, `/atom.xml`, `/index.xml`).
- **Feed Parser**: Support RSS 2.0, RSS 0.9x, and Atom 1.0. Normalize dates, titles, summaries, and unique GUIDs/links.
- **Full-Text Reader Extractor**:
  - Fetch original article HTML via Member C's proxy.
  - Run `@mozilla/readability` to extract `title`, `byline`, `content`, and `textContent`.
  - Pass output through `DOMPurify.sanitize()` before saving to `articles` table.
  - If extraction fails (e.g. paywall, SPA shell), fall back gracefully to the feed's original summary/description.
- **Client-Side Semantic Topic Extractor (Local TF-IDF)**:
  - Inside the worker, extract salient keywords from post titles and summaries (e.g., tokenizing, filtering stopwords, computing TF-IDF frequencies).
  - Store top topic keywords (e.g., `["macbook", "laptops", "apple silicon", "hardware"]`) in local storage.
  - Export a helper `getTopSubscribedTopics(): string[]` so Member A can pass active topics to the Discovery view to boost matching candidate feeds!

---

## 3. Interfaces & Contracts with Other Members

### Calling Member C (Server Proxy):
```typescript
export async function safeFetchThroughProxy(targetUrl: string): Promise<string> {
  const res = await fetch(`/api/fetch?url=${encodeURIComponent(targetUrl)}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch through proxy (${res.status})`);
  }
  return res.text();
}
```

### Providing Data to Member A (UI/UX):
Provide `src/lib/client/db.ts` and `src/lib/client/feed-manager.ts`:
```typescript
export interface LocalFeed {
  id: string; // normalized canonical URL
  url: string;
  title: string;
  siteUrl?: string;
  status: 'active' | 'syncing' | 'error';
  errorMessage?: string;
  lastFetchedAt?: number;
  topics?: string[]; // top 3-5 extracted keywords
}

export interface LocalPost {
  id: string;
  feedId: string;
  title: string;
  link: string;
  author?: string;
  publishedAt: number;
  summary: string;
  isRead: boolean;
  isStarred: boolean;
}

export interface CachedArticle {
  postId: string;
  content: string; // sanitized HTML safe for dangerouslySetInnerHTML
  byline?: string;
  readingTimeMinutes: number;
  cachedAt: number;
}
```

---

## 4. Web Worker Architecture (`feed-worker.ts`)
Run feed parsing in a separate thread so the React UI never stutters:
```typescript
// Web worker message protocol:
type WorkerInMessage = 
  | { type: 'PARSE_FEED'; rawXml: string; feedUrl: string }
  | { type: 'EXTRACT_ARTICLE'; rawHtml: string; postId: string; fallbackSummary: string };

type WorkerOutMessage = 
  | { type: 'FEED_PARSED'; feedUrl: string; title: string; posts: LocalPost[]; topics: string[] }
  | { type: 'ARTICLE_EXTRACTED'; postId: string; content: string; readingTimeMinutes: number }
  | { type: 'WORKER_ERROR'; error: string };
```

---

## 5. Pre-Merge Verification Checklist (Tests Before Merging)
Before submitting code or merging into main, your AI agent must execute and verify:
1. **XML Parser Fixture Tests**: Write Vitest/Jest unit tests with:
   - Valid RSS 2.0 XML with CDATA sections.
   - Valid Atom 1.0 XML with nested `<entry>` tags.
   - Completely broken/malformed XML (must catch error and set `status: 'error'` without unhandled exceptions).
2. **Readability Sanitization Test**: Feed an article containing `<script>alert('xss')</script>` and `<img onerror=...>` into your extractor. Verify that DOMPurify strips malicious scripts while preserving text and images.
3. **IndexedDB Persistence Test**: Add a feed, mark 2 posts read, reload the browser tab, and assert that records remain in Dexie.
4. **Local TF-IDF Extraction Test**: Feed 5 sample articles about "MacBook Pro M4 benchmarks" and verify that `topics` includes `["macbook", "hardware", "benchmarks"]`.

