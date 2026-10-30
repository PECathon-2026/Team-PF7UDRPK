'use client';

import React, { useState, useRef } from 'react';
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
  exportSubscriptionsToOpml,
  importSubscriptionsFromOpml,
} from '@/lib/client/feed-manager';
import {
  Sun,
  Moon,
  Monitor,
  Type,
  Layout,
  Sliders,
  RotateCcw,
  Sparkles,
  Download,
  Upload,
  Loader2,
  FileText,
} from 'lucide-react';

export function SettingsModal() {
  const isOpen = useUIStore((s) => s.isSettingsOpen);
  const theme = useUIStore((s) => s.theme);
  const fontFamily = useUIStore((s) => s.fontFamily);
  const fontSize = useUIStore((s) => s.fontSize);
  const lineHeight = useUIStore((s) => s.lineHeight);
  const readingWidth = useUIStore((s) => s.readingWidth);
  const timelineWidth = useUIStore((s) => s.timelineWidth);

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleReset() {
    uiStore.setTheme('dark');
    uiStore.setFontFamily('sans');
    uiStore.setFontSize('base');
    uiStore.setLineHeight('comfortable');
    uiStore.setReadingWidth('medium');
    uiStore.setTimelineWidth(360);
    uiStore.showToast('Appearance settings reset to default');
  }

  async function handleExportOpml() {
    setIsExporting(true);
    try {
      const xml = await exportSubscriptionsToOpml();
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `smallweb-subscriptions-${new Date().toISOString().slice(0, 10)}.opml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      uiStore.showToast('Subscriptions exported to OPML file');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      uiStore.showToast(`OPML Export failed: ${msg}`);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const summary = await importSubscriptionsFromOpml(text);
      uiStore.showToast(
        `OPML: Imported ${summary.succeeded} of ${summary.total} feeds (${summary.failed} failed)`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid OPML file';
      uiStore.showToast(`Import error: ${msg}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => uiStore.setSettingsOpen(false)}
      title="Settings &amp; Appearance"
      description="Personalize your reading interface, themes, and workspace layout."
      maxWidth="lg"
    >
      <div className="space-y-5 sm:space-y-6 text-sm">
        {/* ── Theme Mode ────────────────────────────────────── */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-reader-text uppercase tracking-wider block">
            Interface Theme
          </label>
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={() => uiStore.setTheme('light')}
              className={`min-h-[64px] sm:min-h-[72px] flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl border transition-all touch-manipulation active:scale-95 ${
                theme === 'light'
                  ? 'bg-reader-selected text-reader-accent border-reader-accent font-semibold shadow-sm'
                  : 'bg-reader-bg text-reader-muted border-reader-border hover:text-reader-text hover:bg-reader-surfaceHover'
              }`}
            >
              <Sun className="w-5 h-5 mb-1.5 text-amber-500 shrink-0" />
              <span className="text-xs truncate w-full text-center">Light</span>
            </button>

            <button
              type="button"
              onClick={() => uiStore.setTheme('dark')}
              className={`min-h-[64px] sm:min-h-[72px] flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl border transition-all touch-manipulation active:scale-95 ${
                theme === 'dark'
                  ? 'bg-reader-selected text-reader-accent border-reader-accent font-semibold shadow-sm'
                  : 'bg-reader-bg text-reader-muted border-reader-border hover:text-reader-text hover:bg-reader-surfaceHover'
              }`}
            >
              <Moon className="w-5 h-5 mb-1.5 text-indigo-400 shrink-0" />
              <span className="text-xs truncate w-full text-center">Dark</span>
            </button>

            <button
              type="button"
              onClick={() => uiStore.setTheme('system')}
              className={`min-h-[64px] sm:min-h-[72px] flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl border transition-all touch-manipulation active:scale-95 ${
                theme === 'system'
                  ? 'bg-reader-selected text-reader-accent border-reader-accent font-semibold shadow-sm'
                  : 'bg-reader-bg text-reader-muted border-reader-border hover:text-reader-text hover:bg-reader-surfaceHover'
              }`}
            >
              <Monitor className="w-5 h-5 mb-1.5 text-reader-dim shrink-0" />
              <span className="text-xs truncate w-full text-center">System</span>
            </button>
          </div>
        </div>

        {/* ── Reader Typography ─────────────────────────────────────────── */}
        <div className="space-y-3 pt-4 border-t border-reader-borderMuted">
          <label className="text-xs font-semibold text-reader-text uppercase tracking-wider block">
            Reader Typography
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
            {/* Font Family */}
            <div className="space-y-1.5">
              <span className="text-xs text-reader-muted block">Font Family</span>
              <div className="grid grid-cols-2 gap-2 sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => uiStore.setFontFamily('sans')}
                  className={`px-3 py-2.5 sm:py-2 text-xs rounded-lg border font-sans transition-colors touch-manipulation active:scale-95 ${
                    fontFamily === 'sans'
                      ? 'bg-reader-selected text-reader-accent border-reader-accent font-semibold'
                      : 'bg-reader-bg text-reader-muted border-reader-border hover:text-reader-text'
                  }`}
                >
                  Sans-Serif
                </button>
                <button
                  type="button"
                  onClick={() => uiStore.setFontFamily('serif')}
                  className={`px-3 py-2.5 sm:py-2 text-xs rounded-lg border font-serif transition-colors touch-manipulation active:scale-95 ${
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
              <span className="text-xs text-reader-muted block">Font Size</span>
              <div className="grid grid-cols-4 gap-1.5 sm:gap-1">
                {(['sm', 'base', 'lg', 'xl'] as FontSize[]).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => uiStore.setFontSize(sz)}
                    className={`py-2.5 sm:py-2 text-xs rounded-lg border uppercase font-mono transition-colors touch-manipulation active:scale-95 ${
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 pt-1">
            {/* Line Height */}
            <div className="space-y-1.5">
              <span className="text-xs text-reader-muted block">Line Height</span>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-1">
                {(['compact', 'comfortable', 'relaxed'] as LineHeight[]).map((lh) => (
                  <button
                    key={lh}
                    type="button"
                    onClick={() => uiStore.setLineHeight(lh)}
                    className={`py-2.5 sm:py-2 text-[11px] rounded-lg border capitalize transition-colors truncate touch-manipulation active:scale-95 ${
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
              <span className="text-xs text-reader-muted block">Reading Width</span>
              <div className="grid grid-cols-4 gap-1.5 sm:gap-1">
                {(['narrow', 'medium', 'wide', 'full'] as ReadingWidth[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => uiStore.setReadingWidth(w)}
                    className={`py-2.5 sm:py-2 text-[11px] rounded-lg border capitalize transition-colors truncate touch-manipulation active:scale-95 ${
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

        {/* ── Layout & Pane Width ────────────────────────────────────────── */}
        <div className="space-y-3 pt-4 border-t border-reader-borderMuted">
          <label className="text-xs font-semibold text-reader-text uppercase tracking-wider block">
            Workspace Panes
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-reader-muted">Timeline Pane Width</span>
              <span className="font-mono text-reader-dim font-medium">{timelineWidth}px</span>
            </div>
            <input
              type="range"
              min="280"
              max="520"
              step="10"
              value={timelineWidth}
              onChange={(e) => uiStore.setTimelineWidth(Number(e.target.value))}
              className="w-full accent-reader-accent cursor-pointer h-2 bg-reader-border rounded-lg appearance-none"
            />
            <div className="flex justify-between items-center text-[10px] text-reader-dim">
              <span>280px <span className="hidden sm:inline">(Narrow)</span></span>
              <span className="font-medium text-center">360px <span className="hidden sm:inline">(Default)</span></span>
              <span className="text-right">520px <span className="hidden sm:inline">(Wide)</span></span>
            </div>
          </div>
        </div>

        {/* ── Subscriptions & Data Portability (OPML) ───────────────────── */}
        <div className="space-y-3 pt-4 border-t border-reader-borderMuted">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-reader-text uppercase tracking-wider block">
              Subscription Portability (OPML)
            </label>
            <span className="text-[10px] text-reader-dim font-mono">Standard OPML 2.0</span>
          </div>
          <p className="text-xs text-reader-muted leading-relaxed">
            Export all your followed feeds to take them to another reader, or import an OPML backup from NetNewsWire, Feedly, or Inoreader.
          </p>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={handleExportOpml}
              disabled={isExporting}
              className="px-3 py-2.5 bg-reader-bg border border-reader-border hover:border-reader-accent/40 hover:bg-reader-surfaceHover text-reader-text rounded-xl transition-all flex items-center justify-center gap-2 text-xs font-medium disabled:opacity-50 active:scale-[0.98] touch-manipulation"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-reader-accent" />
              ) : (
                <Download className="w-4 h-4 text-reader-accent" />
              )}
              <span>Export OPML</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="px-3 py-2.5 bg-reader-bg border border-reader-border hover:border-reader-accent/40 hover:bg-reader-surfaceHover text-reader-text rounded-xl transition-all flex items-center justify-center gap-2 text-xs font-medium disabled:opacity-50 active:scale-[0.98] touch-manipulation"
            >
              {isImporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-reader-accent" />
              ) : (
                <Upload className="w-4 h-4 text-reader-accent" />
              )}
              <span>Import OPML</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml,text/xml,application/xml"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* ── Action Buttons (Sticky on mobile) ───────────────── */}
        <div className="pt-4 border-t border-reader-borderMuted flex items-center justify-between gap-3 sticky bottom-0 bg-reader-surface/95 backdrop-blur-sm -mx-4 -mb-4 px-4 py-3 sm:static sm:mx-0 sm:mb-0 sm:p-0 sm:pt-4">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 text-xs text-reader-dim hover:text-reader-text hover:bg-reader-selected rounded-lg transition-colors flex items-center gap-1.5 touch-manipulation min-h-[40px] sm:min-h-0 active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to defaults</span>
          </button>

          <button
            type="button"
            onClick={() => uiStore.setSettingsOpen(false)}
            className="px-5 py-2 text-xs font-semibold text-reader-bg bg-reader-accent hover:bg-reader-accentHover rounded-lg transition-colors shadow-sm touch-manipulation min-h-[40px] sm:min-h-0 active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
