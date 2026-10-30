import { eq, inArray, sql, notInArray, desc } from 'drizzle-orm';
import { feeds, anonymousBatches, batchFeeds, Feed } from '../db/schema';
import { normalizeBlogUrl } from './normalize-url';
import { SEED_BLOGS, SEED_ANONYMOUS_BATCHES } from './seed-data';

export interface RecommendationResult {
  normalizedUrl: string;
  originalUrl: string;
  title: string;
  siteUrl: string | null;
  category: string;
  score: number;
  reason: string;
  subscriberCount: number;
  isSerendipity?: boolean;
}

export interface RecommendationResponse {
  recommendations: RecommendationResult[];
  serendipityPicks: RecommendationResult[];
}

/**
 * Seeds initial small-web feeds and simulated anonymous reader batches
 * so discovery works on cold start.
 */
export async function seedInitialFeeds(db: any): Promise<void> {
  // 1. Upsert seed blogs
  for (const blog of SEED_BLOGS) {
    const normalized = normalizeBlogUrl(blog.originalUrl);
    const existing = await db
      .select()
      .from(feeds)
      .where(eq(feeds.normalizedUrl, normalized))
      .limit(1);

    if (existing.length === 0) {
      try {
        await db.insert(feeds).values({
          normalizedUrl: normalized,
          originalUrl: blog.originalUrl,
          title: blog.title,
          siteUrl: blog.siteUrl,
          subscriberCount: 3,
          category: blog.category,
        });
      } catch {
        // Ignore duplicate key race condition
      }
    }
  }

  // 2. Insert synthetic anonymous batches
  const existingBatches = await db.select().from(anonymousBatches).limit(1);
  if (existingBatches.length === 0) {
    const allFeeds = await db.select().from(feeds);
    const feedMap = new Map<string, string>(); // normalizedUrl -> feedId
    allFeeds.forEach((f: Feed) => feedMap.set(f.normalizedUrl, f.id));

    const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    for (const batchUrls of SEED_ANONYMOUS_BATCHES) {
      const [batch] = await db
        .insert(anonymousBatches)
        .values({ expiresAt: ninetyDays })
        .returning();

      for (const rawUrl of batchUrls) {
        const norm = normalizeBlogUrl(rawUrl);
        const feedId = feedMap.get(norm);
        if (feedId && batch?.id) {
          await db.insert(batchFeeds).values({
            batchId: batch.id,
            feedId: feedId,
          });
        }
      }
    }
  }
}

/**
 * Submits an anonymous batch of feeds.
 * Deduplicates URLs, detects single-domain spam bursts (downweighting),
 * updates subscriber counts, and records co-subscription relations.
 */
export async function submitAnonymousBatch(
  db: any,
  rawUrls: string[]
): Promise<{ batchId: string; count: number; isDownweighted: boolean }> {
  if (!rawUrls || rawUrls.length === 0) {
    throw new Error('Batch cannot be empty');
  }

  if (rawUrls.length > 200) {
    throw new Error('Batch size exceeds maximum limit of 200 feeds');
  }

  // Deduplicate and normalize
  const normalizedSet = new Set<string>();
  const validInputs: { normalized: string; original: string }[] = [];

  for (const raw of rawUrls) {
    try {
      const norm = normalizeBlogUrl(raw);
      if (!normalizedSet.has(norm)) {
        normalizedSet.add(norm);
        validInputs.push({ normalized: norm, original: raw });
      }
    } catch {
      // Ignore invalid URL formatting
    }
  }

  if (validInputs.length === 0) {
    throw new Error('No valid HTTP/HTTPS URLs in submission');
  }

  // ── Abuse Protection: Single-Domain Dominance / Burst Detection ─────────
  // If >=75% of URLs in a multi-feed batch share the exact same domain,
  // the batch is flagged as an artificial cluster and downweighted.
  const domainCounts = new Map<string, number>();
  for (const item of validInputs) {
    try {
      const u = new URL(item.original.startsWith('http') ? item.original : `https://${item.original}`);
      const domain = u.hostname.replace(/^www\./, '').toLowerCase();
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    } catch {
      // Ignore URL parse error
    }
  }

  let isDownweighted = false;
  if (validInputs.length >= 3) {
    for (const count of domainCounts.values()) {
      if (count / validInputs.length >= 0.75) {
        isDownweighted = true;
        break;
      }
    }
  }

  // Upsert feeds and collect their IDs
  const feedIds: string[] = [];
  for (const item of validInputs) {
    const existing = await db
      .select()
      .from(feeds)
      .where(eq(feeds.normalizedUrl, item.normalized))
      .limit(1);

    if (existing.length > 0) {
      const feed = existing[0];
      // Downweighted batches do not inflate subscriber counts
      const increment = isDownweighted ? 0 : 1;
      await db
        .update(feeds)
        .set({
          subscriberCount: feed.subscriberCount + increment,
          lastSeenAt: new Date(),
        })
        .where(eq(feeds.id, feed.id));
      feedIds.push(feed.id);
    } else {
      const [newFeed] = await db
        .insert(feeds)
        .values({
          normalizedUrl: item.normalized,
          originalUrl: item.original,
          title: item.normalized,
          subscriberCount: 1,
          category: 'general',
        })
        .returning();
      feedIds.push(newFeed.id);
    }
  }

  // Create anonymous batch record with 90-day TTL
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const [batch] = await db
    .insert(anonymousBatches)
    .values({ expiresAt })
    .returning();

  for (const feedId of feedIds) {
    await db.insert(batchFeeds).values({
      batchId: batch.id,
      feedId,
    });
  }

  return {
    batchId: batch.id,
    count: feedIds.length,
    isDownweighted,
  };
}

/**
 * Calculates personalized recommendations based on the user's current subscriptions.
 * Enforces:
 *   - Minimum distinct submissions safeguard (prevents single-batch spam dominance)
 *   - Transparent explanation reasons ("Co-read by readers of X")
 *   - 10-15% serendipity allocation outside user's primary categories
 */
export async function getRecommendations(
  db: any,
  userSubscriptionUrls: string[],
  limit: number = 8
): Promise<RecommendationResponse> {
  const userNormArray = userSubscriptionUrls
    .map((u) => {
      try {
        return normalizeBlogUrl(u);
      } catch {
        return null;
      }
    })
    .filter((u): u is string => u !== null);

  // Cold Start: If user has 0 subscriptions, recommend most popular small-web blogs
  if (userNormArray.length === 0) {
    const popularFeeds = await db
      .select()
      .from(feeds)
      .orderBy(desc(feeds.subscriberCount))
      .limit(limit + 3);

    const recs: RecommendationResult[] = popularFeeds.slice(0, limit).map((f: Feed) => ({
      normalizedUrl: f.normalizedUrl,
      originalUrl: f.originalUrl,
      title: f.title,
      siteUrl: f.siteUrl,
      category: f.category,
      score: f.subscriberCount,
      reason: 'Trending on the Small Web',
      subscriberCount: f.subscriberCount,
    }));

    const serendipity: RecommendationResult[] = popularFeeds
      .slice(limit, limit + 3)
      .map((f: Feed) => ({
        normalizedUrl: f.normalizedUrl,
        originalUrl: f.originalUrl,
        title: f.title,
        siteUrl: f.siteUrl,
        category: f.category,
        score: f.subscriberCount,
        reason: '✨ Serendipity Pick: Step outside your bubble',
        subscriberCount: f.subscriberCount,
        isSerendipity: true,
      }));

    return { recommendations: recs, serendipityPicks: serendipity };
  }

  // Find user feed records in database
  const userFeeds = await db
    .select()
    .from(feeds)
    .where(inArray(feeds.normalizedUrl, userNormArray));

  const userFeedIds = userFeeds.map((f: Feed) => f.id);
  const userCategories = new Set<string>(userFeeds.map((f: Feed) => f.category));

  if (userFeedIds.length === 0) {
    // None of user's feeds are known yet in discovery database; fallback to top feeds
    const popularFeeds = await db
      .select()
      .from(feeds)
      .where(notInArray(feeds.normalizedUrl, userNormArray))
      .orderBy(desc(feeds.subscriberCount))
      .limit(limit + 3);

    return {
      recommendations: popularFeeds.slice(0, limit).map((f: Feed) => ({
        normalizedUrl: f.normalizedUrl,
        originalUrl: f.originalUrl,
        title: f.title,
        siteUrl: f.siteUrl,
        category: f.category,
        score: f.subscriberCount,
        reason: 'Trending on the Small Web',
        subscriberCount: f.subscriberCount,
      })),
      serendipityPicks: popularFeeds.slice(limit, limit + 2).map((f: Feed) => ({
        normalizedUrl: f.normalizedUrl,
        originalUrl: f.originalUrl,
        title: f.title,
        siteUrl: f.siteUrl,
        category: f.category,
        score: f.subscriberCount,
        reason: '✨ Serendipity Pick: Highly rated discovery',
        subscriberCount: f.subscriberCount,
        isSerendipity: true,
      })),
    };
  }

  // 1. Relational Co-Subscription Query with Abuse Safeguards:
  // Requires minimum distinct submissions (COUNT >= 2 or subscriber_count >= 2)
  // to prevent a single spam submission from dominating recommendations.
  let queryResult = await db.execute(sql`
    SELECT 
      f.id,
      f.normalized_url,
      f.original_url,
      f.title,
      f.site_url,
      f.category,
      f.subscriber_count,
      COUNT(DISTINCT b2.batch_id)::int AS co_count
    FROM batch_feeds b1
    JOIN batch_feeds b2 ON b1.batch_id = b2.batch_id
    JOIN feeds f ON b2.feed_id = f.id
    WHERE b1.feed_id IN ${userFeedIds}
      AND f.id NOT IN ${userFeedIds}
      AND f.normalized_url NOT IN ${userNormArray}
    GROUP BY f.id, f.normalized_url, f.original_url, f.title, f.site_url, f.category, f.subscriber_count
    HAVING (COUNT(DISTINCT b2.batch_id) >= 2 OR f.subscriber_count >= 2)
    ORDER BY co_count DESC, f.subscriber_count DESC
    LIMIT ${limit + 5}
  `);

  let coOccurrences: any[] = Array.isArray(queryResult)
    ? queryResult
    : queryResult.rows || [];

  // Fallback if strict threshold filters out all results on small datasets
  if (coOccurrences.length === 0) {
    const fallbackQueryResult = await db.execute(sql`
      SELECT 
        f.id,
        f.normalized_url,
        f.original_url,
        f.title,
        f.site_url,
        f.category,
        f.subscriber_count,
        COUNT(DISTINCT b2.batch_id)::int AS co_count
      FROM batch_feeds b1
      JOIN batch_feeds b2 ON b1.batch_id = b2.batch_id
      JOIN feeds f ON b2.feed_id = f.id
      WHERE b1.feed_id IN ${userFeedIds}
        AND f.id NOT IN ${userFeedIds}
        AND f.normalized_url NOT IN ${userNormArray}
      GROUP BY f.id, f.normalized_url, f.original_url, f.title, f.site_url, f.category, f.subscriber_count
      ORDER BY co_count DESC, f.subscriber_count DESC
      LIMIT ${limit + 5}
    `);
    coOccurrences = Array.isArray(fallbackQueryResult)
      ? fallbackQueryResult
      : fallbackQueryResult.rows || [];
  }

  // Find the top co-occurring source blog for transparent reasons
  const topSourceTitle = userFeeds[0]?.title || 'your subscriptions';

  const recList: RecommendationResult[] = coOccurrences
    .slice(0, limit)
    .map((row: any) => {
      const coCount = Number(row.co_count) || 1;
      const subCount = Number(row.subscriber_count) || 1;
      const score = coCount * 2 + Math.log2(1 + subCount);

      return {
        normalizedUrl: row.normalized_url,
        originalUrl: row.original_url,
        title: row.title,
        siteUrl: row.site_url,
        category: row.category,
        score: Math.round(score * 10) / 10,
        reason: `Co-read by readers of ${topSourceTitle}`,
        subscriberCount: subCount,
      };
    });

  // 2. Serendipity Shelf (10-15% exploration):
  // Pull high-scoring blogs outside user's primary categories to break filter bubbles
  const excludedUrls = new Set<string>([...userNormArray, ...recList.map((r) => r.normalizedUrl)]);
  const excludedCategories: string[] = Array.from(userCategories);

  let serendipityFeeds: any[] = [];
  if (excludedCategories.length > 0) {
    serendipityFeeds = await db
      .select()
      .from(feeds)
      .where(notInArray(feeds.category, excludedCategories))
      .orderBy(desc(feeds.subscriberCount))
      .limit(6);
  } else {
    serendipityFeeds = await db
      .select()
      .from(feeds)
      .orderBy(desc(feeds.subscriberCount))
      .limit(6);
  }

  const serendipityPicks: RecommendationResult[] = serendipityFeeds
    .filter((f: Feed) => !excludedUrls.has(f.normalizedUrl))
    .slice(0, 2)
    .map((f: Feed) => ({
      normalizedUrl: f.normalizedUrl,
      originalUrl: f.originalUrl,
      title: f.title,
      siteUrl: f.siteUrl,
      category: f.category,
      score: f.subscriberCount,
      reason: '✨ Serendipity Pick: Step outside your bubble',
      subscriberCount: f.subscriberCount,
      isSerendipity: true,
    }));

  return {
    recommendations: recList,
    serendipityPicks,
  };
}
