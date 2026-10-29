import { describe, it, expect, beforeEach } from 'vitest';
import { SmallWebReaderDB, LocalPost, LocalFeed } from '@/lib/client/db';
import { toggleStarred, setPostStarred } from '@/lib/client/feed-manager';

describe('Starred Feature Complete Verification', () => {
  let db: SmallWebReaderDB;

  beforeEach(async () => {
    db = new SmallWebReaderDB();
    await db.feeds.clear();
    await db.posts.clear();
    await db.articles.clear();
  });

  it('1-2. Stars and unstars an article with immediate state change', async () => {
    const post: LocalPost = {
      id: 'article-1',
      feedId: 'danluu.com',
      title: 'Dan Luu Systems Essay',
      link: 'https://danluu.com/post/1',
      publishedAt: Date.now() - 5000,
      summary: 'Computer architecture notes',
      isRead: false,
      isStarred: false,
    };

    await db.posts.put(post);

    // Initial state: not starred
    let item = await db.posts.get('article-1');
    expect(item?.isStarred).toBe(false);

    // Star the article
    const starredState = await toggleStarred('article-1');
    expect(starredState).toBe(true);

    item = await db.posts.get('article-1');
    expect(item?.isStarred).toBe(true);

    // Unstar the article
    const unstarredState = await toggleStarred('article-1');
    expect(unstarredState).toBe(false);

    item = await db.posts.get('article-1');
    expect(item?.isStarred).toBe(false);
  });

  it('3-4. Starred state persists across database re-instantiation (simulating browser refresh)', async () => {
    const post: LocalPost = {
      id: 'article-persist',
      feedId: 'simonwillison.net',
      title: 'Simon Willison LLM notes',
      link: 'https://simonwillison.net/2026/notes',
      publishedAt: Date.now(),
      summary: 'Datasette and LLM tools',
      isRead: false,
      isStarred: false,
    };
    await db.posts.put(post);

    // Star the article
    await setPostStarred('article-persist', true);

    // Simulate browser close / refresh by closing db connection and creating new instance
    db.close();
    const freshDb = new SmallWebReaderDB();

    const restored = await freshDb.posts.get('article-persist');
    expect(restored).toBeDefined();
    expect(restored?.isStarred).toBe(true);

    freshDb.close();
  });

  it('5-8. Starred section filtering: shows only starred articles and removes unstarred immediately', async () => {
    const post1: LocalPost = {
      id: 'post-a',
      feedId: 'danluu.com',
      title: 'Architecture Essay',
      link: 'https://danluu.com/a',
      publishedAt: 1000,
      summary: 'Summary A',
      isRead: true,
      isStarred: true,
    };

    const post2: LocalPost = {
      id: 'post-b',
      feedId: 'jvns.ca',
      title: 'Networking Zine',
      link: 'https://jvns.ca/b',
      publishedAt: 2000,
      summary: 'Summary B',
      isRead: false,
      isStarred: false,
    };

    const post3: LocalPost = {
      id: 'post-c',
      feedId: 'robinsloan.com',
      title: 'Artisanal Web',
      link: 'https://robinsloan.com/c',
      publishedAt: 3000,
      summary: 'Summary C',
      isRead: false,
      isStarred: true,
    };

    await db.posts.bulkPut([post1, post2, post3]);

    // Query starred view (exact query used in Timeline and Sidebar)
    const starredQuery = () =>
      db.posts
        .orderBy('publishedAt')
        .reverse()
        .filter((p) => Boolean(p.isStarred))
        .toArray();

    const starredCountQuery = () =>
      db.posts.filter((p) => Boolean(p.isStarred)).count();

    // Check count and list
    let starredList = await starredQuery();
    let count = await starredCountQuery();

    expect(count).toBe(2);
    expect(starredList.length).toBe(2);
    expect(starredList[0].id).toBe('post-c'); // newest first
    expect(starredList[1].id).toBe('post-a');

    // Unstar post-a (simulating unstarring from reader or timeline)
    await toggleStarred('post-a');

    // Confirm it disappears from Starred list immediately
    starredList = await starredQuery();
    count = await starredCountQuery();

    expect(count).toBe(1);
    expect(starredList.length).toBe(1);
    expect(starredList[0].id).toBe('post-c');
  });

  it('9-10. State consistency between timeline, reader, and all articles view', async () => {
    const post: LocalPost = {
      id: 'consistent-post',
      feedId: 'drewdevault.com',
      title: 'Hare Systems Blog',
      link: 'https://drewdevault.com/hare',
      publishedAt: Date.now(),
      summary: 'Hare programming language',
      isRead: false,
      isStarred: false,
    };
    await db.posts.put(post);

    // Initial All Articles query
    const allPosts = await db.posts.orderBy('publishedAt').reverse().toArray();
    expect(allPosts[0].isStarred).toBe(false);

    // Toggle star
    await toggleStarred('consistent-post');

    // Query timeline all articles
    const updatedAllPosts = await db.posts.orderBy('publishedAt').reverse().toArray();
    expect(updatedAllPosts[0].isStarred).toBe(true);

    // Query direct reader post
    const readerPost = await db.posts.get('consistent-post');
    expect(readerPost?.isStarred).toBe(true);

    // Query starred view
    const starredPosts = await db.posts
      .orderBy('publishedAt')
      .reverse()
      .filter((p) => Boolean(p.isStarred))
      .toArray();
    expect(starredPosts.length).toBe(1);
    expect(starredPosts[0].id).toBe('consistent-post');
  });
});

