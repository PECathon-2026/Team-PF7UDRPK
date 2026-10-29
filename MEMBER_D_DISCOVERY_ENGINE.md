# AGENT CONTEXT: Member D — Discovery API & Recommendation Engine Lead

## 1. Role Overview
You are **Member D**, the **Discovery API & Recommendation Engine Lead** for **Small Web Reader**.
Your mission is to build the core algorithmic differentiator: an anonymous, database-backed co-subscription recommendation service, transparent explanation generator, the **10–15% Serendipitous Exploration engine**, and the **Automated Seed Trap Detector** (to claim the 10-point hackathon bonus bounty).

---

## 2. Technical Scope & Architecture

### A. Database Schema (`src/lib/db/schema.ts` with Drizzle ORM)
```typescript
import { pgTable, text, timestamp, integer, uuid, index } from 'drizzle-orm/pg-core';

export const feeds = pgTable('feeds', {
  id: uuid('id').defaultRandom().primaryKey(),
  normalizedUrl: text('normalized_url').notNull().unique(), // e.g. "danluu.com"
  originalUrl: text('original_url').notNull(),              // e.g. "https://danluu.com/atom.xml"
  title: text('title').notNull(),
  siteUrl: text('site_url'),
  subscriberCount: integer('subscriber_count').default(1).notNull(),
  category: text('category').default('general'),           // broad cluster: 'systems', 'design', 'essays'
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
}, (table) => [
  index('idx_normalized_url').on(table.normalizedUrl),
]);

export const anonymousBatches = pgTable('anonymous_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(), // e.g. 90-day TTL
});

export const batchFeeds = pgTable('batch_feeds', {
  id: uuid('id').defaultRandom().primaryKey(),
  batchId: uuid('batch_id').references(() => anonymousBatches.id, { onDelete: 'cascade' }).notNull(),
  feedId: uuid('feed_id').references(() => feeds.id, { onDelete: 'cascade' }).notNull(),
}, (table) => [
  index('idx_batch_feed_pair').on(table.batchId, table.feedId),
  index('idx_feed_batch').on(table.feedId, table.batchId),
]);
```

### B. URL Canonical Normalization (`src/lib/discovery/normalize-url.ts`)
Must normalize URLs so the same blog under varying links counts as a single entity:
- Strip protocol (`https://`, `http://`).
- Strip `www.` subdomain.
- Strip trailing slashes (`/`).
- Strip tracking query parameters (`utm_*`, `ref`, `source`, `rss`).
- Strip common feed endpoints when identifying the blog entity (`/feed`, `/rss.xml`, `/atom.xml`, `/index.xml`).
- Example: `https://www.danluu.com/atom.xml?utm_source=feed` $\rightarrow$ `danluu.com`.

### C. Recommendation & Serendipity Scoring (`src/app/api/discovery/recommendations/route.ts`)
When user provides their followed feed URLs:
1. **Co-Subscription Query**:
   Find all batches that contain the user's subscribed feeds. Find what other feeds exist in those same batches (excluding the user's feeds):
   ```sql
   SELECT 
     f.normalized_url, 
     f.title, 
     f.site_url, 
     f.original_url,
     f.subscriber_count,
     COUNT(DISTINCT b2.batch_id) AS co_occurrence_count
   FROM batch_feeds b1
   JOIN batch_feeds b2 ON b1.batch_id = b2.batch_id
   JOIN feeds f ON b2.feed_id = f.id
   WHERE b1.feed_id IN (SELECT id FROM feeds WHERE normalized_url = ANY($userFeeds))
     AND f.normalized_url != ALL($userFeeds)
   GROUP BY f.id
   ORDER BY co_occurrence_count DESC, f.subscriber_count DESC
   LIMIT 10;
   ```
2. **Transparent Reason Tagging**:
   - Calculate which user feed had the strongest overlap: `"Followed by 68% of readers of Dan Luu"`.
   - Cold start fallback: If user follows no feeds yet, return top blogs with tag `"Trending on the Small Web"`.
3. **10–15% Serendipitous Exploration Shelf**:
   - Query 2–3 high-scoring blogs outside the user's matched co-subscription cluster.
   - Tag with `"✨ Serendipity Pick: Step outside your bubble"`.

### D. Automated Seed Trap Detector (`src/lib/discovery/trap-detector.ts`)
*Crucial for the 10-Point Bonus Quest:*
The hackathon mentors hide deliberate traps in the 10–15 seed list (two URLs pointing to the exact same blog, or a malformed feed).
Build a detector function/script that tests the seed list for:
1. **Duplicate Canonical Blog Trap**: Normalizes both URLs and detects when two different URLs resolve to the same canonical blog domain or identical RSS feed title.
2. **Redirect Loop Trap**: Checks if URL A redirects to URL B via HTTP 301/302.
3. **Malformed XML Trap**: Tries parsing XML and flags fatal syntax errors or 404 dead endpoints.
- Output report format:
  ```json
  {
    "trapDetected": true,
    "type": "DUPLICATE_BLOG_ALIAS",
    "details": "Seed item #3 ('https://example.com/rss') and #9 ('https://example.com/feed.xml') resolve to the identical blog 'Example Post'.",
    "recommendation": "Report to mentors immediately for 10 bonus points."
  }
  ```

---

## 3. Interfaces & Contracts with Other Members

### With Member C (Security):
Use Member C's `validateSubmissionIntegrity(req, powSolution)` in `POST /api/discovery/submit`.

### With Member A (UI):
Serve typed JSON responses for `/api/discovery/recommendations`:
```typescript
export interface DiscoveryRecommendationResponse {
  recommendations: Array<{
    feedUrl: string;
    normalizedUrl: string;
    title: string;
    siteUrl: string;
    reason: string;
    score: number;
  }>;
  serendipityPicks: Array<{
    feedUrl: string;
    normalizedUrl: string;
    title: string;
    siteUrl: string;
    reason: string;
  }>;
}
```

---

## 4. Pre-Merge Verification Checklist (Tests Before Merging)
Before submitting code or merging into main, your AI agent must execute and verify:
1. **URL Normalizer Tests**: Verify that `https://danluu.com/`, `http://danluu.com/feed`, and `http://www.danluu.com?utm_medium=rss` all normalize to `danluu.com`.
2. **Co-Occurrence SQL Test**: Seed 3 mock anonymous batches:
   - Batch 1: `[danluu.com, simonwillison.net, robinsloan.com]`
   - Batch 2: `[danluu.com, simonwillison.net, kottke.org]`
   - Batch 3: `[danluu.com, casualkitchen.blogspot.com]`
   When queried with `[danluu.com]`, `simonwillison.net` must rank #1 with co-occurrence = 2, and `danluu.com` must never be recommended to itself.
3. **Trap Detector Test**: Feed a dummy list containing both `https://site.com/rss` and `https://site.com/feed`, assert that the Trap Detector catches the duplicate.
4. **Serendipity Allocation Test**: Assert that the API always returns 2–3 blogs in `serendipityPicks` distinct from the user's primary recommendation cluster.

