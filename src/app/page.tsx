'use client';

import React, { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB } from '@/lib/client/db';
import {
  markPostRead,
  toggleStarred,
  subscribeFeed,
} from '@/lib/client/feed-manager';
import { useUIStore, uiStore } from '@/lib/client/ui-store';
import { Sidebar } from '@/components/reader/Sidebar';
import { Timeline } from '@/components/reader/Timeline';
import { ReaderView } from '@/components/reader/ReaderView';
import { ResizeHandle } from '@/components/reader/ResizeHandle';
import { ExplorePage } from '@/components/explore/ExplorePage';
import { DiscoverPage } from '@/components/discover/DiscoverPage';
import { AddFeedModal } from '@/components/modals/AddFeedModal';
import { ShortcutsModal } from '@/components/modals/ShortcutsModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { SEED_BLOGS } from '@/lib/discovery/seed-data';
import { Inbox, Compass, Sparkles, Plus, Settings } from 'lucide-react';

export default function HomePage() {
  const view = useUIStore((s) => s.view);
  const activePostId = useUIStore((s) => s.activePostId);
  const isMobileDrawerOpen = useUIStore((s) => s.isMobileDrawerOpen);
  const selectedFilter = useUIStore((s) => s.selectedFilter);
  const timelineWidth = useUIStore((s) => s.timelineWidth);
  const isReaderExpanded = useUIStore((s) => s.isReaderExpanded);
  const isSidebarExpanded = useUIStore((s) => s.isSidebarExpanded);
  const toastMessage = useUIStore((s) => s.toastMessage);

  // FIXED: Query posts for keyboard navigation with boolean filtering
  const posts = useLiveQuery(() => {
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
    return localDB.posts
      .where('feedId')
      .equals(selectedFilter)
      .reverse()
      .sortBy('publishedAt');
  }, [selectedFilter]) ?? [];

  // Seed sample small-web blogs on cold start if database is empty
  useEffect(() => {
    async function checkAndSeed() {
      const feedCount = await localDB.feeds.count();
      if (feedCount === 0) {
        try {
          const sampleFeeds = SEED_BLOGS.slice(0, 2);
          for (const s of sampleFeeds) {
            await subscribeFeed(s.originalUrl);
          }
        } catch {
          // Non-critical if offline
        }
      }
    }
    checkAndSeed();
  }, []);

  // Global Keyboard Navigation (j, k, Enter, o, s, m, /, ?)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        uiStore.setShortcutsOpen(true);
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.getElementById('timeline-search-input');
        if (searchInput) searchInput.focus();
        return;
      }

      if (e.key === 'Escape') {
        if (activePostId) {
          uiStore.setActivePostId(null);
        }
        return;
      }

      if (posts.length === 0) return;

      const currentIndex = activePostId
        ? posts.findIndex((p) => p.id === activePostId)
        : -1;

      // j: next post
      if (e.key === 'j') {
        e.preventDefault();
        const nextIndex = Math.min(posts.length - 1, currentIndex + 1);
        const nextPost = posts[nextIndex];
        if (nextPost) {
          uiStore.setActivePostId(nextPost.id);
          markPostRead(nextPost.id, true);
        }
        return;
      }

      // k: previous post
      if (e.key === 'k') {
        e.preventDefault();
        const prevIndex = Math.max(0, currentIndex - 1);
        const prevPost = posts[prevIndex];
        if (prevPost) {
          uiStore.setActivePostId(prevPost.id);
          markPostRead(prevPost.id, true);
        }
        return;
      }

      // Active post actions: s, m, o
      if (activePostId) {
        if (e.key === 's') {
          e.preventDefault();
          toggleStarred(activePostId).then((isStarred) => {
            uiStore.showToast(isStarred ? 'Saved to Starred ⭐' : 'Removed from Starred');
          });
          return;
        }

        if (e.key === 'm') {
          e.preventDefault();
          const currentPost = posts.find((p) => p.id === activePostId);
          if (currentPost) {
            markPostRead(activePostId, !currentPost.isRead).then(() => {
              uiStore.showToast(!currentPost.isRead ? 'Marked as read' : 'Marked as unread');
            });
          }
          return;
        }

        if (e.key === 'o') {
          e.preventDefault();
          const currentPost = posts.find((p) => p.id === activePostId);
          if (currentPost?.link) {
            window.open(currentPost.link, '_blank', 'noopener,noreferrer');
          }
          return;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [posts, activePostId]);

  return (
    <div className="w-screen h-screen flex overflow-hidden bg-reader-bg text-reader-text select-none transition-colors">
      {/* ── Desktop Left Sidebar (Fixed 256px) ───────────────── */}
      <div className={`hidden lg:block shrink-0 h-full transition-[width] duration-300 ease-in-out ${isSidebarExpanded ? 'w-64' : 'w-16'}`}>
        <Sidebar />
      </div>

      {/* ── Mobile Sidebar Drawer ────────────────────────────── */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => uiStore.setMobileDrawerOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10 animate-in slide-in-from-left duration-200">
            <Sidebar />
          </div>
        </div>
      )}

      {/* ── Main Workspace Area ──────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">
        {view === 'explore' ? (
          <ExplorePage />
        ) : view === 'discover' ? (
          <DiscoverPage />
        ) : (
          /* Timeline + Resizable Reader Layout */
          <div className="w-full h-full flex overflow-hidden">
            {/* Middle Timeline Pane (Resizable) */}
            <div
              style={{
                width: isReaderExpanded ? 0 : undefined,
                maxWidth: isReaderExpanded ? 0 : undefined,
              }}
              className={`h-full shrink-0 transition-[width] duration-150 ${
                isReaderExpanded
                  ? 'hidden'
                  : activePostId
                  ? 'hidden md:block'
                  : 'w-full md:block'
              }`}
            >
              <div
                style={{ width: `${timelineWidth}px` }}
                className="h-full hidden md:block"
              >
                <Timeline />
              </div>
              <div className="h-full md:hidden w-full">
                <Timeline />
              </div>
            </div>

            {/* Draggable Divider (Desktop only, hidden in focus mode) */}
            {!isReaderExpanded && (
              <ResizeHandle sidebarWidth={isSidebarExpanded ? 256 : 64} />
            )}

            {/* Right Reader Pane */}
            <div
              className={`flex-1 h-full min-w-0 ${
                !activePostId ? 'hidden md:flex' : 'flex'
              }`}
            >
              <ReaderView />
            </div>
          </div>
        )}
      </div>

      {/* ── Toast Notification Pill ──────────────────────────── */}
      {toastMessage && (
        <div className="fixed bottom-16 sm:bottom-6 right-6 z-50 bg-reader-surface border border-reader-accent/40 text-reader-text px-4 py-2.5 rounded-xl shadow-2xl text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <span className="w-2 h-2 rounded-full bg-reader-accent animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Mobile Bottom Navigation Bar ─────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-14 bg-reader-surface/95 backdrop-blur-md border-t border-reader-border flex items-center justify-around px-2 z-40 transition-colors">
        <button
          onClick={() => {
            uiStore.setView('timeline');
            uiStore.setSelectedFilter('all');
          }}
          className={`flex flex-col items-center justify-center p-1 text-[10px] font-medium transition-colors ${
            view === 'timeline'
              ? 'text-reader-accent font-semibold'
              : 'text-reader-dim hover:text-reader-muted'
          }`}
        >
          <Inbox className="w-5 h-5 mb-0.5" />
          <span>Articles</span>
        </button>

        <button
          onClick={() => uiStore.setView('explore')}
          className={`flex flex-col items-center justify-center p-1 text-[10px] font-medium transition-colors ${
            view === 'explore'
              ? 'text-reader-accent font-semibold'
              : 'text-reader-dim hover:text-reader-muted'
          }`}
        >
          <Compass className="w-5 h-5 mb-0.5" />
          <span>Explore</span>
        </button>

        <button
          onClick={() => uiStore.setAddFeedOpen(true)}
          className="flex flex-col items-center justify-center p-1 text-[10px] font-medium text-reader-dim hover:text-reader-muted"
        >
          <div className="w-8 h-8 rounded-full bg-reader-accent text-reader-bg flex items-center justify-center -mt-3 shadow-md active:scale-95 transition-transform">
            <Plus className="w-5 h-5" />
          </div>
          <span>Add</span>
        </button>

        <button
          onClick={() => uiStore.setView('discover')}
          className={`flex flex-col items-center justify-center p-1 text-[10px] font-medium transition-colors ${
            view === 'discover'
              ? 'text-reader-accent font-semibold'
              : 'text-reader-dim hover:text-reader-muted'
          }`}
        >
          <Sparkles className="w-5 h-5 mb-0.5" />
          <span>Discover</span>
        </button>

        <button
          onClick={() => uiStore.setSettingsOpen(true)}
          className="flex flex-col items-center justify-center p-1 text-[10px] font-medium text-reader-dim hover:text-reader-muted"
        >
          <Settings className="w-5 h-5 mb-0.5" />
          <span>Settings</span>
        </button>
      </nav>

      {/* ── Global Modals ────────────────────────────────────── */}
      <AddFeedModal />
      <ShortcutsModal />
      <SettingsModal />
    </div>
  );
}
