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
import { ExplorePage } from '@/components/explore/ExplorePage';
import { DiscoverPage } from '@/components/discover/DiscoverPage';
import { AddFeedModal } from '@/components/modals/AddFeedModal';
import { ShortcutsModal } from '@/components/modals/ShortcutsModal';
import { SEED_BLOGS } from '@/lib/discovery/seed-data';
import { Inbox, Compass, Sparkles, Plus } from 'lucide-react';

export default function HomePage() {
  const view = useUIStore((s) => s.view);
  const activePostId = useUIStore((s) => s.activePostId);
  const isMobileDrawerOpen = useUIStore((s) => s.isMobileDrawerOpen);
  const isMobileReaderOpen = useUIStore((s) => s.isMobileReaderOpen);
  const selectedFilter = useUIStore((s) => s.selectedFilter);

  // Query posts to enable keyboard navigation (j/k/Enter/etc)
  const posts = useLiveQuery(() => {
    if (selectedFilter === 'all') {
      return localDB.posts.orderBy('publishedAt').reverse().toArray();
    }
    if (selectedFilter === 'unread') {
      return localDB.posts.where('isRead').equals(0).reverse().sortBy('publishedAt');
    }
    if (selectedFilter === 'starred') {
      return localDB.posts.where('isStarred').equals(1).reverse().sortBy('publishedAt');
    }
    return localDB.posts.where('feedId').equals(selectedFilter).reverse().sortBy('publishedAt');
  }, [selectedFilter]) ?? [];

  // Seed sample small-web blogs on first ever load if database is empty
  useEffect(() => {
    async function checkAndSeed() {
      const feedCount = await localDB.feeds.count();
      if (feedCount === 0) {
        // Automatically add first 2 well-known small-web feeds to deliver an immediate experience
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
      // Ignore shortcut keys when typing inside an input or textarea
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
          toggleStarred(activePostId);
          return;
        }

        if (e.key === 'm') {
          e.preventDefault();
          const currentPost = posts.find((p) => p.id === activePostId);
          if (currentPost) {
            markPostRead(activePostId, !currentPost.isRead);
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
    <div className="w-screen h-screen flex overflow-hidden bg-reader-bg text-reader-text select-none">
      {/* ── Desktop Left Sidebar (Fixed 260px) ────────────────── */}
      <div className="hidden lg:block w-64 xl:w-72 shrink-0 h-full">
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
          /* Timeline + Reader View Layout */
          <div className="w-full h-full flex overflow-hidden">
            {/* Middle Timeline Pane */}
            <div
              className={`h-full border-r border-reader-border shrink-0 ${
                activePostId ? 'hidden md:block md:w-80 lg:w-96' : 'w-full md:w-80 lg:w-96'
              }`}
            >
              <Timeline />
            </div>

            {/* Right Reader Pane */}
            <div
              className={`flex-1 h-full ${
                !activePostId ? 'hidden md:flex' : 'flex'
              }`}
            >
              <ReaderView />
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile Bottom Navigation Bar ─────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-14 bg-reader-surface/95 backdrop-blur-md border-t border-reader-border flex items-center justify-around px-2 z-40">
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
          <div className="w-8 h-8 rounded-full bg-reader-accent text-reader-bg flex items-center justify-center -mt-3 shadow-md">
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
      </nav>

      {/* ── Global Modals ────────────────────────────────────── */}
      <AddFeedModal />
      <ShortcutsModal />
    </div>
  );
}
