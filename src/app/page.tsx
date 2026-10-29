'use client';

import React, { useState, useEffect } from 'react';

export default function DiscoveryTesterPage() {
  const [selectedFeeds, setSelectedFeeds] = useState<string[]>([
    'https://danluu.com/atom.xml',
  ]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [batchInput, setBatchInput] = useState('https://danluu.com/atom.xml\nhttps://xeiaso.net/blog.rss');
  const [batchResult, setBatchResult] = useState<any>(null);

  const availableSampleFeeds = [
    { label: 'Dan Luu (Systems)', url: 'https://danluu.com/atom.xml' },
    { label: 'Simon Willison (Web/AI)', url: 'https://simonwillison.net/atom/entries/' },
    { label: 'Robin Sloan (Essays/Design)', url: 'https://www.robinsloan.com/feed.xml' },
    { label: 'Bunnie Studios (Hardware)', url: 'https://www.bunniestudios.com/blog/?feed=rss2' },
  ];

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const query = selectedFeeds.length > 0 ? `?feeds=${encodeURIComponent(selectedFeeds.join(','))}` : '';
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
    const urls = batchInput.split('\n').map((u) => u.trim()).filter(Boolean);
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

  return (
    <main style={{ maxWidth: 1000, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 26, color: '#0f172a' }}>Small Web Reader — Discovery Engine Live Tester</h1>
        <p style={{ margin: '6px 0 0', color: '#64748b' }}>
          Interactive verification playground for <strong>Member D</strong> (Anonymous Co-Subscriptions & 10–15% Serendipity).
        </p>
      </header>

      {/* Simulator Section */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 18 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>1. Select Your Subscriptions (Simulate Reader)</h3>
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
            style={{ marginTop: 12, fontSize: 12, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Clear all (Test Cold Start)
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 18 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>2. Submit Anonymous Batch</h3>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
            Simulate a client opting-in and submitting an anonymous batch to boost co-occurrence.
          </p>
          <textarea
            value={batchInput}
            onChange={(e) => setBatchInput(e.target.value)}
            rows={4}
            style={{ width: '100%', boxSizing: 'border-box', padding: 8, fontFamily: 'monospace', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1' }}
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
                border: batchResult.error ? '1px solid #fecaca' : '1px solid #bbf7d0',
                borderRadius: 6,
                fontSize: 12,
                color: batchResult.error ? '#b91c1c' : '#166534',
              }}
            >
              {batchResult.error ? (
                <>❌ Error: {batchResult.error}</>
              ) : (
                <>✓ Recorded Batch: <code>{batchResult.batchId}</code> ({batchResult.processedFeedsCount} feeds)</>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Output Section */}
      <section style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Live API Recommendations Output</h2>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            {loading ? 'Computing SQL co-occurrences...' : `Found ${data?.recommendations?.length || 0} recommendations`}
          </span>
        </div>

        {/* 10-15% Serendipity Shelf */}
        {data?.serendipityPicks && data.serendipityPicks.length > 0 && (
          <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: 14, marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 8px', color: '#6b21a8', display: 'flex', alignItems: 'center', gap: 6 }}>
              ✨ Serendipity Shelf (Step Outside Your Bubble - 10-15% Exploration)
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {data.serendipityPicks.map((pick: any) => (
                <div key={pick.normalizedUrl} style={{ background: '#fff', padding: 12, borderRadius: 6, border: '1px solid #f3e8ff' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{pick.title}</div>
                  <div style={{ fontSize: 12, color: '#7e22ce', margin: '4px 0' }}>{pick.reason}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Category: <strong>{pick.category}</strong></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Regular Recommendations */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {data?.recommendations?.map((item: any) => (
            <div key={item.normalizedUrl} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, background: '#f8fafc' }}>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.title}</div>
              <div style={{ fontSize: 12, color: '#2563eb', margin: '4px 0' }}>💡 {item.reason}</div>
              <div style={{ fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                <span>Score: {item.score}</span>
                <span>Category: {item.category}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

