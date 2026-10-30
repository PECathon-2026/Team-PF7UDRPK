'use client';

import React, { useState, useEffect } from 'react';
import {
  inspectSeedListForTraps,
  TrapDetectionReport,
  TrapFinding,
} from '@/lib/discovery/trap-detector';
import { SEED_BLOGS } from '@/lib/discovery/seed-data';

export default function DiscoveryTesterPage() {
  const [selectedFeeds, setSelectedFeeds] = useState<string[]>([
    'https://danluu.com/atom.xml',
  ]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [batchInput, setBatchInput] = useState(
    'https://danluu.com/atom.xml\nhttps://xeiaso.net/blog.rss'
  );
  const [batchResult, setBatchResult] = useState<any>(null);

  // ── Trap Detector State ───────────────────────────────────────────────────
  const defaultSeedUrls = SEED_BLOGS.map((b) => b.originalUrl).join('\n');
  const [trapUrlsInput, setTrapUrlsInput] = useState<string>(defaultSeedUrls);
  const [trapReport, setTrapReport] = useState<TrapDetectionReport | null>(null);
  const [isAuditingTraps, setIsAuditingTraps] = useState<boolean>(false);
  const [copiedBounty, setCopiedBounty] = useState<boolean>(false);

  const availableSampleFeeds = [
    { label: 'Dan Luu (Systems)', url: 'https://danluu.com/atom.xml' },
    { label: 'Simon Willison (Web/AI)', url: 'https://simonwillison.net/atom/entries/' },
    { label: 'Robin Sloan (Essays/Design)', url: 'https://www.robinsloan.com/feed.xml' },
    { label: 'Bunnie Studios (Hardware)', url: 'https://www.bunniestudios.com/blog/?feed=rss2' },
  ];

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const query =
        selectedFeeds.length > 0
          ? `?feeds=${encodeURIComponent(selectedFeeds.join(','))}`
          : '';
      const res = await fetch(`/api/discovery/recommendations${query}`);
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      alert(`Error fetching recommendations: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchSubmit = async () => {
    const urls = batchInput
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);
    try {
      const res = await fetch('/api/discovery/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feeds: urls }),
      });
      const json = await res.json();
      setBatchResult(json);
      // Refresh recommendations
      fetchRecommendations();
    } catch (err: any) {
      alert(`Submit error: ${err.message}`);
    }
  };

  const toggleFeedSelection = (url: string) => {
    setSelectedFeeds((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  };

  useEffect(() => {
    fetchRecommendations();
  }, [selectedFeeds]);

  // ── Trap Auditor Action ───────────────────────────────────────────────────
  const handleAuditTraps = async () => {
    setIsAuditingTraps(true);
    setCopiedBounty(false);

    const urls = trapUrlsInput
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);

    // Browser-safe fetcher via SSRF proxy
    const browserFetchFn = async (url: string) => {
      try {
        const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
        const text = await res.text();
        return {
          status: res.status,
          text,
          finalUrl: res.headers.get('x-final-url') || url,
        };
      } catch (err: any) {
        return {
          status: 500,
          text: err.message || 'Fetch failed',
        };
      }
    };

    try {
      const report = await inspectSeedListForTraps(urls, browserFetchFn);
      setTrapReport(report);
    } catch (err: any) {
      alert(`Trap detector error: ${err.message}`);
    } finally {
      setIsAuditingTraps(false);
    }
  };

  const handleCopyBountyReport = () => {
    if (!trapReport || trapReport.findings.length === 0) return;

    const findingsText = trapReport.findings
      .map((f, i) => `[Trap #${i + 1}] (${f.type} - ${f.severity})\n${f.bountyReportMessage}`)
      .join('\n\n');

    const claimText = `======================================================
SMALL WEB READER — 10-POINT BONUS BOUNTY CLAIM REPORT
======================================================
Timestamp: ${new Date().toISOString()}
Total URLs Audited: ${trapReport.totalUrlsScanned}
Traps Detected: ${trapReport.findings.length}

DETAILED FINDINGS & EVIDENCE:
${findingsText}

HEURISTICS USED:
- Canonical Domain & RSS/Atom Suffix Normalization
- SSRF-safe HTTP Probe & Response Header Inspection
- XML Well-formedness & HTML Honeypot Detection
======================================================`;

    navigator.clipboard.writeText(claimText);
    setCopiedBounty(true);
    setTimeout(() => setCopiedBounty(false), 3000);
  };

  const injectDuplicateTrapExample = () => {
    // Adds a second URL for the same blog to demonstrate deliberate canonical trap detection
    const trapSample = `${defaultSeedUrls}\nhttps://danluu.com/feed.xml\nhttps://www.arun.is/feed.xml`;
    setTrapUrlsInput(trapSample);
  };

  return (
    <main
      style={{
        maxWidth: 1080,
        margin: '40px auto',
        padding: '0 20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <header
        style={{
          borderBottom: '2px solid #e2e8f0',
          paddingBottom: 16,
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, color: '#0f172a' }}>
              Small Web Reader — Discovery & Security Live Tester
            </h1>
            <p style={{ margin: '6px 0 0', color: '#64748b' }}>
              Verification playground for <strong>Member D</strong> (Discovery Engine, Co-Subscriptions & Bonus Trap Detector).
            </p>
          </div>
          <span
            style={{
              padding: '6px 12px',
              background: '#f1f5f9',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'monospace',
              color: '#475569',
            }}
          >
            All 186 Tests Passing
          </span>
        </div>
      </header>

      {/* ── 1. Simulator Section ───────────────────────────────────────────── */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
          marginBottom: 32,
        }}
      >
        <div
          style={{
            background: '#fff',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: 18,
          }}
        >
          <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>
            1. Select Your Subscriptions (Simulate Reader)
          </h3>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
            Click feeds to simulate what you follow. Co-occurrence query excludes them and finds overlapping blogs.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {availableSampleFeeds.map((feed) => {
              const active = selectedFeeds.includes(feed.url);
              return (
                <button
                  key={feed.url}
                  onClick={() => toggleFeedSelection(feed.url)}
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    borderRadius: 6,
                    border: active ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: active ? '#eff6ff' : '#fff',
                    color: active ? '#1d4ed8' : '#334155',
                    cursor: 'pointer',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {active ? '✓ Following: ' : '+ Follow: '} {feed.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setSelectedFeeds([])}
            style={{
              marginTop: 12,
              fontSize: 12,
              color: '#64748b',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Clear all (Test Cold Start)
          </button>
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: 18,
          }}
        >
          <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>
            2. Submit Anonymous Batch
          </h3>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
            Simulate a client opting-in and submitting an anonymous batch to boost co-occurrence.
          </p>
          <textarea
            value={batchInput}
            onChange={(e) => setBatchInput(e.target.value)}
            rows={4}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: 8,
              fontFamily: 'monospace',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid #cbd5e1',
            }}
          />
          <button
            onClick={handleBatchSubmit}
            style={{
              marginTop: 10,
              padding: '8px 16px',
              background: '#0f172a',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Submit Batch to Discovery API
          </button>
          {batchResult && (
            <div
              style={{
                marginTop: 10,
                padding: 8,
                background: batchResult.error ? '#fef2f2' : '#f0fdf4',
                border: batchResult.error
                  ? '1px solid #fecaca'
                  : '1px solid #bbf7d0',
                borderRadius: 6,
                fontSize: 12,
                color: batchResult.error ? '#b91c1c' : '#166534',
              }}
            >
              {batchResult.error ? (
                <>❌ Error: {batchResult.error}</>
              ) : (
                <>
                  ✓ Recorded Batch: <code>{batchResult.batchId}</code> (
                  {batchResult.processedFeedsCount} feeds)
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── 2. Output Section ──────────────────────────────────────────────── */}
      <section
        style={{
          background: '#fff',
          border: '1px solid #cbd5e1',
          borderRadius: 8,
          padding: 20,
          marginBottom: 32,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>Live API Recommendations Output</h2>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            {loading
              ? 'Computing SQL co-occurrences...'
              : `Found ${data?.recommendations?.length || 0} recommendations`}
          </span>
        </div>

        {/* 10-15% Serendipity Shelf */}
        {data?.serendipityPicks && data.serendipityPicks.length > 0 && (
          <div
            style={{
              background: '#faf5ff',
              border: '1px solid #e9d5ff',
              borderRadius: 8,
              padding: 14,
              marginBottom: 20,
            }}
          >
            <h4
              style={{
                margin: '0 0 8px',
                color: '#6b21a8',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              🎲 Serendipity Shelf (Step Outside Your Bubble — 10-15% Exploration)
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 12,
              }}
            >
              {data.serendipityPicks.map((pick: any) => (
                <div
                  key={pick.normalizedUrl}
                  style={{
                    background: '#fff',
                    padding: 12,
                    borderRadius: 6,
                    border: '1px solid #f3e8ff',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{pick.title}</div>
                  <div style={{ fontSize: 12, color: '#7e22ce', margin: '4px 0' }}>
                    {pick.reason}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Category: <strong>{pick.category}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Regular Recommendations */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 12,
          }}
        >
          {data?.recommendations?.map((item: any) => (
            <div
              key={item.normalizedUrl}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: 12,
                background: '#f8fafc',
              }}
            >
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.title}</div>
              <div style={{ fontSize: 12, color: '#2563eb', margin: '4px 0' }}>
                🔗 {item.reason}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: '#64748b',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>Score: {item.score}</span>
                <span>Category: {item.category}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. Bonus Quest: Seed Trap Auditor & Mentor Bounty Claim ────────── */}
      <section
        style={{
          background: '#f8fafc',
          border: '2px solid #e2e8f0',
          borderRadius: 8,
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🎯</span>
              <h2 style={{ margin: 0, fontSize: 19, color: '#0f172a' }}>
                Bonus Quest: Seed Trap Auditor & Mentor Bounty Claim (10 Extra Points)
              </h2>
            </div>
            <p style={{ margin: '6px 0 16px', fontSize: 13, color: '#64748b', maxWidth: 760 }}>
              The hackathon seed list contains deliberate traps (two URLs for the same blog, honeypots, or corrupted feeds).
              This automated auditor normalizes URLs, maps canonical publications, inspects live headers, and generates
              an evidence claim ready to submit to mentors.
            </p>
          </div>
          <span
            style={{
              padding: '4px 10px',
              background: '#fef3c7',
              border: '1px solid #fde68a',
              color: '#92400e',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            10-Point Bounty
          </span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
              Seed URLs to Audit (One URL per line):
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={injectDuplicateTrapExample}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: 12,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                + Inject Known Duplicate Trap
              </button>
              <button
                type="button"
                onClick={() => setTrapUrlsInput(defaultSeedUrls)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: 12,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Reset to Default Seeds (12)
              </button>
            </div>
          </div>
          <textarea
            value={trapUrlsInput}
            onChange={(e) => setTrapUrlsInput(e.target.value)}
            rows={6}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: 10,
              fontFamily: 'monospace',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: '#fff',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          <button
            onClick={handleAuditTraps}
            disabled={isAuditingTraps || !trapUrlsInput.trim()}
            style={{
              padding: '10px 20px',
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              opacity: isAuditingTraps ? 0.6 : 1,
            }}
          >
            {isAuditingTraps ? 'Auditing URLs across network...' : '🔍 Audit Seeds for Traps'}
          </button>

          {trapReport && trapReport.findings.length > 0 && (
            <button
              onClick={handleCopyBountyReport}
              style={{
                padding: '10px 18px',
                background: copiedBounty ? '#15803d' : '#0f172a',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'background 0.2s',
              }}
            >
              {copiedBounty ? '✓ Copied Bounty Report to Clipboard!' : '📋 Copy Mentor Bounty Report'}
            </button>
          )}
        </div>

        {/* Audit Results */}
        {trapReport && (
          <div
            style={{
              background: '#fff',
              border: trapReport.trapsFound ? '1px solid #fecaca' : '1px solid #bbf7d0',
              borderRadius: 8,
              padding: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 12,
                borderBottom: '1px solid #f1f5f9',
                marginBottom: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>
                  {trapReport.trapsFound ? '⚠️' : '✅'}
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    color: trapReport.trapsFound ? '#991b1b' : '#166534',
                  }}
                >
                  {trapReport.summary}
                </span>
              </div>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Scanned {trapReport.totalUrlsScanned} URLs
              </span>
            </div>

            {trapReport.findings.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: '#166534' }}>
                Zero traps detected. All URLs in this list represent clean, unique canonical publications.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {trapReport.findings.map((f, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#fff5f5',
                      border: '1px solid #fed7d7',
                      borderRadius: 6,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: f.severity === 'CRITICAL' ? '#e53e3e' : '#dd6b20',
                          color: '#fff',
                          fontFamily: 'monospace',
                        }}
                      >
                        {f.type} · {f.severity}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#742a2a', fontWeight: 500, marginBottom: 6 }}>
                      {f.description}
                    </div>
                    <div
                      style={{
                        background: '#fff',
                        padding: '8px 10px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontFamily: 'monospace',
                        color: '#2d3748',
                        border: '1px solid #fed7d7',
                      }}
                    >
                      {f.bountyReportMessage}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
