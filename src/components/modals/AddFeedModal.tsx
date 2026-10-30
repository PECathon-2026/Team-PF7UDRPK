'use client';

import React, { useState, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useUIStore, uiStore } from '@/lib/client/ui-store';
import { subscribeFeed, importSubscriptionsFromOpml } from '@/lib/client/feed-manager';
import { Rss, Loader2, Sparkles, CheckCircle2, AlertCircle, Upload } from 'lucide-react';

const SUGGESTED_FEEDS = [
  { name: 'Dan Luu', url: 'https://danluu.com' },
  { name: 'Simon Willison', url: 'https://simonwillison.net' },
  { name: 'Julia Evans', url: 'https://jvns.ca' },
  { name: 'Robin Sloan', url: 'https://www.robinsloan.com' },
  { name: 'Drew DeVault', url: 'https://drewdevault.com' },
];

export function AddFeedModal() {
  const isOpen = useUIStore((s) => s.isAddFeedOpen);
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successFeedTitle, setSuccessFeedTitle] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleClose() {
    if (isLoading || isImporting) return;
    uiStore.setAddFeedOpen(false);
    setUrl('');
    setError(null);
    setSuccessFeedTitle(null);
  }

  async function handleSubscribe(targetUrl: string) {
    if (!targetUrl.trim()) return;

    setIsLoading(true);
    setError(null);
    setSuccessFeedTitle(null);

    try {
      const feed = await subscribeFeed(targetUrl.trim());
      setSuccessFeedTitle(feed.title);
      setUrl('');

      // Auto-select the newly added feed after short delay
      setTimeout(() => {
        uiStore.setSelectedFilter(feed.id);
        handleClose();
      }, 1000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to subscribe to feed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOpmlFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);
    try {
      const text = await file.text();
      const summary = await importSubscriptionsFromOpml(text);
      uiStore.showToast(
        `Imported ${summary.succeeded} of ${summary.total} feeds from OPML (${summary.failed} failed)`
      );
      handleClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid OPML file';
      setError(message);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Subscription"
      description="Enter a website URL or direct RSS/Atom feed link. Autodiscovery will locate the feed automatically."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubscribe(url);
        }}
        className="space-y-4"
      >
        <div>
          <label
            htmlFor="feed-url-input"
            className="block text-xs font-medium text-reader-muted mb-1.5"
          >
            Blog or Feed URL
          </label>
          <div className="relative">
            <input
              id="feed-url-input"
              type="text"
              autoFocus
              disabled={isLoading || isImporting}
              placeholder="e.g. https://danluu.com or https://jvns.ca/atom.xml"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              className="w-full px-3.5 py-2.5 bg-reader-bg border border-reader-border rounded-lg text-sm text-reader-text placeholder-reader-dim focus:outline-none focus:border-reader-accent transition-colors disabled:opacity-50"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-reader-dim">
              <Rss className="w-4 h-4" />
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successFeedTitle && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2.5 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Subscribed to <strong>{successFeedTitle}</strong>! Syncing posts...
            </span>
          </div>
        )}

        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-reader-dim mb-2">
            <Sparkles className="w-3.5 h-3.5 text-reader-accent" />
            <span>Suggested Small Web Blogs</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_FEEDS.map((item) => (
              <button
                key={item.url}
                type="button"
                disabled={isLoading || isImporting}
                onClick={() => {
                  setUrl(item.url);
                  handleSubscribe(item.url);
                }}
                className="px-2.5 py-1 text-xs bg-reader-selected hover:bg-reader-surfaceHover text-reader-text border border-reader-border rounded-md transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between gap-2.5 border-t border-reader-borderMuted">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isImporting}
            className="text-xs text-reader-muted hover:text-reader-accent flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {isImporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>{isImporting ? 'Importing OPML...' : 'Import OPML file'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml,text/xml,application/xml"
            onChange={handleOpmlFile}
            className="hidden"
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isLoading || isImporting}
              onClick={handleClose}
              className="px-3.5 py-2 text-xs font-medium text-reader-muted hover:text-reader-text hover:bg-reader-selected rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || isImporting || !url.trim()}
              className="px-4 py-2 text-xs font-medium text-reader-bg bg-reader-accent hover:bg-reader-accentHover disabled:opacity-50 rounded-lg transition-colors font-semibold flex items-center gap-2 shadow-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Subscribing...</span>
                </>
              ) : (
                <span>Add Feed</span>
              )}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
