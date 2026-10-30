'use client';

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, LocalFeed } from '@/lib/client/db';
import { syncAllFeeds, unsubscribeFeed } from '@/lib/client/feed-manager';
import { useUIStore, uiStore } from '@/lib/client/ui-store';
import { Badge } from '@/components/ui/Badge';
import {
  Rss,
  Inbox,
  Clock,
  Star,
  Compass,
  Sparkles,
  Plus,
  RefreshCw,
  Trash2,
  WifiOff,
  Keyboard,
  Settings,
  Sun,
  Moon,
  ChevronRight,
  ChevronLeft,
  Radio,
  X,
} from 'lucide-react';

export function Sidebar() {
  const currentView = useUIStore((s) => s.view);
  const selectedFilter = useUIStore((s) => s.selectedFilter);
  const isOffline = useUIStore((s) => s.isOffline);
  const isSyncingAll = useUIStore((s) => s.isSyncingAll);
  const theme = useUIStore((s) => s.theme);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);
  const isSidebarExpanded = useUIStore((s) => s.isSidebarExpanded);

  const [hoveredFeedId, setHoveredFeedId] = useState<string | null>(null);

  // Live query for all feeds
  const feeds = useLiveQuery(() => localDB.feeds.toArray(), []) ?? [];

  // Live queries for post counts
  const unreadPostsCount = useLiveQuery(
    () => localDB.posts.filter((p) => !p.isRead).count(),
    []
  ) ?? 0;

  const starredPostsCount = useLiveQuery(
    () => localDB.posts.filter((p) => Boolean(p.isStarred)).count(),
    []
  ) ?? 0;

  // Live query for unread count per feed
  const unreadByFeed = useLiveQuery(async () => {
    const unread = await localDB.posts.filter((p) => !p.isRead).toArray();
    const map: Record<string, number> = {};
    for (const post of unread) {
      map[post.feedId] = (map[post.feedId] ?? 0) + 1;
    }
    return map;
  }, []) ?? {};

  async function handleRefreshAll() {
    if (isSyncingAll || isOffline) return;
    uiStore.setSyncingAll(true);
    try {
      await syncAllFeeds();
      uiStore.showToast('Feeds synced successfully');
    } catch {
      uiStore.showToast('Feed sync completed with errors');
    } finally {
      uiStore.setSyncingAll(false);
    }
  }

  async function handleUnsubscribe(e: React.MouseEvent, feedId: string) {
    e.stopPropagation();
    if (confirm('Unsubscribe from this feed and remove its saved posts?')) {
      await unsubscribeFeed(feedId);
      if (selectedFilter === feedId) {
        uiStore.setSelectedFilter('all');
      }
      uiStore.showToast('Unsubscribed from feed');
    }
  }

  function handleThemeToggle() {
    const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    uiStore.setTheme(nextTheme);
    uiStore.showToast(`Theme switched to ${nextTheme}`);
  }

  function getFaviconUrl(feed: LocalFeed): string {
    if (feed.siteUrl) {
      try {
        const u = new URL(feed.siteUrl);
        return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
      } catch {
        // Fallback
      }
    }
    try {
      const u = new URL(feed.url.startsWith('http') ? feed.url : `https://${feed.url}`);
      return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
    } catch {
      return '';
    }
  }

  return (
    <aside className="w-full h-full flex flex-col bg-reader-surface border-r border-reader-border select-none overflow-hidden transition-colors">
      {/* ── Brand Header ────────────────────────────────────── */}
      <div className={`border-b border-reader-border flex items-center ${isSidebarExpanded ? 'p-4 justify-between' : 'p-3 flex-col gap-2'}`}>
        <button
          onClick={() => {
            uiStore.setSelectedFilter('all');
            uiStore.setView('timeline');
          }}
          className="flex items-center gap-2.5 text-left group min-w-0"
          title="Small Web Reader"
        >
          <div className="w-8 h-8 rounded-lg bg-reader-accentBg border border-reader-accent/20 flex items-center justify-center text-reader-accent group-hover:scale-105 transition-transform shrink-0">
            <Radio className="w-4 h-4" />
          </div>
          {isSidebarExpanded && (
            <div className="truncate">
              <span className="font-semibold text-sm tracking-tight text-reader-text block group-hover:text-reader-accent transition-colors truncate">
                Small Web Reader
              </span>
              <span className="text-[10px] text-reader-dim block tracking-wide font-mono">
                INDEPENDENT RSS
              </span>
            </div>
          )}
        </button>

        <div className="flex items-center gap-1">
          {/* Quick theme switch button */}
          <button
            onClick={handleThemeToggle}
            className="p-1.5 text-reader-muted hover:text-reader-text hover:bg-reader-selected rounded-lg transition-colors"
            title={`Toggle Theme (currently ${theme})`}
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-600" />
            )}
          </button>

          {/* Sidebar Expand / Collapse UI Toggle */}
          <button
            onClick={() => uiStore.toggleSidebarExpanded()}
            className="p-1.5 text-reader-muted hover:text-reader-text hover:bg-reader-selected rounded-lg transition-colors"
            title={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-label={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isSidebarExpanded ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>

          {/* Mobile drawer close */}
          <button
            onClick={() => uiStore.setMobileDrawerOpen(false)}
            className="lg:hidden p-1.5 text-reader-muted hover:text-reader-text rounded-md"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Action Buttons ──────────────────────────────────── */}
      <div className={`px-2 pt-3 pb-2 flex items-center ${isSidebarExpanded ? 'gap-1.5' : 'flex-col gap-2'}`}>
        <button
          onClick={() => uiStore.setAddFeedOpen(true)}
          title="Add Feed"
          className={`${
            isSidebarExpanded ? 'flex-1 px-3' : 'w-10 px-0'
          } py-1.5 text-xs font-semibold bg-reader-selected hover:bg-reader-surfaceHover text-reader-text hover:text-reader-accent border border-reader-border rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm active:scale-95`}
        >
          <Plus className="w-3.5 h-3.5 text-reader-accent shrink-0" />
          {isSidebarExpanded && <span>Add Feed</span>}
        </button>

        <button
          onClick={handleRefreshAll}
          disabled={isSyncingAll || isOffline}
          title={isOffline ? 'Sync unavailable offline' : 'Sync all feeds'}
          className={`${
            isSidebarExpanded ? 'p-1.5' : 'w-10 h-7 flex items-center justify-center'
          } text-reader-muted hover:text-reader-text hover:bg-reader-selected border border-reader-border rounded-lg transition-colors disabled:opacity-40 active:scale-95 shrink-0`}
          aria-label="Refresh all feeds"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin text-reader-accent' : ''}`}
          />
        </button>
      </div>

      {/* ── Scrollable Sections ─────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
        {/* Core Navigation Views */}
        <div className="space-y-0.5">
          {/* All Articles */}
          <button
            onClick={() => {
              uiStore.setSelectedFilter('all');
              uiStore.setView('timeline');
            }}
            title="All Articles"
            className={`w-full flex items-center ${
              isSidebarExpanded ? 'justify-between px-2.5' : 'justify-center px-0'
            } py-2 rounded-lg text-xs font-medium transition-colors relative group ${
              currentView === 'timeline' && selectedFilter === 'all'
                ? 'bg-reader-selected text-reader-text font-semibold shadow-sm'
                : 'text-reader-muted hover:text-reader-text hover:bg-reader-selected/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-reader-dim group-hover:text-reader-accent transition-colors shrink-0" />
              {isSidebarExpanded && <span>All Articles</span>}
            </div>
            {unreadPostsCount > 0 && (
              isSidebarExpanded ? (
                <Badge variant="unread">{unreadPostsCount}</Badge>
              ) : (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-reader-accent" />
              )
            )}
          </button>

          {/* Unread Only */}
          <button
            onClick={() => {
              uiStore.setSelectedFilter('unread');
              uiStore.setView('timeline');
            }}
            title="Unread Only"
            className={`w-full flex items-center ${
              isSidebarExpanded ? 'justify-between px-2.5' : 'justify-center px-0'
            } py-2 rounded-lg text-xs font-medium transition-colors relative group ${
              currentView === 'timeline' && selectedFilter === 'unread'
                ? 'bg-reader-selected text-reader-text font-semibold shadow-sm'
                : 'text-reader-muted hover:text-reader-text hover:bg-reader-selected/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-reader-dim group-hover:text-reader-accent transition-colors shrink-0" />
              {isSidebarExpanded && <span>Unread Only</span>}
            </div>
            {unreadPostsCount > 0 && (
              isSidebarExpanded ? (
                <Badge variant="unread">{unreadPostsCount}</Badge>
              ) : (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-reader-accent" />
              )
            )}
          </button>

          {/* Starred */}
          <button
            onClick={() => {
              uiStore.setSelectedFilter('starred');
              uiStore.setView('timeline');
            }}
            title="Starred"
            className={`w-full flex items-center ${
              isSidebarExpanded ? 'justify-between px-2.5' : 'justify-center px-0'
            } py-2 rounded-lg text-xs font-medium transition-colors relative group ${
              currentView === 'timeline' && selectedFilter === 'starred'
                ? 'bg-reader-selected text-reader-text font-semibold shadow-sm'
                : 'text-reader-muted hover:text-reader-text hover:bg-reader-selected/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500/20 shrink-0" />
              {isSidebarExpanded && <span>Starred</span>}
            </div>
            {starredPostsCount > 0 && (
              isSidebarExpanded ? (
                <Badge variant="warning">{starredPostsCount}</Badge>
              ) : (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400" />
              )
            )}
          </button>
        </div>

        {/* Discovery & Exploration */}
        <div>
          {isSidebarExpanded && (
            <div className="px-2.5 pb-1 text-[10px] font-semibold tracking-wider text-reader-dim uppercase">
              Discovery
            </div>
          )}
          <div className="space-y-0.5">
            <button
              onClick={() => uiStore.setView('explore')}
              title="Explore Catalog"
              className={`w-full flex items-center ${
                isSidebarExpanded ? 'justify-between px-2.5' : 'justify-center px-0'
              } py-2 rounded-lg text-xs font-medium transition-colors group ${
                currentView === 'explore'
                  ? 'bg-reader-selected text-reader-accent font-semibold shadow-sm'
                  : 'text-reader-muted hover:text-reader-text hover:bg-reader-selected/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-reader-dim group-hover:text-reader-accent transition-colors shrink-0" />
                {isSidebarExpanded && <span>Explore Catalog</span>}
              </div>
              {isSidebarExpanded && <ChevronRight className="w-3 h-3 text-reader-dim" />}
            </button>

            <button
              onClick={() => uiStore.setView('discover')}
              title="Discover"
              className={`w-full flex items-center ${
                isSidebarExpanded ? 'justify-between px-2.5' : 'justify-center px-0'
              } py-2 rounded-lg text-xs font-medium transition-colors group ${
                currentView === 'discover'
                  ? 'bg-reader-selected text-reader-accent font-semibold shadow-sm'
                  : 'text-reader-muted hover:text-reader-text hover:bg-reader-selected/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-reader-accent shrink-0" />
                {isSidebarExpanded && <span>Discover</span>}
              </div>
              {isSidebarExpanded && (
                <Badge variant="accent" size="sm">
                  AI / Co-read
                </Badge>
              )}
            </button>
          </div>
        </div>

        {/* Subscriptions List */}
        <div>
          {isSidebarExpanded && (
            <div className="px-2.5 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-wider text-reader-dim uppercase">
                Subscriptions ({feeds.length})
              </span>
            </div>
          )}

          {feeds.length === 0 ? (
            isSidebarExpanded ? (
              <div className="px-3 py-6 text-center border border-dashed border-reader-border rounded-lg m-1">
                <Rss className="w-5 h-5 text-reader-dim mx-auto mb-1.5" />
                <p className="text-xs text-reader-muted font-medium">No feeds yet</p>
                <p className="text-[11px] text-reader-dim mt-0.5 mb-2.5">
                  Subscribe to blogs or explore curated small-web gems.
                </p>
                <button
                  onClick={() => uiStore.setView('explore')}
                  className="px-2.5 py-1 text-[11px] font-medium bg-reader-selected hover:bg-reader-surfaceHover text-reader-accent border border-reader-border rounded transition-colors"
                >
                  Browse Catalog →
                </button>
              </div>
            ) : null
          ) : (
            <div className="space-y-1">
              {feeds.map((feed) => {
                const isSelected =
                  currentView === 'timeline' && selectedFilter === feed.id;
                const unreadCount = unreadByFeed[feed.id] ?? 0;
                const favicon = getFaviconUrl(feed);

                return (
                  <div
                    key={feed.id}
                    onMouseEnter={() => setHoveredFeedId(feed.id)}
                    onMouseLeave={() => setHoveredFeedId(null)}
                    onClick={() => {
                      uiStore.setSelectedFilter(feed.id);
                      uiStore.setView('timeline');
                    }}
                    title={feed.title}
                    className={`group relative w-full flex items-center ${
                      isSidebarExpanded ? 'justify-between px-2.5' : 'justify-center px-0'
                    } py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-reader-selected text-reader-text font-medium shadow-sm'
                        : 'text-reader-muted hover:text-reader-text hover:bg-reader-selected/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-1">
                      {/* Status indicator dot */}
                      {feed.status === 'syncing' ? (
                        <RefreshCw className="w-2.5 h-2.5 animate-spin text-reader-accent shrink-0" />
                      ) : feed.status === 'error' ? (
                        <span
                          title={feed.errorMessage || 'Feed error'}
                          className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"
                        />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 shrink-0" />
                      )}

                      {/* Favicon or fallback avatar */}
                      {favicon ? (
                        <img
                          src={favicon}
                          alt=""
                          className="w-4 h-4 rounded shrink-0 object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-4 h-4 rounded bg-reader-border flex items-center justify-center text-[9px] text-reader-muted shrink-0 font-semibold">
                          {feed.title.charAt(0).toUpperCase()}
                        </div>
                      )}

                      {isSidebarExpanded && <span className="truncate">{feed.title}</span>}
                    </div>

                    {isSidebarExpanded ? (
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Delete action on hover */}
                        {hoveredFeedId === feed.id && (
                          <button
                            onClick={(e) => handleUnsubscribe(e, feed.id)}
                            className="p-1 text-reader-dim hover:text-rose-500 rounded transition-colors"
                            title="Unsubscribe"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}

                        {/* Unread count badge */}
                        {unreadCount > 0 && (
                          <Badge variant={isSelected ? 'unread' : 'default'} size="sm">
                            {unreadCount}
                          </Badge>
                        )}
                      </div>
                    ) : unreadCount > 0 ? (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-reader-accent" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div className={`p-3 border-t border-reader-border flex items-center ${isSidebarExpanded ? 'justify-between text-[11px]' : 'flex-col gap-2'} text-reader-dim bg-reader-surface`}>
        {isSidebarExpanded ? (
          <div className="flex items-center gap-2">
            {isOffline ? (
              <span className="inline-flex items-center gap-1 text-amber-500 font-medium">
                <WifiOff className="w-3 h-3" />
                <span>Offline Mode</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-reader-muted">Local First</span>
              </span>
            )}
          </div>
        ) : null}

        <div className="flex items-center gap-1">
          <button
            onClick={() => uiStore.setShortcutsOpen(true)}
            className="p-1.5 hover:text-reader-text text-reader-dim hover:bg-reader-selected rounded transition-colors flex items-center gap-1"
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => uiStore.setSettingsOpen(true)}
            className="p-1.5 hover:text-reader-text text-reader-dim hover:bg-reader-selected rounded transition-colors"
            title="Settings & Appearance"
            aria-label="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
