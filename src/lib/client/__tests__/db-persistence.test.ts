import { describe, it, expect, beforeEach } from 'vitest';
import { SmallWebReaderDB, LocalFeed, LocalPost } from '../db';

describe('IndexedDB Persistence (Dexie.js)', () => {
  let db: SmallWebReaderDB;

  beforeEach(async () => {
    // Fresh DB instance per test
    db = new SmallWebReaderDB();
    await db.feeds.clear();
    await db.posts.clear();
    await db.articles.clear();
  });

  it('persists feeds and posts, updates read state, and persists across re-instantiation', async () => {
    const feed: LocalFeed = {
      id: 'example.com/feed',
      url: 'https://example.com/feed.xml',
      title: 'Example Tech Blog',
      status: 'active',
      topics: ['tech', 'engineering'],
    };

    const post1: LocalPost = {
      id: 'post-1',
      feedId: feed.id,
      title: 'First Post',
      link: 'https://example.com/posts/1',
      publishedAt: Date.now() - 10000,
      summary: 'Summary 1',
      isRead: false,
      isStarred: false,
    };

    const post2: LocalPost = {
      id: 'post-2',
      feedId: feed.id,
      title: 'Second Post',
      link: 'https://example.com/posts/2',
      publishedAt: Date.now() - 5000,
      summary: 'Summary 2',
      isRead: false,
      isStarred: false,
    };

    // Add feed and posts
    await db.feeds.put(feed);
    await db.posts.bulkPut([post1, post2]);

    // Mark 2 posts as read
    await db.posts.update('post-1', { isRead: true });
    await db.posts.update('post-2', { isRead: true });

    // Simulate "reload browser tab" by closing and reopening a new instance of SmallWebReaderDB
    db.close();
    const reloadedDb = new SmallWebReaderDB();

    const storedFeed = await reloadedDb.feeds.get('example.com/feed');
    expect(storedFeed).toBeDefined();
    expect(storedFeed?.title).toBe('Example Tech Blog');
    expect(storedFeed?.topics).toEqual(['tech', 'engineering']);

    const storedPost1 = await reloadedDb.posts.get('post-1');
    const storedPost2 = await reloadedDb.posts.get('post-2');

    expect(storedPost1?.isRead).toBe(true);
    expect(storedPost2?.isRead).toBe(true);
    expect(storedPost1?.title).toBe('First Post');
    expect(storedPost2?.title).toBe('Second Post');

    reloadedDb.close();
  });
});

