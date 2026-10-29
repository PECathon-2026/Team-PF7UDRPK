import { pgTable, text, timestamp, integer, uuid, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Feeds Table
 * Represents unique blogs discovered on the Small Web.
 * Deduped by normalizedUrl.
 */
export const feeds = pgTable(
  'feeds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    normalizedUrl: text('normalized_url').notNull().unique(), // e.g. "danluu.com"
    originalUrl: text('original_url').notNull(),              // e.g. "https://danluu.com/atom.xml"
    title: text('title').notNull(),
    siteUrl: text('site_url'),
    subscriberCount: integer('subscriber_count').default(1).notNull(),
    category: text('category').default('general').notNull(), // 'systems', 'design', 'web', 'essays', etc.
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_normalized_url').on(table.normalizedUrl),
    index('idx_category').on(table.category),
  ]
);

/**
 * Anonymous Batches Table
 * Stores opt-in submission sessions with a 90-day TTL.
 * Completely anonymous: NO user IDs, NO cookies, NO IPs stored.
 */
export const anonymousBatches = pgTable('anonymous_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});

/**
 * Batch Feeds Join Table
 * Represents anonymous co-occurrences of feeds within a single client subscription batch.
 */
export const batchFeeds = pgTable(
  'batch_feeds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    batchId: uuid('batch_id')
      .references(() => anonymousBatches.id, { onDelete: 'cascade' })
      .notNull(),
    feedId: uuid('feed_id')
      .references(() => feeds.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [
    index('idx_batch_feed_pair').on(table.batchId, table.feedId),
    index('idx_feed_batch').on(table.feedId, table.batchId),
  ]
);

// Drizzle Relations
export const feedsRelations = relations(feeds, ({ many }) => ({
  batchFeeds: many(batchFeeds),
}));

export const anonymousBatchesRelations = relations(anonymousBatches, ({ many }) => ({
  batchFeeds: many(batchFeeds),
}));

export const batchFeedsRelations = relations(batchFeeds, ({ one }) => ({
  batch: one(anonymousBatches, {
    fields: [batchFeeds.batchId],
    references: [anonymousBatches.id],
  }),
  feed: one(feeds, {
    fields: [batchFeeds.feedId],
    references: [feeds.id],
  }),
}));

export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
export type AnonymousBatch = typeof anonymousBatches.$inferSelect;
export type BatchFeed = typeof batchFeeds.$inferSelect;

