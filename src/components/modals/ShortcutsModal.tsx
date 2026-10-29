'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { useUIStore, uiStore } from '@/lib/client/ui-store';

const SHORTCUTS = [
  { key: 'j', label: 'Next article in timeline' },
  { key: 'k', label: 'Previous article in timeline' },
  { key: 'Enter', label: 'Open selected article' },
  { key: 'o', label: 'Open original article in new tab' },
  { key: 's', label: 'Star / Unstar article' },
  { key: 'm', label: 'Toggle Read / Unread' },
  { key: '/', label: 'Focus timeline search' },
  { key: 'Esc', label: 'Close reader / modal dialogs' },
  { key: '?', label: 'Show this keyboard shortcuts cheat-sheet' },
];

export function ShortcutsModal() {
  const isOpen = useUIStore((s) => s.isShortcutsOpen);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => uiStore.setShortcutsOpen(false)}
      title="Keyboard Shortcuts"
      description="Navigate feeds and read articles at lightning speed without touching the mouse."
    >
      <div className="space-y-2.5">
        {SHORTCUTS.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-reader-selected/50 transition-colors"
          >
            <span className="text-sm text-reader-text">{item.label}</span>
            <kbd className="px-2 py-1 text-xs font-mono font-semibold text-reader-accent bg-reader-selected border border-reader-border rounded-md shadow-sm">
              {item.key}
            </kbd>
          </div>
        ))}
      </div>
      <div className="mt-6 pt-4 border-t border-reader-borderMuted text-center">
        <p className="text-xs text-reader-muted">
          Press <kbd className="px-1.5 py-0.5 text-[10px] bg-reader-selected rounded border border-reader-border">Esc</kbd> or click outside to dismiss.
        </p>
      </div>
    </Modal>
  );
}

