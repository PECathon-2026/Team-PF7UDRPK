import Dexie, { Table } from 'dexie';

export interface LocalFeed {
  id: string; // normalized canonical URL (primary key)
  url: string;
  title: string;
  siteUrl?: string;
  lastFetchedAt?: number;
  status: 'active' | 'error' | 'syncing';
  errorMessage?: string;
  topics?: string[]; // top 3-5 TF-IDF extracted keywords
  etag?: string; // HTTP ETag from upstream for conditional 304 fetching
  lastModified?: string; // HTTP Last-Modified header for conditional 304 fetching
}

export interface LocalPost {
  id: string; // feedId + GUID hash
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
  content: string; // DOMPurify-sanitized HTML, safe for dangerouslySetInnerHTML
  byline?: string;
  readingTimeMinutes: number;
  cachedAt: number;
}

export class SmallWebReaderDB extends Dexie {
  feeds!: Table<LocalFeed, string>;
  posts!: Table<LocalPost, string>;
  articles!: Table<CachedArticle, string>;

  constructor() {
    super('SmallWebReaderDB');
    this.version(1).stores({
      feeds: 'id, url, status',
      posts: 'id, feedId, publishedAt, isRead, isStarred',
      articles: 'postId, cachedAt',
    });
  }
}

export const localDB = new SmallWebReaderDB();
