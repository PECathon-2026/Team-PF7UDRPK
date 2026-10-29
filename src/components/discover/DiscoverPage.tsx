'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDB } from '@/lib/client/db';
import { subscribeFeed } from '@/lib/client/feed-manager';
import { useUIStore, uiStore } from '@/lib/client/ui-store';
import { Badge } from '@/components/ui/Badge';
import {
  Sparkles,
  ShieldCheck,
  Compass,
  Check,
  Plus,
  Loader2,
  ExternalLink,
  Users,
  Shuffle,
  RefreshCw,
  Info,
  Menu,
} from 'lucide-react';

interface RecommendationItem {
  normalizedUrl: string;
  originalUrl: string;
  title: string;
  siteUrl: string | null;
  category: string;
  score: number;
  reason: string;
  subscriberCount: number;
  isSerendipity?: boolean;
}

interface RecommendationResponse {
  recommendations: RecommendationItem[];
  serendipityPicks: RecommendationItem[];
}

export function DiscoverPage() {
  const anonymousSharing = useUIStore((s) => s.anonymousSharingEnabled);
  const isOffline = useUIStore((s) => s.isOffline);

  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscribingUrl, setSubscribingUrl] = useState<string | null>(null);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [batchSubmittedNotice, setBatchSubmittedNotice] = useState<string | null>(null);

  // Live query for user subscriptions
  const subscribedFeeds = useLiveQuery(() => localDB.feeds.toArray(), []) ?? [];
  const subscribedUrlSet = useMemo(() => {
    return new Set(subscribedFeeds.map((f) => f.url));
  }, [subscribedFeeds]);

  // Fetch recommendations from /api/discovery/recommendations
  async function fetchRecommendations() {
    if (isOffline) {
      setError('Recommendations require an internet connection.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const feedParam = subscribedFeeds.map((f) => encodeURIComponent(f.url)).join(',');
      const url = `/api/discovery/recommendations?limit=8${feedParam ? `&feeds=${feedParam}` : ''}`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load recommendations (${res.status})`);
      }
      const json: RecommendationResponse = await res.json();
      setData(json);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching recommendations';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchRecommendations();
  }, [subscribedFeeds.length, isOffline]);

  // Submit anonymous batch if user opted in and has subscriptions
  async function handleToggleAnonymousSharing(enabled: boolean) {
    uiStore.setAnonymousSharing(enabled);

    if (enabled && subscribedFeeds.length > 0 && !isOffline) {
      setIsSubmittingBatch(true);
      try {
        const payload = {
          feeds: subscribedFeeds.map((f) => f.url),
        };
        const res = await fetch('/api/discovery/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          setBatchSubmittedNotice('Anonymous batch contributed to small-web graph!');
          setTimeout(() => setBatchSubmittedNotice(null), 4000);
        }
      } catch {
        // Non-fatal
      } finally {
        setIsSubmittingBatch(false);
      }
    }
  }

  async function handleFollow(targetUrl: string) {
    setSubscribingUrl(targetUrl);
    try {
      await subscribeFeed(targetUrl);
    } finally {
      setSubscribingUrl(null);
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-reader-bg overflow-y-auto">
      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="p-6 sm:p-10 border-b border-reader-border bg-reader-surface/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile menu button */}
              <button
                onClick={() => uiStore.setMobileDrawerOpen(true)}
                className="lg:hidden p-1.5 -ml-1 text-reader-muted hover:text-reader-text rounded-md"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="w-10 h-10 rounded-xl bg-reader-accentBg border border-reader-accent/20 flex items-center justify-center text-reader-accent">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-reader-text tracking-tight">
                  ✨ Discover Small Web Blogs
                </h1>
                <p className="text-xs sm:text-sm text-reader-muted mt-0.5">
                  Serendipitous co-subscription discovery with zero trackers or invasive profiling.
                </p>
              </div>
            </div>

            <button
              onClick={fetchRecommendations}
              disabled={isLoading || isOffline}
              className="p-2 text-reader-muted hover:text-reader-text hover:bg-reader-selected border border-reader-border rounded-lg transition-colors disabled:opacity-40"
              title="Refresh recommendations"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-reader-accent' : ''}`} />
            </button>
          </div>

          {/* Privacy Opt-in Card */}
          <div className="p-4 bg-reader-surface border border-reader-border rounded-xl space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-reader-text">
                    Privacy-Preserving Co-Subscription Opt-in
                  </span>
                </div>
                <p className="text-xs text-reader-muted leading-relaxed">
                  Share anonymous subscription URLs to improve recommendations for everyone.
                  All submissions are salted, hashed hourly, and never tied to personal accounts or IP logs.
                </p>
              </div>

              {/* Opt-in toggle switch */}
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={anonymousSharing}
                  onChange={(e) => handleToggleAnonymousSharing(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-reader-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-reader-accent"></div>
              </label>
            </div>

            {batchSubmittedNotice && (
              <div className="text-xs text-emerald-400 font-medium animate-in fade-in">
                ✓ {batchSubmittedNotice}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Recommendations Content ─────────────────────────── */}
      <div className="flex-1 p-6 sm:p-10 max-w-4xl mx-auto w-full space-y-10">
        {/* Error State */}
        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading && !data && (
          <div className="p-12 text-center space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-reader-accent mx-auto" />
            <p className="text-xs text-reader-muted">Computing co-reading graphs and serendipity shelf...</p>
          </div>
        )}

        {/* ── Serendipity Shelf ("Step Outside Your Bubble") ─── */}
        {data?.serendipityPicks && data.serendipityPicks.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shuffle className="w-4 h-4 text-reader-accent" />
                <h2 className="text-sm font-semibold text-reader-text tracking-tight uppercase tracking-wider text-[11px]">
                  ✨ Step Outside Your Bubble
                </h2>
                <Badge variant="accent" size="sm">
                  10–15% Serendipity Shelf
                </Badge>
              </div>
              <span className="text-[11px] text-reader-dim hidden sm:inline">
                Independent blogs outside your typical cluster
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.serendipityPicks.map((pick) => {
                const isSubscribed = subscribedUrlSet.has(pick.originalUrl);
                const isCurrentlySubscribing = subscribingUrl === pick.originalUrl;

                return (
                  <div
                    key={pick.normalizedUrl}
                    className="relative bg-reader-surface border border-reader-accent/30 rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-md hover:border-reader-accent/60 transition-all"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="accent" size="sm">
                          {pick.reason}
                        </Badge>
                        <span className="text-[10px] text-reader-dim capitalize font-mono">
                          {pick.category}
                        </span>
                      </div>

                      <h3 className="text-sm font-semibold text-reader-text leading-snug">
                        {pick.title}
                      </h3>

                      {pick.siteUrl && (
                        <a
                          href={pick.siteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-reader-accent hover:underline flex items-center gap-1"
                        >
                          <span>{pick.siteUrl.replace(/^https?:\/\//, '')}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>

                    <div className="pt-2 border-t border-reader-borderMuted flex items-center justify-between">
                      <span className="text-[11px] text-reader-dim flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <span>{pick.subscriberCount} co-readers</span>
                      </span>

                      <button
                        onClick={() => handleFollow(pick.originalUrl)}
                        disabled={isSubscribed || isCurrentlySubscribing}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                          isSubscribed
                            ? 'bg-reader-selected text-emerald-400'
                            : 'bg-reader-accent text-reader-bg hover:bg-reader-accentHover'
                        }`}
                      >
                        {isCurrentlySubscribing ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isSubscribed ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Followed</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            <span>Follow</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Co-Subscription Recommended Blogs ─────────────── */}
        {data?.recommendations && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-reader-dim" />
                <h2 className="text-sm font-semibold text-reader-text tracking-tight uppercase tracking-wider text-[11px]">
                  Recommended for You
                </h2>
              </div>
              <span className="text-[11px] text-reader-dim">
                Based on transparent topic & co-reading overlap
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.recommendations.map((rec) => {
                const isSubscribed = subscribedUrlSet.has(rec.originalUrl);
                const isCurrentlySubscribing = subscribingUrl === rec.originalUrl;

                return (
                  <div
                    key={rec.normalizedUrl}
                    className="bg-reader-surface border border-reader-border rounded-xl p-4 flex flex-col justify-between space-y-3 hover:border-reader-accent/30 transition-all shadow-sm"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="unread" size="sm">
                          {rec.reason}
                        </Badge>
                        <span className="text-[10px] text-reader-dim capitalize font-mono">
                          {rec.category}
                        </span>
                      </div>

                      <h3 className="text-base font-semibold text-reader-text leading-snug">
                        {rec.title}
                      </h3>

                      {rec.siteUrl && (
                        <a
                          href={rec.siteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-reader-dim hover:text-reader-muted flex items-center gap-1"
                        >
                          <span>{rec.siteUrl.replace(/^https?:\/\//, '')}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    <div className="pt-2 border-t border-reader-borderMuted flex items-center justify-between">
                      <span className="text-[11px] text-reader-dim flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <span>{rec.subscriberCount} subscribers</span>
                      </span>

                      <button
                        onClick={() => handleFollow(rec.originalUrl)}
                        disabled={isSubscribed || isCurrentlySubscribing}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                          isSubscribed
                            ? 'bg-reader-selected text-emerald-400'
                            : 'bg-reader-accent text-reader-bg hover:bg-reader-accentHover'
                        }`}
                      >
                        {isCurrentlySubscribing ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Adding...</span>
                          </>
                        ) : isSubscribed ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Following</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Follow</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

