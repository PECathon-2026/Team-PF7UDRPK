'use client';

import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, LocalPost } from '@/lib/client/db';
import { markPostRead, toggleStarred } from '@/lib/client/feed-manager';
import { useUIStore, uiStore } from '@/lib/client/ui-store';
import { Badge } from '@/components/ui/Badge';
import {
  Search,
  CheckCheck,
  Star,
  Clock,
  Sparkles,
  Inbox,
  Filter,
  Maximize2,
  Menu,
} from 'lucide-react';

const PAGE_SIZE = 40;

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function Timeline() {
  const selectedFilter = useUIStore((s) => s.selectedFilter);
  const timelineSubFilter = useUIStore((s) => s.timelineSubFilter);
  const activePostId = useUIStore((s) => s.activePostId);
  const searchQuery = useUIStore((s) => s.searchQuery);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Fetch feed metadata if filtering by a single feed
  const activeFeed = useLiveQuery(() => {
    if (
      selectedFilter !== 'all' &&
      selectedFilter !== 'unread' &&
      selectedFilter !== 'starred'
    ) {
      return localDB.feeds.get(selectedFilter);
    }
    return undefined;
  }, [selectedFilter]);

  // FIXED: Reactive query for posts based on filter selection using boolean filter
  const rawPosts = useLiveQuery(() => {
    if (selectedFilter === 'all') {
      return localDB.posts.orderBy('publishedAt').reverse().toArray();
    }
    if (selectedFilter === 'unread') {
      return localDB.posts
        .orderBy('publishedAt')
        .reverse()
        .filter((p) => !p.isRead)
        .toArray();
    }
    if (selectedFilter === 'starred') {
      return localDB.posts
        .orderBy('publishedAt')
        .reverse()
        .filter((p) => Boolean(p.isStarred))
        .toArray();
    }
    // Filter by single feed ID
    return localDB.posts
      .where('feedId')
      .equals(selectedFilter)
      .reverse()
      .sortBy('publishedAt');
  }, [selectedFilter]) ?? [];

  // Client-side text search & sub-filter filtering
  const filteredPosts = useMemo(() => {
    let result = rawPosts;

    if (timelineSubFilter === 'unread') {
      result = result.filter((p) => !p.isRead);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.summary.toLowerCase().includes(q) ||
          (p.author && p.author.toLowerCase().includes(q))
      );
    }

    return result;
  }, [rawPosts, timelineSubFilter, searchQuery]);

  // Windowed visible posts to ensure 60fps scrolling and avoid DOM bloat
  const visiblePosts = useMemo(() => {
    return filteredPosts.slice(0, visibleCount);
  }, [filteredPosts, visibleCount]);

  const hasMore = visibleCount < filteredPosts.length;

  async function handleSelectPost(post: LocalPost) {
    uiStore.setActivePostId(post.id);
    if (!post.isRead) {
      await markPostRead(post.id, true);
    }
  }

  async function handleToggleStar(e: React.MouseEvent, postId: string) {
    e.stopPropagation();
    try {
      const isStarred = await toggleStarred(postId);
      uiStore.showToast(isStarred ? 'Saved to Starred ⭐' : 'Removed from Starred');
    } catch {
      uiStore.showToast('Failed to update star state');
    }
  }

  async function handleMarkAllAsRead() {
    const unreadIds = filteredPosts.filter((p) => !p.isRead).map((p) => p.id);
    if (unreadIds.length === 0) return;

    await Promise.all(unreadIds.map((id) => markPostRead(id, true)));
    uiStore.showToast(`Marked ${unreadIds.length} articles as read`);
  }

  // Determine Title for Timeline header
  const headerTitle = useMemo(() => {
    if (selectedFilter === 'all') return 'All Articles';
    if (selectedFilter === 'unread') return 'Unread Articles';
    if (selectedFilter === 'starred') return 'Starred Articles';
    return activeFeed?.title || 'Feed Articles';
  }, [selectedFilter, activeFeed]);

  return (
    <div className="w-full h-full flex flex-col bg-reader-bg border-r border-reader-border select-none overflow-hidden transition-colors">
      {/* ── Timeline Header ─────────────────────────────────── */}
      <div className="p-4 border-b border-reader-border bg-reader-surface/50 backdrop-blur-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {/* Mobile menu button */}
            <button
              onClick={() => uiStore.setMobileDrawerOpen(true)}
              className="lg:hidden p-1.5 -ml-1 text-reader-muted hover:text-reader-text rounded-md"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>

            <h1 className="text-base font-semibold text-reader-text tracking-tight truncate">
              {headerTitle}
            </h1>
            <Badge variant="default" size="sm">
              {filteredPosts.length}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Mark all as read */}
            <button
              onClick={handleMarkAllAsRead}
              className="p-1.5 text-xs text-reader-muted hover:text-reader-accent hover:bg-reader-selected rounded-md transition-colors flex items-center gap-1 active:scale-95"
              title="Mark all visible as read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Mark all read</span>
            </button>

            {/* Sub-filter toggle (All vs Unread) */}
            <button
              onClick={() =>
                uiStore.setTimelineSubFilter(
                  timelineSubFilter === 'all' ? 'unread' : 'all'
                )
              }
              className={`px-2 py-1 text-[11px] rounded-md border transition-colors flex items-center gap-1 ${
                timelineSubFilter === 'unread'
                  ? 'bg-reader-accentBg text-reader-accent border-reader-accent/30 font-medium'
                  : 'bg-reader-surface text-reader-muted border-reader-border hover:text-reader-text'
              }`}
            >
              <Filter className="w-3 h-3" />
              <span>{timelineSubFilter === 'unread' ? 'Unread only' : 'All'}</span>
            </button>
          </div>
        </div>

        {/* Search input with shortcut hint */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-reader-dim absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="timeline-search-input"
            type="text"
            placeholder="Search articles in timeline (/)..."
            value={searchQuery}
            onChange={(e) => uiStore.setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 bg-reader-surface border border-reader-border rounded-lg text-xs text-reader-text placeholder-reader-dim focus:outline-none focus:border-reader-accent transition-colors shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => uiStore.setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-reader-dim hover:text-reader-text px-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Article Rows List (Windowed) ────────────────────── */}
      <div className="flex-1 overflow-y-auto divide-y divide-reader-borderMuted">
        {visiblePosts.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-reader-surface border border-reader-border flex items-center justify-center mx-auto text-reader-dim shadow-sm">
              {searchQuery ? (
                <Search className="w-5 h-5" />
              ) : selectedFilter === 'unread' || timelineSubFilter === 'unread' ? (
                <CheckCheck className="w-5 h-5 text-emerald-500" />
              ) : selectedFilter === 'starred' ? (
                <Star className="w-5 h-5 text-amber-500 fill-amber-500/20" />
              ) : (
                <Inbox className="w-5 h-5" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-reader-text">
                {searchQuery
                  ? 'No articles match your search'
                  : selectedFilter === 'unread' || timelineSubFilter === 'unread'
                  ? 'All caught up! 🎉'
                  : selectedFilter === 'starred'
                  ? 'No Starred Articles Yet'
                  : 'No articles in this feed'}
              </p>
              <p className="text-xs text-reader-muted mt-1 max-w-xs mx-auto leading-relaxed">
                {searchQuery
                  ? 'Try searching for a different term or clear the filter.'
                  : selectedFilter === 'unread'
                  ? 'You have read all articles in this view.'
                  : selectedFilter === 'starred'
                  ? 'Click the star icon on any article to save it here for quick reference.'
                  : 'Sync the feed or add new subscriptions from the Explore catalog.'}
              </p>
            </div>
          </div>
        ) : (
          visiblePosts.map((post) => {
            const isSelected = activePostId === post.id;
            const relativeTime = formatRelativeTime(post.publishedAt);

            return (
              <div
                key={post.id}
                onClick={() => handleSelectPost(post)}
                className={`group relative p-3.5 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-reader-selected'
                    : 'hover:bg-reader-surfaceHover/80'
                }`}
              >
                {/* Active selection accent bar */}
                {isSelected && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-reader-accent rounded-r" />
                )}

                <div className="space-y-1.5 pl-1">
                  {/* Top line: Source / Author, Timestamp, Unread dot, Star toggle */}
                  <div className="flex items-center justify-between text-[11px] text-reader-dim">
                    <div className="flex items-center gap-1.5 min-w-0 pr-2">
                      {!post.isRead && (
                        <span
                          className="w-2 h-2 rounded-full bg-reader-unread shrink-0"
                          title="Unread"
                        />
                      )}
                      <span className="font-medium text-reader-muted truncate">
                        {post.author || post.feedId.replace(/^https?:\/\//, '')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-reader-dim">{relativeTime}</span>
                      {/* FIXED: Star button with pop animation and feedback */}
                      <button
                        onClick={(e) => handleToggleStar(e, post.id)}
                        className={`p-1 rounded-md transition-all active:scale-75 ${
                          post.isStarred
                            ? 'text-amber-500 hover:text-amber-600'
                            : 'text-reader-dim hover:text-reader-text'
                        }`}
                        title={post.isStarred ? 'Unstar article' : 'Star article'}
                        aria-label={post.isStarred ? 'Unstar article' : 'Star article'}
                      >
                        <Star
                          className={`w-3.5 h-3.5 transition-transform ${
                            post.isStarred ? 'fill-amber-400 text-amber-500 animate-star-pop' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <h3
                    className={`text-sm leading-snug line-clamp-2 transition-colors ${
                      !post.isRead
                        ? 'font-semibold text-reader-text'
                        : 'font-normal text-reader-muted'
                    } ${isSelected ? 'text-reader-accent font-semibold' : ''}`}
                  >
                    {post.title}
                  </h3>

                  {/* Summary preview snippet */}
                  {post.summary && (
                    <p className="text-xs text-reader-dim line-clamp-2 leading-relaxed">
                      {post.summary.replace(/<[^>]+>/g, '').trim()}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Load more / window expansion button */}
        {hasMore && (
          <div className="p-4 text-center">
            <button
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              className="px-4 py-2 text-xs font-medium text-reader-muted hover:text-reader-text bg-reader-surface hover:bg-reader-selected border border-reader-border rounded-lg transition-colors shadow-sm"
            >
              Load more articles ({filteredPosts.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
