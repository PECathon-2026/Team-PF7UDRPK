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
      lineHeight: 'comfortable',
      readingWidth: 'medium',
      theme: 'dark',
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

  it('adjusts font family, font size, line height, and reading width', () => {
    uiStore.setFontFamily('serif');
    expect(uiStore.getSnapshot().fontFamily).toBe('serif');

    // Font size steppers
    uiStore.increaseFontSize();
    expect(uiStore.getSnapshot().fontSize).toBe('lg');

    uiStore.increaseFontSize();
    expect(uiStore.getSnapshot().fontSize).toBe('xl');

    uiStore.increaseFontSize();
    expect(uiStore.getSnapshot().fontSize).toBe('xl'); // max

    uiStore.decreaseFontSize();
    expect(uiStore.getSnapshot().fontSize).toBe('lg');

    // Line height
    uiStore.setLineHeight('relaxed');
    expect(uiStore.getSnapshot().lineHeight).toBe('relaxed');

    // Reading width
    uiStore.setReadingWidth('wide');
    expect(uiStore.getSnapshot().readingWidth).toBe('wide');
  });

  it('manages theme modes (dark, light, system)', () => {
    uiStore.setTheme('light');
    expect(uiStore.getSnapshot().theme).toBe('light');

    uiStore.setTheme('dark');
    expect(uiStore.getSnapshot().theme).toBe('dark');

    uiStore.setTheme('system');
    expect(uiStore.getSnapshot().theme).toBe('system');
  });

  it('handles timeline width constraints for resizable pane', () => {
    uiStore.setTimelineWidth(450);
    expect(uiStore.getSnapshot().timelineWidth).toBe(450);

    // Clamps below minimum (260px)
    uiStore.setTimelineWidth(150);
    expect(uiStore.getSnapshot().timelineWidth).toBe(260);

    // Clamps above maximum (600px)
    uiStore.setTimelineWidth(900);
    expect(uiStore.getSnapshot().timelineWidth).toBe(600);
  });

  it('toggles reader focus expansion mode', () => {
    expect(uiStore.getSnapshot().isReaderExpanded).toBe(false);

    uiStore.toggleReaderExpanded();
    expect(uiStore.getSnapshot().isReaderExpanded).toBe(true);

    uiStore.toggleReaderExpanded();
    expect(uiStore.getSnapshot().isReaderExpanded).toBe(false);
  });

  it('controls modal dialog states and toasts', () => {
    uiStore.setAddFeedOpen(true);
    expect(uiStore.getSnapshot().isAddFeedOpen).toBe(true);

    uiStore.setShortcutsOpen(true);
    expect(uiStore.getSnapshot().isShortcutsOpen).toBe(true);

    uiStore.setSettingsOpen(true);
    expect(uiStore.getSnapshot().isSettingsOpen).toBe(true);

    uiStore.showToast('Article starred ⭐');
    expect(uiStore.getSnapshot().toastMessage).toBe('Article starred ⭐');
  });

  it('manages anonymous sharing preference', () => {
    expect(uiStore.getSnapshot().anonymousSharingEnabled).toBe(false);
    uiStore.setAnonymousSharing(true);
    expect(uiStore.getSnapshot().anonymousSharingEnabled).toBe(true);
  });
});
