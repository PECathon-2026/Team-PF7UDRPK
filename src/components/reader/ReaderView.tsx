'use client';

import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, CachedArticle, LocalPost } from '@/lib/client/db';
import {
  fetchAndCacheArticle,
  markPostRead,
  toggleStarred,
} from '@/lib/client/feed-manager';
import { useUIStore, uiStore, FontFamily, FontSize } from '@/lib/client/ui-store';
import { Badge } from '@/components/ui/Badge';
import {
  BookOpen,
  ExternalLink,
  Star,
  CheckCircle2,
  Clock,
  Wifi,
  WifiOff,
  Type,
  Minus,
  Plus,
  X,
  Share2,
  Loader2,
  ArrowLeft,
  Calendar,
  User,
  Maximize2,
  Minimize2,
  Settings,
  Compass,
  ChevronRight,
} from 'lucide-react';

export function ReaderView() {
  const activePostId = useUIStore((s) => s.activePostId);
  const fontFamily = useUIStore((s) => s.fontFamily);
  const fontSize = useUIStore((s) => s.fontSize);
  const lineHeight = useUIStore((s) => s.lineHeight);
  const readingWidth = useUIStore((s) => s.readingWidth);
  const isReaderExpanded = useUIStore((s) => s.isReaderExpanded);
  const isOffline = useUIStore((s) => s.isOffline);

  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // 1. Reactive query for the active post metadata
  const post = useLiveQuery(() => {
    return activePostId ? localDB.posts.get(activePostId) : undefined;
  }, [activePostId]);

  // 2. Reactive query for the cached article content
  const cachedArticle = useLiveQuery(() => {
    return activePostId ? localDB.articles.get(activePostId) : undefined;
  }, [activePostId]);

  // 3. Reactive query for the feed details
  const feed = useLiveQuery(() => {
    return post?.feedId ? localDB.feeds.get(post.feedId) : undefined;
  }, [post?.feedId]);

  // On activePostId change, if content is not yet cached and we're online, fetch and cache it
  useEffect(() => {
    if (!post) return;
    if (cachedArticle) return; // already cached!

    let isSubscribed = true;

    async function loadArticle() {
      setIsExtracting(true);
      setExtractError(null);
      try {
        await fetchAndCacheArticle(post!);
      } catch (err: unknown) {
        if (isSubscribed) {
          const msg =
            err instanceof Error ? err.message : 'Could not fetch full article';
          setExtractError(msg);
        }
      } finally {
        if (isSubscribed) {
          setIsExtracting(false);
        }
      }
    }

    loadArticle();

    return () => {
      isSubscribed = false;
    };
  }, [post?.id, cachedArticle]);

  // Handle Share / Copy Link
  function handleShare() {
    if (!post) return;
    if (navigator.share) {
      navigator.share({ title: post.title, url: post.link }).catch(() => {});
    } else {
      navigator.clipboard.writeText(post.link);
      uiStore.showToast('Article link copied to clipboard');
    }
  }

  // Handle Toggle Star
  async function handleToggleStar() {
    if (!post) return;
    try {
      const isStarred = await toggleStarred(post.id);
      uiStore.showToast(isStarred ? 'Saved to Starred ⭐' : 'Removed from Starred');
    } catch {
      uiStore.showToast('Failed to update star state');
    }
  }

  // Handle Toggle Read
  async function handleToggleRead() {
    if (!post) return;
    await markPostRead(post.id, !post.isRead);
    uiStore.showToast(!post.isRead ? 'Marked as read' : 'Marked as unread');
  }

  // Typography class calculations
  const fontClass = fontFamily === 'serif' ? 'font-serif' : 'font-sans';
  const sizeClass = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
  }[fontSize];

  const leadingClass = {
    compact: 'leading-normal',
    comfortable: 'leading-relaxed',
    relaxed: 'leading-loose',
  }[lineHeight];

  const widthClass = {
    narrow: 'max-w-xl',
    medium: 'max-w-2xl',
    wide: 'max-w-3xl',
    full: 'max-w-5xl',
  }[readingWidth];

  // If no article is selected -> Steady constant interactive empty state with 67913.png
  if (!activePostId) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 sm:p-10 text-center bg-reader-surface select-none overflow-y-auto transition-colors">
        <div className="w-full max-w-md flex flex-col items-center justify-center animate-in fade-in duration-300">
          {/* Proportional Image Container */}
          <div className="w-full relative overflow-hidden rounded-2xl border border-reader-border bg-reader-bg/50 p-2 sm:p-3 shadow-md hover:border-reader-accent/40 transition-all duration-300">
            <img
              src="/67913.png"
              alt="Explore Independent Small Web Blogs"
              className="w-full h-auto object-contain rounded-xl shadow-inner transition-transform duration-300 hover:scale-[1.01]"
            />
          </div>

          {/* Descriptive Content */}
          <div className="mt-6 text-center space-y-2 max-w-sm">
            <h2 className="text-lg sm:text-xl font-bold text-reader-text tracking-tight">
              Curate Your Quiet Corner of the Web
            </h2>
            <p className="text-xs sm:text-sm text-reader-muted leading-relaxed">
              Select an article from the timeline to start reading, or explore new independent blogs across the small web.
            </p>
          </div>

          {/* 'Click to Explore' Interactive Button */}
          <button
            onClick={() => uiStore.setSidebarExpanded(true)}
            className="mt-5 px-5 py-2.5 bg-reader-accent hover:bg-reader-accentHover text-reader-bg font-semibold text-xs sm:text-sm rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 group active:scale-95 cursor-pointer"
          >
            <span>Click to Explore</span>
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1 duration-200" />
          </button>

          {/* Subtle Keyboard Shortcuts Hint */}
          <div className="mt-8 pt-4 border-t border-reader-border/60 flex flex-wrap justify-center gap-2 text-[11px] text-reader-dim">
            <span className="px-2 py-0.5 bg-reader-bg rounded border border-reader-border font-mono">
              <kbd>j</kbd>/<kbd>k</kbd> navigate
            </span>
            <span className="px-2 py-0.5 bg-reader-bg rounded border border-reader-border font-mono">
              <kbd>Enter</kbd> open
            </span>
            <span className="px-2 py-0.5 bg-reader-bg rounded border border-reader-border font-mono">
              <kbd>s</kbd> star
            </span>
            <span className="px-2 py-0.5 bg-reader-bg rounded border border-reader-border font-mono">
              <kbd>?</kbd> shortcuts
            </span>
          </div>
        </div>
      </div>
    );
  }

  // If an article is selected but still loading metadata from localDB
  if (!post) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-reader-surface">
        <Loader2 className="w-6 h-6 animate-spin text-reader-accent" />
      </div>
    );
  }

  const formattedDate = new Date(post.publishedAt).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const readingTime =
    cachedArticle?.readingTimeMinutes ||
    Math.max(1, Math.ceil((post.summary.split(/\s+/).length || 50) / 180));

  return (
    <article className="w-full h-full flex flex-col bg-reader-surface overflow-hidden transition-colors">
      {/* ── Reader Header Toolbar ────────────────────────────── */}
      <div className="p-3.5 sm:px-6 border-b border-reader-border bg-reader-surface/90 backdrop-blur-sm flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Mobile Back Button */}
          <button
            onClick={() => uiStore.setMobileReaderOpen(false)}
            className="lg:hidden p-1.5 -ml-1 text-reader-muted hover:text-reader-text rounded-md active:scale-95"
            aria-label="Back to timeline"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <span className="text-xs font-semibold text-reader-muted truncate">
            {feed?.title || post.author || 'Article'}
          </span>

          {cachedArticle ? (
            <Badge variant="success" size="sm" className="hidden sm:inline-flex">
              <Wifi className="w-3 h-3" />
              <span>Offline Ready</span>
            </Badge>
          ) : isOffline ? (
            <Badge variant="warning" size="sm">
              <WifiOff className="w-3 h-3" />
              <span>Summary</span>
            </Badge>
          ) : null}
        </div>

        {/* Reader Controls Toolbar */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Font Family Toggle */}
          <button
            onClick={() =>
              uiStore.setFontFamily(fontFamily === 'sans' ? 'serif' : 'sans')
            }
            className="p-1.5 text-xs text-reader-muted hover:text-reader-text hover:bg-reader-selected rounded-md transition-colors flex items-center gap-1 active:scale-95"
            title={`Switch to ${fontFamily === 'sans' ? 'Serif' : 'Sans-serif'} font`}
          >
            <Type className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium hidden sm:inline">
              {fontFamily === 'sans' ? 'Serif' : 'Sans'}
            </span>
          </button>

          {/* Font Size Steppers */}
          <div className="hidden sm:flex items-center bg-reader-bg border border-reader-border rounded-md px-1">
            <button
              onClick={() => uiStore.decreaseFontSize()}
              disabled={fontSize === 'sm'}
              className="p-1 text-reader-muted hover:text-reader-text disabled:opacity-30 active:scale-95"
              title="Decrease text size"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-[11px] px-1 font-mono text-reader-dim">A</span>
            <button
              onClick={() => uiStore.increaseFontSize()}
              disabled={fontSize === 'xl'}
              className="p-1 text-reader-muted hover:text-reader-text disabled:opacity-30 active:scale-95"
              title="Increase text size"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Focus / Expansion Toggle (Desktop) */}
          <button
            onClick={() => uiStore.toggleReaderExpanded()}
            className="hidden md:flex p-1.5 text-reader-muted hover:text-reader-text hover:bg-reader-selected rounded-md transition-colors active:scale-95"
            title={isReaderExpanded ? 'Exit Focus Mode' : 'Focus Mode (Expand Reader)'}
          >
            {isReaderExpanded ? (
              <Minimize2 className="w-4 h-4 text-reader-accent" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>

          {/* Star Toggle (FIXED with immediate reactive toggle & pop animation) */}
          <button
            onClick={handleToggleStar}
            className={`p-1.5 rounded-md transition-all active:scale-75 ${
              post.isStarred
                ? 'text-amber-500 hover:text-amber-600'
                : 'text-reader-muted hover:text-reader-text hover:bg-reader-selected'
            }`}
            title={post.isStarred ? 'Starred article (click to unstar)' : 'Star article (s)'}
            aria-label={post.isStarred ? 'Starred article' : 'Star article'}
          >
            <Star
              className={`w-4 h-4 transition-transform ${
                post.isStarred ? 'fill-amber-400 text-amber-500 animate-star-pop' : ''
              }`}
            />
          </button>

          {/* Read / Unread Toggle */}
          <button
            onClick={handleToggleRead}
            className={`p-1.5 rounded-md transition-colors active:scale-95 ${
              post.isRead
                ? 'text-emerald-500 hover:text-emerald-600'
                : 'text-reader-muted hover:text-reader-text hover:bg-reader-selected'
            }`}
            title={post.isRead ? 'Mark as unread (m)' : 'Mark as read (m)'}
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
            className="p-1.5 text-reader-muted hover:text-reader-text hover:bg-reader-selected rounded-md transition-colors active:scale-95"
            title="Share or copy link"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {/* Open Original */}
          <a
            href={post.link}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-reader-accent hover:text-reader-accentHover hover:bg-reader-selected rounded-md transition-colors flex items-center gap-1 active:scale-95"
            title="Open original blog post (o)"
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          {/* Quick Settings */}
          <button
            onClick={() => uiStore.setSettingsOpen(true)}
            className="p-1.5 text-reader-muted hover:text-reader-text hover:bg-reader-selected rounded-md transition-colors"
            title="Appearance Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Close Reader */}
          <button
            onClick={() => uiStore.setActivePostId(null)}
            className="p-1.5 text-reader-muted hover:text-reader-text hover:bg-reader-selected rounded-md transition-colors ml-1"
            title="Close reader (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Article Content Area (Scrollable & Width Configurable) ─ */}
      <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-12 lg:px-16">
        <div className={`${widthClass} mx-auto space-y-6 transition-all duration-150`}>
          {/* Article Header */}
          <header className="space-y-4 pb-6 border-b border-reader-border">
            <h1 className="text-2xl sm:text-3xl font-bold text-reader-text tracking-tight leading-tight">
              {post.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-reader-muted">
              {post.author && (
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-reader-dim" />
                  <span>{post.author}</span>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-reader-dim" />
                <span>{formattedDate}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-reader-dim" />
                <span>{readingTime} min read</span>
              </div>
            </div>
          </header>

          {/* Full-text Extraction Loading State */}
          {isExtracting && !cachedArticle && (
            <div className="p-4 bg-reader-selected/40 border border-reader-border rounded-lg flex items-center gap-3 text-xs text-reader-muted animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-reader-accent" />
              <span>Extracting clean reader view via Web Worker...</span>
            </div>
          )}

          {/* Article Body Content */}
          <div
            className={`reader-content ${fontClass} ${sizeClass} ${leadingClass}`}
            dangerouslySetInnerHTML={{
              __html:
                cachedArticle?.content ||
                `<p class="italic text-reader-muted leading-relaxed">${
                  post.summary || 'Summary unavailable.'
                }</p>`,
            }}
          />

          {/* Graceful Degradation Notice if full extraction was unavailable */}
          {!cachedArticle && !isExtracting && (
            <div className="mt-8 p-4 bg-reader-surface border border-reader-border rounded-xl text-xs space-y-2">
              <p className="text-reader-text font-medium">
                Viewing feed summary preview
              </p>
              <p className="text-reader-muted leading-relaxed">
                {extractError
                  ? `Full text could not be extracted directly: ${extractError}.`
                  : 'This blog serves summary content in its RSS feed.'}
              </p>
              <a
                href={post.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-reader-accent hover:underline font-medium pt-1"
              >
                <span>Read complete original post on website</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* End of article footer */}
          <footer className="pt-10 pb-6 border-t border-reader-border text-center text-xs text-reader-dim">
            <p>
              Published by{' '}
              <a
                href={post.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-reader-accent hover:underline font-medium"
              >
                {feed?.title || post.feedId}
              </a>
            </p>
          </footer>
        </div>
      </div>
    </article>
  );
}
