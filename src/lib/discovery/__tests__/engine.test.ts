import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../db/client';
import {
  seedInitialFeeds,
  submitAnonymousBatch,
  getRecommendations,
} from '../engine';

describe('Discovery Recommendation Engine', () => {
  let db: any;

  beforeEach(async () => {
    db = await createTestDb();
    await seedInitialFeeds(db);
  });

  it('provides cold start recommendations when user has no subscriptions', async () => {
    const res = await getRecommendations(db, []);
    expect(res.recommendations.length).toBeGreaterThan(0);
    expect(res.serendipityPicks.length).toBeGreaterThan(0);
    expect(res.recommendations[0].reason).toContain('Trending');
  });

  it('ranks co-subscribed feeds highest and excludes user own feeds', async () => {
    // Dan Luu is in systems category and co-subscribed with Simon Willison & Julia Evans
    const res = await getRecommendations(db, ['https://danluu.com/atom.xml']);

    expect(res.recommendations.length).toBeGreaterThan(0);

    // Dan Luu must NEVER be recommended to himself
    const recommendedUrls = res.recommendations.map((r) => r.normalizedUrl);
    expect(recommendedUrls).not.toContain('danluu.com');

    // Transparent reason should cite co-reading
    expect(res.recommendations[0].reason).toContain('Co-read');
  });

  it('allocates 10-15% serendipitous exploration outside user primary category', async () => {
    // User follows systems blog
    const res = await getRecommendations(db, ['https://danluu.com/atom.xml']);

    expect(res.serendipityPicks.length).toBeGreaterThanOrEqual(1);
    const pick = res.serendipityPicks[0];
    expect(pick.isSerendipity).toBe(true);
    expect(pick.reason).toContain('Serendipity Pick');
    // Serendipity pick should not be in 'systems' category
    expect(pick.category).not.toBe('systems');
  });

  it('records anonymous batches and updates co-occurrence scores', async () => {
    const newBatch = [
      'https://danluu.com/atom.xml',
      'https://xeiaso.net/blog.rss',
    ];

    const result = await submitAnonymousBatch(db, newBatch);
    expect(result.count).toBe(2);

    // After this batch, querying Dan Luu should elevate Xe Iaso
    const res = await getRecommendations(db, ['https://danluu.com/atom.xml']);
    const urls = res.recommendations.map((r) => r.normalizedUrl);
    expect(urls).toContain('xeiaso.net');
  });
});
