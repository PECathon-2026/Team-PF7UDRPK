'use client';

import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB } from '@/lib/client/db';
import { subscribeFeed, unsubscribeFeed } from '@/lib/client/feed-manager';
import { SEED_BLOGS, SeedBlog } from '@/lib/discovery/seed-data';
import { useUIStore, uiStore } from '@/lib/client/ui-store';
import { Badge } from '@/components/ui/Badge';
import {
  Compass,
  Search,
  Plus,
  Check,
  ExternalLink,
  Sparkles,
  Loader2,
  Layers,
  ArrowRight,
  Menu,
} from 'lucide-react';

const CATEGORIES = [
  { id: 'all', label: 'All Feeds' },
  { id: 'systems', label: 'Systems & Architecture' },
  { id: 'web', label: 'Web & Tools' },
  { id: 'essays', label: 'Essays & Internet' },
  { id: 'hardware', label: 'Hardware & Devices' },
  { id: 'design', label: 'Design' },
];

export function ExplorePage() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [subscribingUrl, setSubscribingUrl] = useState<string | null>(null);

  // Live query for existing user subscriptions to detect subscribed state
  const subscribedFeeds = useLiveQuery(() => localDB.feeds.toArray(), []) ?? [];
  const subscribedUrlSet = useMemo(() => {
    const set = new Set<string>();
    for (const f of subscribedFeeds) {
      set.add(f.url);
      set.add(f.id);
      set.add(f.url.replace(/\/$/, ''));
    }
    return set;
  }, [subscribedFeeds]);

  // Filter catalog by category and search query
  const filteredBlogs = useMemo(() => {
    let list = SEED_BLOGS;

    if (activeCategory !== 'all') {
      list = list.filter((b) => b.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q) ||
          b.siteUrl.toLowerCase().includes(q) ||
          b.originalUrl.toLowerCase().includes(q)
      );
    }

    return list;
  }, [activeCategory, searchQuery]);

  async function handleToggleSubscribe(blog: SeedBlog) {
    const isSubscribed =
      subscribedUrlSet.has(blog.originalUrl) ||
      subscribedUrlSet.has(blog.originalUrl.replace(/\/$/, ''));

    if (isSubscribed) {
      // Find the feed id
      const feed = subscribedFeeds.find(
        (f) =>
          f.url === blog.originalUrl ||
          f.id === blog.originalUrl ||
          f.url === blog.originalUrl.replace(/\/$/, '')
      );
      if (feed) {
        await unsubscribeFeed(feed.id);
      }
    } else {
      setSubscribingUrl(blog.originalUrl);
      try {
        await subscribeFeed(blog.originalUrl, {
          title: blog.title,
          siteUrl: blog.siteUrl,
          category: blog.category,
        });
      } finally {
        setSubscribingUrl(null);
      }
    }
  }

  async function handleSubscribeAllVisible() {
    const toSubscribe = filteredBlogs.filter(
      (b) => !subscribedUrlSet.has(b.originalUrl)
    );
    if (toSubscribe.length === 0) return;

    await Promise.allSettled(
      toSubscribe.map((b) =>
        subscribeFeed(b.originalUrl, {
          title: b.title,
          siteUrl: b.siteUrl,
          category: b.category,
        })
      )
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-reader-bg overflow-y-auto">
      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="p-6 sm:p-10 border-b border-reader-border bg-reader-surface/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile menu button */}
              <button
                onClick={() => uiStore.setMobileDrawerOpen(true)}
                className="lg:hidden p-1.5 -ml-1 text-reader-muted hover:text-reader-text rounded-md"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="w-10 h-10 rounded-xl bg-reader-accentBg border border-reader-accent/20 flex items-center justify-center text-reader-accent">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-reader-text tracking-tight">
                  Explore the Small Web
                </h1>
                <p className="text-xs sm:text-sm text-reader-muted mt-0.5">
                  Curated directory of independent engineering blogs, artisanal weblogs, and computer architecture essays.
                </p>
              </div>
            </div>

            <button
              onClick={() => uiStore.setAddFeedOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-reader-selected hover:bg-reader-surfaceHover text-reader-accent border border-reader-border rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Custom URL</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-reader-dim absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search directory by author, topic, or paste any website URL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-reader-surface border border-reader-border rounded-xl text-sm text-reader-text placeholder-reader-dim focus:outline-none focus:border-reader-accent transition-colors shadow-sm"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
            <div className="flex items-center gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    activeCategory === cat.id
                      ? 'bg-reader-selected text-reader-accent font-semibold border border-reader-accent/30 shadow-sm'
                      : 'bg-reader-surface/80 text-reader-muted hover:text-reader-text hover:bg-reader-selected/40 border border-reader-border'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleSubscribeAllVisible}
              className="text-xs text-reader-accent hover:text-reader-accentHover font-semibold whitespace-nowrap flex items-center gap-1 px-2 py-1"
            >
              <span>Follow all ({filteredBlogs.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Directory Feed Cards Grid ───────────────────────── */}
      <div className="flex-1 p-6 sm:p-10 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredBlogs.map((blog) => {
            const isSubscribed = subscribedUrlSet.has(blog.originalUrl);
            const isCurrentlySubscribing = subscribingUrl === blog.originalUrl;

            return (
              <div
                key={blog.originalUrl}
                className="bg-reader-surface border border-reader-border rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-reader-accent/30 transition-all shadow-sm group"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-reader-text group-hover:text-reader-accent transition-colors truncate">
                        {blog.title}
                      </h3>
                      <a
                        href={blog.siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-reader-dim hover:text-reader-muted flex items-center gap-1 mt-0.5 truncate"
                      >
                        <span>{blog.siteUrl.replace(/^https?:\/\//, '')}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                    <Badge variant="default" size="sm" className="capitalize shrink-0">
                      {blog.category}
                    </Badge>
                  </div>

                  <p className="text-xs text-reader-muted leading-relaxed line-clamp-3">
                    {blog.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-reader-borderMuted flex items-center justify-between">
                  <span className="text-[11px] text-reader-dim font-mono truncate max-w-[180px]">
                    {blog.originalUrl.split('/').pop() || 'feed.xml'}
                  </span>

                  <button
                    onClick={() => handleToggleSubscribe(blog)}
                    disabled={isCurrentlySubscribing}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm ${
                      isSubscribed
                        ? 'bg-reader-selected text-emerald-400 border border-emerald-500/20 hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-500/30'
                        : 'bg-reader-accent text-reader-bg hover:bg-reader-accentHover'
                    }`}
                  >
                    {isCurrentlySubscribing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Syncing...</span>
                      </>
                    ) : isSubscribed ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Following</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Follow</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

