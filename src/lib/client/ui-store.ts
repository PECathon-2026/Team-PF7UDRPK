'use client';

import { useSyncExternalStore } from 'react';

export type ActiveView = 'timeline' | 'explore' | 'discover';
export type FilterType = 'all' | 'unread' | 'starred' | string; // or feedId
export type TimelineSubFilter = 'all' | 'unread';
export type FontFamily = 'sans' | 'serif';
export type FontSize = 'sm' | 'base' | 'lg' | 'xl';

export interface UIState {
  view: ActiveView;
  selectedFilter: FilterType;
  timelineSubFilter: TimelineSubFilter;
  activePostId: string | null;
  searchQuery: string;
  fontFamily: FontFamily;
  fontSize: FontSize;
  isAddFeedOpen: boolean;
  isShortcutsOpen: boolean;
  isMobileDrawerOpen: boolean;
  isMobileReaderOpen: boolean;
  anonymousSharingEnabled: boolean;
  isOffline: boolean;
  isSyncingAll: boolean;
}

const defaultState: UIState = {
  view: 'timeline',
  selectedFilter: 'all',
  timelineSubFilter: 'all',
  activePostId: null,
  searchQuery: '',
  fontFamily: 'sans',
  fontSize: 'base',
  isAddFeedOpen: false,
  isShortcutsOpen: false,
  isMobileDrawerOpen: false,
  isMobileReaderOpen: false,
  anonymousSharingEnabled: false,
  isOffline: false,
  isSyncingAll: false,
};

// Initialize with stored preferences if available in browser
function getInitialState(): UIState {
  if (typeof window === 'undefined') return defaultState;

  try {
    const savedFont = localStorage.getItem('swr_font_family') as FontFamily | null;
    const savedSize = localStorage.getItem('swr_font_size') as FontSize | null;
    const savedSharing = localStorage.getItem('swr_anonymous_sharing');

    return {
      ...defaultState,
      fontFamily: savedFont === 'serif' ? 'serif' : 'sans',
      fontSize: savedSize || 'base',
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

    // Persist certain settings
    if (typeof window !== 'undefined') {
      try {
        if (updates.fontFamily) localStorage.setItem('swr_font_family', updates.fontFamily);
        if (updates.fontSize) localStorage.setItem('swr_font_size', updates.fontSize);
        if (updates.anonymousSharingEnabled !== undefined) {
          localStorage.setItem('swr_anonymous_sharing', String(updates.anonymousSharingEnabled));
        }
      } catch {
        // Ignore localStorage quota errors
      }
    }

    notify();
  },

  // Convenient Action Helpers
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

// Global window event listeners for online/offline synchronization
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    uiStore.setState({ isOffline: false });
  });

  window.addEventListener('offline', () => {
    uiStore.setState({ isOffline: true });
  });
}

