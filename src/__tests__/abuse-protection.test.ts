import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../lib/db/client';
import {
  seedInitialFeeds,
  submitAnonymousBatch,
  getRecommendations,
} from '../lib/discovery/engine';

describe('Abuse Protection & Safeguards (Priority 3 & 4)', () => {
  let db: any;

  beforeEach(async () => {
    db = await createTestDb();
    await seedInitialFeeds(db);
  });

  it('detects and downweights single-domain spam bursts', async () => {
    // An attacker tries to game the discovery graph by submitting multiple URLs from the same domain
    const spamBatch = [
      'https://spam-network.xyz/feed1.xml',
      'https://spam-network.xyz/feed2.xml',
      'https://spam-network.xyz/feed3.xml',
      'https://spam-network.xyz/feed4.xml',
    ];

    const result = await submitAnonymousBatch(db, spamBatch);
    expect(result.count).toBe(4);
    expect(result.isDownweighted).toBe(true);
  });

  it('does not downweight legitimate diverse multi-domain batches', async () => {
    const legitBatch = [
      'https://danluu.com/atom.xml',
      'https://simonwillison.net/atom/entries/',
      'https://jvns.ca/atom.xml',
    ];

    const result = await submitAnonymousBatch(db, legitBatch);
    expect(result.count).toBe(3);
    expect(result.isDownweighted).toBe(false);
  });

  it('enforces minimum distinct submissions for unverified feeds in recommendations', async () => {
    // 1. Submit an unverified feed only once in a batch alongside Dan Luu
    const singleBatch = [
      'https://danluu.com/atom.xml',
      'https://unverified-new-blog.io/feed.xml',
    ];
    await submitAnonymousBatch(db, singleBatch);

    // 2. Query recommendations for Dan Luu:
    // With only 1 submission (subscriber_count = 1, co_count = 1), unverified feed must NOT be recommended
    const res1 = await getRecommendations(db, ['https://danluu.com/atom.xml']);
    const urls1 = res1.recommendations.map((r) => r.normalizedUrl);
    expect(urls1).not.toContain('unverified-new-blog.io');

    // 3. Submit a second independent batch with the same feed
    const secondBatch = [
      'https://danluu.com/atom.xml',
      'https://unverified-new-blog.io/feed.xml',
    ];
    await submitAnonymousBatch(db, secondBatch);

    // 4. Now with 2 distinct submissions (co_count >= 2, subscriber_count >= 2), it qualifies
    const res2 = await getRecommendations(db, ['https://danluu.com/atom.xml']);
    const urls2 = res2.recommendations.map((r) => r.normalizedUrl);
    expect(urls2).toContain('unverified-new-blog.io');
  });
});
