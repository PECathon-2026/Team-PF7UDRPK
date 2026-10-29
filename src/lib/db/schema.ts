/**
 * src/lib/db/schema.ts — Server-side PostgreSQL schema (Member D's domain)
 *
 * This file is a STUB created by Member B for team alignment.
 * Member D owns all implementation details: Drizzle migrations, Neon/Supabase
 * connection, seed data, and the recommendation engine queries.
 *
 * Schema matches the spec exactly. Do NOT modify the table names or column
 * types without coordinating with Member D.
 */

import { pgTable, text, timestamp, integer, uuid, index } from 'drizzle-orm/pg-core';

/**
 * Server-side `feeds` table — tracks all known feeds in the discovery system.
 * NOT to be confused with the client-side `LocalFeed` in Dexie (src/lib/client/db.ts).
 */
export const feeds = pgTable(
  'feeds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    normalizedUrl: text('normalized_url').notNull().unique(),
    originalUrl: text('original_url').notNull(),
    title: text('title').notNull(),
    siteUrl: text('site_url'),
    subscriberCount: integer('subscriber_count').default(1).notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  },
  (table) => [index('idx_normalized_url').on(table.normalizedUrl)],
);

/**
 * Anonymous subscription batches — no user identifiers stored.
 * Expires after a configurable TTL (Member D sets this in /api/discovery/submit).
 */
export const anonymousBatches = pgTable('anonymous_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});

/**
 * Many-to-many join between batches and feeds.
 * Powers the co-subscription Jaccard similarity queries in Member D's scorer.
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
  ],
);

