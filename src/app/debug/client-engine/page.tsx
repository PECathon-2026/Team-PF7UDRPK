'use client';

import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, LocalPost, CachedArticle } from '@/lib/client/db';
import {
  subscribeFeed,
  syncFeed,
  syncAllFeeds,
  unsubscribeFeed,
  fetchAndCacheArticle,
  markPostRead,
  toggleStarred,
  getTopSubscribedTopics,
} from '@/lib/client/feed-manager';
import {
  Rss,
  RefreshCw,
  Trash2,
  BookOpen,
  CheckCircle2,
  Star,
  Wifi,
  WifiOff,
  Database,
  ExternalLink,
  X,
  Clock,
  Sparkles,
} from 'lucide-react';

const STARTER_PACK = [
  { name: 'Simon Willison', url: 'https://simonwillison.net/atom/entries/' },
  { name: 'Dan Luu', url: 'https://danluu.com' },
  { name: 'Overreacted', url: 'https://overreacted.io' },
];

export default function MemberBTestBench() {
  const [inputUrl, setInputUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedFeedId, setSelectedFeedId] = useState<string>('ALL');
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [activeArticlePost, setActiveArticlePost] = useState<LocalPost | null>(null);
  const [cachedArticle, setCachedArticle] = useState<CachedArticle | null>(null);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [topTopics, setTopTopics] = useState<string[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  // ΓöÇΓöÇ Dexie Live Queries (Auto-updating UI from IndexedDB) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const feeds = useLiveQuery(() => localDB.feeds.toArray(), []) ?? [];
  const posts = useLiveQuery(async () => {
    let collection = localDB.posts.orderBy('publishedAt').reverse();
    if (selectedFeedId !== 'ALL') {
      collection = localDB.posts.where('feedId').equals(selectedFeedId).reverse();
    }
    const all = await collection.toArray();
    if (filterUnreadOnly) {
      return all.filter((p) => !p.isRead);
    }
    return all;
  }, [selectedFeedId, filterUnreadOnly]) ?? [];
  const articleCount = useLiveQuery(() => localDB.articles.count(), []) ?? 0;

  // ΓöÇΓöÇ Online/Offline listener & Topic refresh ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const refreshTopics = async () => {
      const topics = await getTopSubscribedTopics();
      setTopTopics(topics);
    };
    refreshTopics();

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [feeds.length]);

  // ΓöÇΓöÇ Actions ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const handleSubscribe = async (urlToSub: string) => {
    if (!urlToSub.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await subscribeFeed(urlToSub.trim());
      setInputUrl('');
      const updatedTopics = await getTopSubscribedTopics();
      setTopTopics(updatedTopics);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      await syncAllFeeds();
      const updatedTopics = await getTopSubscribedTopics();
      setTopTopics(updatedTopics);
    } finally {
      setSyncingAll(false);
    }
  };

  const handleOpenArticle = async (post: LocalPost) => {
    setActiveArticlePost(post);
    setLoadingArticle(true);
    setCachedArticle(null);
    try {
      // Automatically marks as read when opened
      await markPostRead(post.id, true);
      const article = await fetchAndCacheArticle(post);
      setCachedArticle(article);
    } catch (err: unknown) {
      console.error('Failed to load article:', err);
    } finally {
      setLoadingArticle(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex flex-col font-sans">
      {/* ΓöÇΓöÇ Top Navigation Bar ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
      <header className="border-b border-zinc-800 bg-zinc-950 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
            <Rss className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Small Web Reader
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Member B Client Engine
              </span>
            </h1>
            <p className="text-xs text-zinc-400">Offline-First IndexedDB Storage ΓÇó Web Worker Parser ΓÇó TF-IDF Extraction</p>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex items-center gap-3 text-xs">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? 'Network Online' : 'Network Offline (IDB Mode)'}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
            <Database className="w-3.5 h-3.5 text-zinc-400" />
            <span>
              {feeds.length} feeds ΓÇó {posts.length} posts ΓÇó {articleCount} cached
            </span>
          </div>
        </div>
      </header>

      {/* ΓöÇΓöÇ Main Dashboard ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ΓöÇΓöÇ Left Column: Subscriptions & Controls (4 cols) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <div className="lg:col-span-4 space-y-6">
          {/* Subscribe Card */}
          <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Rss className="w-4 h-4 text-amber-400" />
              Subscribe & Autodiscover
            </h2>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubscribe(inputUrl);
              }}
              className="space-y-3"
            >
              <input
                type="text"
                placeholder="Enter blog URL (e.g. danluu.com)"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                disabled={loading}
                className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <button
                type="submit"
                disabled={loading || !inputUrl.trim()}
                className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Autodiscovering & Syncing...</span>
                  </>
                ) : (
                  <span>Subscribe to Feed</span>
                )}
              </button>
            </form>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs break-words">
                <strong>Error:</strong> {errorMsg}
              </div>
            )}

            {/* Starter Quick-Fill Pack */}
            <div className="pt-2 border-t border-zinc-800">
              <span className="text-xs text-zinc-500 block mb-2">One-Click Test Blogs:</span>
              <div className="flex flex-wrap gap-1.5">
                {STARTER_PACK.map((blog) => (
                  <button
                    key={blog.name}
                    type="button"
                    onClick={() => handleSubscribe(blog.url)}
                    disabled={loading}
                    className="text-xs px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
                  >
                    + {blog.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Subscribed Feeds List */}
          <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                Your Feeds ({feeds.length})
              </h2>
              {feeds.length > 0 && (
                <button
                  onClick={handleSyncAll}
                  disabled={syncingAll}
                  className="text-xs px-2 py-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 flex items-center gap-1 transition"
                  title="Refresh all feeds via Web Worker"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingAll ? 'animate-spin' : ''}`} />
                  Sync All
                </button>
              )}
            </div>

            {feeds.length === 0 ? (
              <p className="text-xs text-zinc-500 italic py-2">No feeds subscribed yet. Add one above to begin.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {feeds.map((feed) => (
                  <div
                    key={feed.id}
                    onClick={() => setSelectedFeedId(feed.id === selectedFeedId ? 'ALL' : feed.id)}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition ${
                      selectedFeedId === feed.id
                        ? 'bg-amber-500/10 border-amber-500/40 text-zinc-100'
                        : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm text-white truncate">{feed.title || feed.url}</div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            syncFeed(feed.id);
                          }}
                          className="p-1 hover:text-amber-400 text-zinc-500"
                          title="Sync feed"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            unsubscribeFeed(feed.id);
                          }}
                          className="p-1 hover:text-red-400 text-zinc-500"
                          title="Unsubscribe"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="text-[11px] text-zinc-500 truncate mt-0.5">{feed.url}</div>

                    {/* Extracted Topics */}
                    {feed.topics && feed.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {feed.topics.map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700/50"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Aggregated TF-IDF Semantic Topics (Member D Hook) */}
          {topTopics.length > 0 && (
            <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 shadow-sm space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Subscribed Topics (TF-IDF)
              </h2>
              <p className="text-[11px] text-zinc-500">
                Extracted purely in your browser via Web Worker. Ready to boost recommendations:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {topTopics.map((topic) => (
                  <span
                    key={topic}
                    className="px-2 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20"
                  >
                    #{topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ΓöÇΓöÇ Right Column: Timeline & Article Reading (8 cols) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <div className="lg:col-span-8 space-y-4">
          {/* Timeline Filter Controls */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 font-medium">Feed filter:</span>
              <select
                value={selectedFeedId}
                onChange={(e) => setSelectedFeedId(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1 text-zinc-200 focus:outline-none"
              >
                <option value="ALL">All Subscribed Feeds</option>
                {feeds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title || f.url}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300 select-none">
                <input
                  type="checkbox"
                  checked={filterUnreadOnly}
                  onChange={(e) => setFilterUnreadOnly(e.target.checked)}
                  className="rounded bg-zinc-800 border-zinc-700 text-amber-500 focus:ring-0"
                />
                Unread only
              </label>
              <span className="text-zinc-500">Showing {posts.length} posts</span>
            </div>
          </div>

          {/* Posts Timeline */}
          {posts.length === 0 ? (
            <div className="p-12 text-center rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-500 space-y-2">
              <BookOpen className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
              <p className="text-sm font-medium">No posts to display</p>
              <p className="text-xs text-zinc-600">Subscribe to a feed on the left to see entries here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => handleOpenArticle(post)}
                  className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between gap-3 ${
                    post.isRead
                      ? 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 opacity-80'
                      : 'bg-zinc-950 border-zinc-800 hover:border-amber-500/50 text-zinc-200'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={`text-base font-semibold leading-snug ${post.isRead ? 'text-zinc-400' : 'text-white'}`}>
                        {post.title}
                      </h3>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStarred(post.id);
                          }}
                          className={`p-1 transition ${
                            post.isStarred ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'
                          }`}
                          title="Star post"
                        >
                          <Star className="w-4 h-4 fill-current" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markPostRead(post.id, !post.isRead);
                          }}
                          className={`p-1 transition ${
                            post.isRead ? 'text-zinc-600 hover:text-zinc-400' : 'text-amber-500 hover:text-amber-400'
                          }`}
                          title={post.isRead ? 'Mark unread' : 'Mark read'}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span>{new Date(post.publishedAt).toLocaleDateString()}</span>
                      {post.author && <span>ΓÇó By {post.author}</span>}
                      <span>ΓÇó {post.feedId}</span>
                    </div>

                    {post.summary && (
                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mt-1">
                        {post.summary.replace(/<[^>]+>/g, '')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ΓöÇΓöÇ Article Reading Modal (Readability + DOMPurify Extractor) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
      {activeArticlePost && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  IndexedDB Cached
                </span>
                {cachedArticle?.readingTimeMinutes && (
                  <span className="text-zinc-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {cachedArticle.readingTimeMinutes} min read
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={activeArticlePost.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
                  title="Open original webpage"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  onClick={() => setActiveArticlePost(null)}
                  className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content Body */}
            <div className="p-8 overflow-y-auto flex-1 prose prose-invert max-w-none prose-a:text-amber-400 prose-img:rounded-lg">
              <h1 className="text-2xl font-bold text-white mb-2">{activeArticlePost.title}</h1>
              <div className="text-xs text-zinc-500 mb-6 flex items-center gap-2">
                <span>{new Date(activeArticlePost.publishedAt).toLocaleDateString()}</span>
                {cachedArticle?.byline && <span>ΓÇó {cachedArticle.byline}</span>}
                <span>ΓÇó {activeArticlePost.feedId}</span>
              </div>

              {loadingArticle ? (
                <div className="py-20 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-500" />
                  <p className="text-sm text-zinc-400">Extracting full article via Mozilla Readability & DOMPurify...</p>
                </div>
              ) : cachedArticle ? (
                <div
                  className="text-zinc-300 leading-relaxed text-sm space-y-4"
                  dangerouslySetInnerHTML={{ __html: cachedArticle.content }}
                />
              ) : (
                <p className="text-sm text-zinc-400">{activeArticlePost.summary}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
