import React from 'react';

/**
 * Main Application Shell
 * Reserved for Member A (Frontend UI/UX & Reader Experience Lead)
 * to implement the Three-Pane Responsive Reader Layout:
 * - Left: Subscriptions Sidebar (<Sidebar />)
 * - Center: Chronological Timeline (<Timeline />)
 * - Right: Distraction-Free Article Reader (<ReaderView />)
 */
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800 p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center space-y-4">
        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
          📡
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Small Web Reader
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          The base repository and <strong>Discovery Engine (Member D)</strong> & <strong>Security/Proxy (Member C)</strong> are fully operational.
          This root view is ready for <strong>Member A</strong> to build the 3-pane timeline interface.
        </p>
        <div className="pt-2 border-t border-slate-100">
          <a
            href="/debug/discovery"
            className="inline-flex items-center text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
          >
            Launch Member D Discovery Engine Tester →
          </a>
        </div>
      </div>
    </main>
  );
}
