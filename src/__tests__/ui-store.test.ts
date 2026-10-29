import { describe, it, expect, beforeEach } from 'vitest';
import { uiStore } from '@/lib/client/ui-store';

describe('uiStore', () => {
  beforeEach(() => {
    uiStore.setState({
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
    });
  });

  it('updates view correctly', () => {
    uiStore.setView('explore');
    expect(uiStore.getSnapshot().view).toBe('explore');

    uiStore.setView('discover');
    expect(uiStore.getSnapshot().view).toBe('discover');

    uiStore.setView('timeline');
    expect(uiStore.getSnapshot().view).toBe('timeline');
  });

  it('updates selectedFilter and resets view to timeline', () => {
    uiStore.setView('explore');
    uiStore.setSelectedFilter('unread');
    expect(uiStore.getSnapshot().selectedFilter).toBe('unread');
    expect(uiStore.getSnapshot().view).toBe('timeline');
  });

  it('handles activePostId and mobile reader state', () => {
    uiStore.setActivePostId('post-123');
    expect(uiStore.getSnapshot().activePostId).toBe('post-123');
    expect(uiStore.getSnapshot().isMobileReaderOpen).toBe(true);

    uiStore.setActivePostId(null);
    expect(uiStore.getSnapshot().activePostId).toBeNull();
    expect(uiStore.getSnapshot().isMobileReaderOpen).toBe(false);
  });

  it('adjusts font family and font size', () => {
    uiStore.setFontFamily('serif');
    expect(uiStore.getSnapshot().fontFamily).toBe('serif');

    // Default is 'base'
    uiStore.increaseFontSize();
    expect(uiStore.getSnapshot().fontSize).toBe('lg');

    uiStore.increaseFontSize();
    expect(uiStore.getSnapshot().fontSize).toBe('xl');

    // Cannot increase beyond xl
    uiStore.increaseFontSize();
    expect(uiStore.getSnapshot().fontSize).toBe('xl');

    uiStore.decreaseFontSize();
    expect(uiStore.getSnapshot().fontSize).toBe('lg');
  });

  it('controls modal dialog states', () => {
    uiStore.setAddFeedOpen(true);
    expect(uiStore.getSnapshot().isAddFeedOpen).toBe(true);

    uiStore.setShortcutsOpen(true);
    expect(uiStore.getSnapshot().isShortcutsOpen).toBe(true);
  });

  it('manages anonymous sharing preference', () => {
    expect(uiStore.getSnapshot().anonymousSharingEnabled).toBe(false);
    uiStore.setAnonymousSharing(true);
    expect(uiStore.getSnapshot().anonymousSharingEnabled).toBe(true);
  });
});

