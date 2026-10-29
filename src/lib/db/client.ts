import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

let dbInstance: any = null;
let pgliteClient: PGlite | null = null;
let cloudDbUnreachable = false;

/**
 * Creates the required schema in PGlite if running in-memory
 */
async function initializeSchemaInPglite(client: PGlite) {
  await client.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      normalized_url TEXT NOT NULL UNIQUE,
      original_url TEXT NOT NULL,
      title TEXT NOT NULL,
      site_url TEXT,
      subscriber_count INTEGER NOT NULL DEFAULT 1,
      category TEXT NOT NULL DEFAULT 'general',
      last_seen_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS anonymous_batches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS batch_feeds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id UUID NOT NULL REFERENCES anonymous_batches(id) ON DELETE CASCADE,
      feed_id UUID NOT NULL REFERENCES feeds(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_normalized_url ON feeds(normalized_url);
    CREATE INDEX IF NOT EXISTS idx_category ON feeds(category);
    CREATE INDEX IF NOT EXISTS idx_batch_feed_pair ON batch_feeds(batch_id, feed_id);
    CREATE INDEX IF NOT EXISTS idx_feed_batch ON batch_feeds(feed_id, batch_id);
  `);
}

/**
 * Returns a singleton Drizzle database client.
 * Connects to live PostgreSQL (Neon/Supabase) if DATABASE_URL is set;
 * otherwise automatically boots embedded PGlite in-memory with tables pre-created.
 */
export async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!cloudDbUnreachable && databaseUrl && databaseUrl.trim().length > 0) {
    try {
      const pool = new Pool({
        connectionString: databaseUrl,
        ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 2000,
      });

      // Quick probe to verify network reachability
      const probeClient = await pool.connect();
      probeClient.release();

      dbInstance = drizzlePg(pool, { schema });
      return dbInstance;
    } catch (err: any) {
      cloudDbUnreachable = true;
      console.warn(
        `⚠️ Cloud database unreachable on this local network (${err.message}). Seamlessly falling back to embedded in-memory PGlite for local execution.`
      );
    }
  }

  // Fallback to embedded in-memory PGlite
  if (!pgliteClient) {
    pgliteClient = new PGlite();
    await initializeSchemaInPglite(pgliteClient);
  }

  dbInstance = drizzlePglite(pgliteClient, { schema });
  return dbInstance;
}

/**
 * For isolated testing: creates a fresh in-memory database instance
 */
export async function createTestDb() {
  const client = new PGlite();
  await initializeSchemaInPglite(client);
  return drizzlePglite(client, { schema });
}
