'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import {
  useUIStore,
  uiStore,
  ThemeMode,
  FontFamily,
  FontSize,
  LineHeight,
  ReadingWidth,
} from '@/lib/client/ui-store';
import {
  Sun,
  Moon,
  Monitor,
  Type,
  Layout,
  Sliders,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

export function SettingsModal() {
  const isOpen = useUIStore((s) => s.isSettingsOpen);
  const theme = useUIStore((s) => s.theme);
  const fontFamily = useUIStore((s) => s.fontFamily);
  const fontSize = useUIStore((s) => s.fontSize);
  const lineHeight = useUIStore((s) => s.lineHeight);
  const readingWidth = useUIStore((s) => s.readingWidth);
  const timelineWidth = useUIStore((s) => s.timelineWidth);

  function handleReset() {
    uiStore.setTheme('dark');
    uiStore.setFontFamily('sans');
    uiStore.setFontSize('base');
    uiStore.setLineHeight('comfortable');
    uiStore.setReadingWidth('medium');
    uiStore.setTimelineWidth(360);
    uiStore.showToast('Appearance settings reset to default');
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => uiStore.setSettingsOpen(false)}
      title="Settings & Appearance"
      description="Personalize your reading interface, themes, and workspace layout."
      maxWidth="lg"
    >
      <div className="space-y-6 text-sm">
        {/* ── Theme Mode ────────────────────────────────────── */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-reader-text uppercase tracking-wider block">
            Interface Theme
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            <button
              onClick={() => uiStore.setTheme('light')}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                theme === 'light'
                  ? 'bg-reader-selected text-reader-accent border-reader-accent font-semibold shadow-sm'
                  : 'bg-reader-bg text-reader-muted border-reader-border hover:text-reader-text hover:bg-reader-surfaceHover'
              }`}
            >
              <Sun className="w-5 h-5 mb-1.5 text-amber-500" />
              <span className="text-xs">Light</span>
            </button>

            <button
              onClick={() => uiStore.setTheme('dark')}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                theme === 'dark'
                  ? 'bg-reader-selected text-reader-accent border-reader-accent font-semibold shadow-sm'
                  : 'bg-reader-bg text-reader-muted border-reader-border hover:text-reader-text hover:bg-reader-surfaceHover'
              }`}
            >
              <Moon className="w-5 h-5 mb-1.5 text-indigo-400" />
              <span className="text-xs">Dark</span>
            </button>

            <button
              onClick={() => uiStore.setTheme('system')}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                theme === 'system'
                  ? 'bg-reader-selected text-reader-accent border-reader-accent font-semibold shadow-sm'
                  : 'bg-reader-bg text-reader-muted border-reader-border hover:text-reader-text hover:bg-reader-surfaceHover'
              }`}
            >
              <Monitor className="w-5 h-5 mb-1.5 text-reader-dim" />
              <span className="text-xs">System</span>
            </button>
          </div>
        </div>

        {/* ── Reader Typography ─────────────────────────────── */}
        <div className="space-y-3 pt-4 border-t border-reader-borderMuted">
          <label className="text-xs font-semibold text-reader-text uppercase tracking-wider block">
            Reader Typography
          </label>

          <div className="grid grid-cols-2 gap-4">
            {/* Font Family */}
            <div className="space-y-1.5">
              <span className="text-xs text-reader-muted">Font Family</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => uiStore.setFontFamily('sans')}
                  className={`px-3 py-2 text-xs rounded-lg border font-sans transition-colors ${
                    fontFamily === 'sans'
                      ? 'bg-reader-selected text-reader-accent border-reader-accent font-semibold'
                      : 'bg-reader-bg text-reader-muted border-reader-border hover:text-reader-text'
                  }`}
                >
                  Sans-serif
                </button>
                <button
                  onClick={() => uiStore.setFontFamily('serif')}
                  className={`px-3 py-2 text-xs rounded-lg border font-serif transition-colors ${
                    fontFamily === 'serif'
                      ? 'bg-reader-selected text-reader-accent border-reader-accent font-semibold'
                      : 'bg-reader-bg text-reader-muted border-reader-border hover:text-reader-text'
                  }`}
                >
                  Serif
                </button>
              </div>
            </div>

            {/* Font Size */}
            <div className="space-y-1.5">
              <span className="text-xs text-reader-muted">Font Size</span>
              <div className="grid grid-cols-4 gap-1">
                {(['sm', 'base', 'lg', 'xl'] as FontSize[]).map((sz) => (
                  <button
                    key={sz}
                    onClick={() => uiStore.setFontSize(sz)}
                    className={`py-2 text-xs rounded-lg border uppercase font-mono transition-colors ${
                      fontSize === sz
                        ? 'bg-reader-selected text-reader-accent border-reader-accent font-semibold'
                        : 'bg-reader-bg text-reader-muted border-reader-border hover:text-reader-text'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            {/* Line Height */}
            <div className="space-y-1.5">
              <span className="text-xs text-reader-muted">Line Height</span>
              <div className="grid grid-cols-3 gap-1">
                {(['compact', 'comfortable', 'relaxed'] as LineHeight[]).map((lh) => (
                  <button
                    key={lh}
                    onClick={() => uiStore.setLineHeight(lh)}
                    className={`py-2 text-[11px] rounded-lg border capitalize transition-colors ${
                      lineHeight === lh
                        ? 'bg-reader-selected text-reader-accent border-reader-accent font-semibold'
                        : 'bg-reader-bg text-reader-muted border-reader-border hover:text-reader-text'
                    }`}
                  >
                    {lh}
                  </button>
                ))}
              </div>
            </div>

            {/* Reading Column Width */}
            <div className="space-y-1.5">
              <span className="text-xs text-reader-muted">Reading Width</span>
              <div className="grid grid-cols-4 gap-1">
                {(['narrow', 'medium', 'wide', 'full'] as ReadingWidth[]).map((w) => (
                  <button
                    key={w}
                    onClick={() => uiStore.setReadingWidth(w)}
                    className={`py-2 text-[11px] rounded-lg border capitalize transition-colors ${
                      readingWidth === w
                        ? 'bg-reader-selected text-reader-accent border-reader-accent font-semibold'
                        : 'bg-reader-bg text-reader-muted border-reader-border hover:text-reader-text'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Layout & Pane Width ────────────────────────────── */}
        <div className="space-y-3 pt-4 border-t border-reader-borderMuted">
          <label className="text-xs font-semibold text-reader-text uppercase tracking-wider block">
            Workspace Panes
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-reader-muted">Timeline Pane Width</span>
              <span className="font-mono text-reader-dim">{timelineWidth}px</span>
            </div>
            <input
              type="range"
              min="280"
              max="520"
              step="10"
              value={timelineWidth}
              onChange={(e) => uiStore.setTimelineWidth(Number(e.target.value))}
              className="w-full accent-reader-accent cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-reader-dim">
              <span>280px (Narrow)</span>
              <span>360px (Default)</span>
              <span>520px (Wide)</span>
            </div>
          </div>
        </div>

        {/* ── Reset Button ──────────────────────────────────── */}
        <div className="pt-4 border-t border-reader-borderMuted flex items-center justify-between">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs text-reader-dim hover:text-reader-text hover:bg-reader-selected rounded-lg transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to defaults</span>
          </button>

          <button
            onClick={() => uiStore.setSettingsOpen(false)}
            className="px-4 py-2 text-xs font-semibold text-reader-bg bg-reader-accent hover:bg-reader-accentHover rounded-lg transition-colors shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

