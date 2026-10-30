'use client';

import { useSyncExternalStore } from 'react';

export type ActiveView = 'timeline' | 'explore' | 'discover';
export type FilterType = 'all' | 'unread' | 'starred' | string; // or feedId
export type TimelineSubFilter = 'all' | 'unread';
export type FontFamily = 'sans' | 'serif';
export type FontSize = 'sm' | 'base' | 'lg' | 'xl';
export type ThemeMode = 'dark' | 'light' | 'system';
export type LineHeight = 'compact' | 'comfortable' | 'relaxed';
export type ReadingWidth = 'narrow' | 'medium' | 'wide' | 'full';

export interface UIState {
  view: ActiveView;
  selectedFilter: FilterType;
  timelineSubFilter: TimelineSubFilter;
  activePostId: string | null;
  searchQuery: string;
  fontFamily: FontFamily;
  fontSize: FontSize;
  lineHeight: LineHeight;
  readingWidth: ReadingWidth;
  theme: ThemeMode;
  resolvedTheme: 'dark' | 'light';
  timelineWidth: number;
  isReaderExpanded: boolean;
  isSidebarExpanded: boolean;
  isAddFeedOpen: boolean;
  isShortcutsOpen: boolean;
  isSettingsOpen: boolean;
  isMobileDrawerOpen: boolean;
  isMobileReaderOpen: boolean;
  anonymousSharingEnabled: boolean;
  isOffline: boolean;
  isSyncingAll: boolean;
  toastMessage: string | null;
}

const defaultState: UIState = {
  view: 'timeline',
  selectedFilter: 'all',
  timelineSubFilter: 'all',
  activePostId: null,
  searchQuery: '',
  fontFamily: 'sans',
  fontSize: 'base',
  lineHeight: 'comfortable',
  readingWidth: 'medium',
  theme: 'dark',
  resolvedTheme: 'dark',
  timelineWidth: 360,
  isReaderExpanded: false,
  isSidebarExpanded: false,
  isAddFeedOpen: false,
  isShortcutsOpen: false,
  isSettingsOpen: false,
  isMobileDrawerOpen: false,
  isMobileReaderOpen: false,
  anonymousSharingEnabled: false,
  isOffline: false,
  isSyncingAll: false,
  toastMessage: null,
};

function resolveSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeToDOM(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const resolved = theme === 'system' ? resolveSystemTheme() : theme;
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// Initialize with stored preferences if available in browser
function getInitialState(): UIState {
  if (typeof window === 'undefined') return defaultState;

  try {
    const savedFont = localStorage.getItem('swr_font_family') as FontFamily | null;
    const savedSize = localStorage.getItem('swr_font_size') as FontSize | null;
    const savedLineHeight = localStorage.getItem('swr_line_height') as LineHeight | null;
    const savedReadingWidth = localStorage.getItem('swr_reading_width') as ReadingWidth | null;
    const savedTheme = (localStorage.getItem('swr_theme') as ThemeMode | null) || 'dark';
    const savedWidth = Number(localStorage.getItem('swr_timeline_width'));
    const savedSharing = localStorage.getItem('swr_anonymous_sharing');

    const resolved = savedTheme === 'system' ? resolveSystemTheme() : savedTheme;
    applyThemeToDOM(savedTheme);

    return {
      ...defaultState,
      fontFamily: savedFont === 'serif' ? 'serif' : 'sans',
      fontSize: savedSize || 'base',
      lineHeight: savedLineHeight || 'comfortable',
      readingWidth: savedReadingWidth || 'medium',
      theme: savedTheme,
      resolvedTheme: resolved,
      timelineWidth: savedWidth && savedWidth >= 260 && savedWidth <= 640 ? savedWidth : 360,
      anonymousSharingEnabled: savedSharing === 'true',
      isOffline: !navigator.onLine,
    };
  } catch {
    return defaultState;
  }
}

let currentState: UIState = getInitialState();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

let toastTimeout: NodeJS.Timeout | null = null;

export const uiStore = {
  getSnapshot(): UIState {
    return currentState;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setState(partial: Partial<UIState> | ((prev: UIState) => Partial<UIState>)) {
    const updates = typeof partial === 'function' ? partial(currentState) : partial;
    currentState = { ...currentState, ...updates };

    // Persist settings
    if (typeof window !== 'undefined') {
      try {
        if (updates.fontFamily) localStorage.setItem('swr_font_family', updates.fontFamily);
        if (updates.fontSize) localStorage.setItem('swr_font_size', updates.fontSize);
        if (updates.lineHeight) localStorage.setItem('swr_line_height', updates.lineHeight);
        if (updates.readingWidth) localStorage.setItem('swr_reading_width', updates.readingWidth);
        if (updates.theme) {
          localStorage.setItem('swr_theme', updates.theme);
          applyThemeToDOM(updates.theme);
          currentState.resolvedTheme = updates.theme === 'system' ? resolveSystemTheme() : updates.theme;
        }
        if (updates.timelineWidth) {
          localStorage.setItem('swr_timeline_width', String(updates.timelineWidth));
        }
        if (updates.anonymousSharingEnabled !== undefined) {
          localStorage.setItem('swr_anonymous_sharing', String(updates.anonymousSharingEnabled));
        }
      } catch {
        // Ignore localStorage quota errors
      }
    }

    notify();
  },

  // ── Actions ───────────────────────────────────────────────────
  setView(view: ActiveView) {
    uiStore.setState({
      view,
      isMobileDrawerOpen: false,
    });
  },

  setSelectedFilter(filter: FilterType) {
    uiStore.setState({
      selectedFilter: filter,
      view: 'timeline',
      activePostId: null,
      isMobileDrawerOpen: false,
    });
  },

  setTimelineSubFilter(subFilter: TimelineSubFilter) {
    uiStore.setState({ timelineSubFilter: subFilter });
  },

  setActivePostId(postId: string | null) {
    uiStore.setState({
      activePostId: postId,
      isMobileReaderOpen: Boolean(postId),
    });
  },

  setSearchQuery(query: string) {
    uiStore.setState({ searchQuery: query });
  },

  setFontFamily(family: FontFamily) {
    uiStore.setState({ fontFamily: family });
  },

  setFontSize(size: FontSize) {
    uiStore.setState({ fontSize: size });
  },

  setLineHeight(lineHeight: LineHeight) {
    uiStore.setState({ lineHeight });
  },

  setReadingWidth(readingWidth: ReadingWidth) {
    uiStore.setState({ readingWidth });
  },

  setTheme(theme: ThemeMode) {
    uiStore.setState({ theme });
  },

  setTimelineWidth(width: number) {
    const clamped = Math.min(600, Math.max(260, Math.round(width)));
    uiStore.setState({ timelineWidth: clamped });
  },

  setReaderExpanded(expanded: boolean) {
    uiStore.setState({ isReaderExpanded: expanded });
  },

  setSidebarExpanded(expanded: boolean) {
    uiStore.setState({ isSidebarExpanded: expanded });
  },

  toggleSidebarExpanded() {
    uiStore.setState((prev) => ({ isSidebarExpanded: !prev.isSidebarExpanded }));
  },

  toggleReaderExpanded() {
    uiStore.setState((s) => ({ isReaderExpanded: !s.isReaderExpanded }));
  },

  increaseFontSize() {
    const sizes: FontSize[] = ['sm', 'base', 'lg', 'xl'];
    const idx = sizes.indexOf(currentState.fontSize);
    if (idx < sizes.length - 1) {
      uiStore.setFontSize(sizes[idx + 1]);
    }
  },

  decreaseFontSize() {
    const sizes: FontSize[] = ['sm', 'base', 'lg', 'xl'];
    const idx = sizes.indexOf(currentState.fontSize);
    if (idx > 0) {
      uiStore.setFontSize(sizes[idx - 1]);
    }
  },

  setAddFeedOpen(open: boolean) {
    uiStore.setState({ isAddFeedOpen: open });
  },

  setShortcutsOpen(open: boolean) {
    uiStore.setState({ isShortcutsOpen: open });
  },

  setSettingsOpen(open: boolean) {
    uiStore.setState({ isSettingsOpen: open });
  },

  setMobileDrawerOpen(open: boolean) {
    uiStore.setState({ isMobileDrawerOpen: open });
  },

  setMobileReaderOpen(open: boolean) {
    uiStore.setState({ isMobileReaderOpen: open });
    if (!open) {
      uiStore.setState({ activePostId: null });
    }
  },

  setAnonymousSharing(enabled: boolean) {
    uiStore.setState({ anonymousSharingEnabled: enabled });
  },

  setSyncingAll(syncing: boolean) {
    uiStore.setState({ isSyncingAll: syncing });
  },

  showToast(message: string) {
    if (toastTimeout) clearTimeout(toastTimeout);
    uiStore.setState({ toastMessage: message });
    toastTimeout = setTimeout(() => {
      uiStore.setState({ toastMessage: null });
    }, 2500);
  },
};

// React hook to access the UI store
export function useUIStore(): UIState;
export function useUIStore<T>(selector: (state: UIState) => T): T;
export function useUIStore<T>(selector?: (state: UIState) => T): T | UIState {
  const state = useSyncExternalStore(
    uiStore.subscribe,
    uiStore.getSnapshot,
    () => defaultState
  );

  return selector ? selector(state) : state;
}

// Global window event listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    uiStore.setState({ isOffline: false });
  });

  window.addEventListener('offline', () => {
    uiStore.setState({ isOffline: true });
  });

  // Watch for system color scheme change
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', () => {
    if (currentState.theme === 'system') {
      applyThemeToDOM('system');
      uiStore.setState({ resolvedTheme: resolveSystemTheme() });
    }
  });
}
