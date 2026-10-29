import type { LocalPost } from './db';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'it', 'its', 'as', 'are', 'was', 'be', 'this', 'that', 'have',
  'has', 'had', 'will', 'would', 'can', 'could', 'not', 'do', 'does', 'did', 'so',
  'if', 'about', 'up', 'out', 'new', 'my', 'your', 'more', 'also', 'how', 'what',
  'when', 'where', 'who', 'which', 'than', 'then', 'into', 'over', 'just', 'post',
  'blog', 'read', 'link', 'http', 'https', 'www', 'com', 'net', 'org', 'pro',
]);

/**
 * Extracts top salient keyword topics across a set of posts using local TF-IDF.
 * Uses smoothed IDF: tf * (1 + ln(N / df)) so high-frequency defining terms in a
 * feed are preserved while still filtering common cross-document terms.
 */
export function extractTopics(posts: LocalPost[], topN: number = 5): string[] {
  if (posts.length === 0) return [];

  const tf: Record<string, number> = {};
  const df: Record<string, number> = {};

  for (const post of posts) {
    const text = `${post.title} ${post.summary}`.toLowerCase();
    const tokens = text.match(/[a-z0-9_-]{3,}/g) ?? [];
    const seenInDoc = new Set<string>();

    for (const token of tokens) {
      if (STOP_WORDS.has(token)) continue;
      tf[token] = (tf[token] ?? 0) + 1;
      if (!seenInDoc.has(token)) {
        df[token] = (df[token] ?? 0) + 1;
        seenInDoc.add(token);
      }
    }
  }

  const N = posts.length;
  const tfidf: Record<string, number> = {};
  for (const term of Object.keys(tf)) {
    // Smoothed TF-IDF formula (similar to scikit-learn / Lucene):
    // tf * (1 + ln((N + 1) / (df + 1)))
    const idf = 1 + Math.log((N + 1) / ((df[term] ?? 1) + 1));
    tfidf[term] = tf[term] * idf;
  }

  return Object.entries(tfidf)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([term]) => term);
}
