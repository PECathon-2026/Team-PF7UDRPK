# Small Web Reader — Anonymous Discovery for Independent Blogs

> A distraction-free, privacy-preserving, offline-first RSS/Atom reader and serendipitous discovery engine for the independent open web.

[![Next.js](https://img.shields.io/badge/Next.js-15.1.12-black?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0.0-20232A?style=flat&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4.17-38bdf8?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.39.3-1a1a1a?style=flat&labelColor=1a1a1a&color=C5F74F)](https://orm.drizzle.team/)
[![Vitest](https://img.shields.io/badge/Vitest-182_Tests_Passing-6E9F18?style=flat&logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat)](https://opensource.org/licenses/MIT)

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Setup Instructions](#2-setup-instructions)
3. [Privacy & Threat Model](#3-privacy--threat-model)
4. [Demo & Verification Guide](#4-demo--verification-guide)
5. [Bonus: Seed Trap Detector](#5-bonus-seed-trap-detector)
6. [Tech Stack](#6-tech-stack)

---

## 1. Architecture Overview

Small Web Reader enforces an **inversion of control**: user identity, subscriptions, article content, reading state, and semantic topic modeling remain exclusively on the client machine. The server acts purely as a stateless, SSRF-safe proxy and a zero-knowledge co-subscription graph calculator.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT BROWSER                                    │
│                                                                                  │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │                         React 19 Presentation Pane                       │   │
│   │    • 3-Pane Responsive Layout (Sidebar, Timeline, Distraction-Free Reader)│   │
│   │    • Typography Engine (Sans/Serif, 4 Font Sizes, Line Height, Widths)   │   │
│   │    • Discover & Serendipity Shelf (Exploration outside primary bubble)    │   │
│   └────────────────────────────────────┬─────────────────────────────────────┘   │
│                                        │                                         │
│               ┌────────────────────────┼────────────────────────┐                │
│               ▼                        ▼                        ▼                │
│   ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐     │
│   │  Dexie.js IndexedDB  │ │  Web Worker Sandbox  │ │  Local TF-IDF Engine │     │
│   │  • feeds table       │ │  • fast-xml-parser   │ │  • Smoothed TF-IDF   │     │
│   │  • posts table       │ │  • @mozilla/         │ │  • Zero-knowledge    │     │
│   │  • articles table    │ │    readability       │ │    topic modeling    │     │
│   │  • sync metadata     │ │  • DOMPurify sanitier│ │  • 60 FPS off-thread │     │
│   └──────────────────────┘ └──────────────────────┘ └──────────────────────┘     │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ Secure HTTPS (CORS Proxy & Batch Sync)
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             NEXT.JS 15 SERVER                                    │
│                                                                                  │
│   ┌───────────────────────────────┐     ┌────────────────────────────────────┐   │
│   │     /api/fetch (SSRF Proxy)   │     │   /api/discovery/* (Graph API)     │   │
│   │  • Private IP & Loopback Block│     │  • /submit: Anonymous Batch Sync   │   │
│   │  • Cloud Metadata Guard       │     │  • /recommendations: Co-Occurrence │   │
│   │  • DNS Re-check on Redirects  │     │  • 10–15% Serendipity Shelf        │   │
│   │  • 10MB Body Limit / 8s Timer │     │  • Hashcash Proof-of-Work (PoW)    │   │
│   │  • ZERO caching / ZERO storage│     │  • Salted IP Sliding-Window Limiter│   │
│   └──────────────┬────────────────┘     └─────────────────┬──────────────────┘   │
└──────────────────┼────────────────────────────────────────┼──────────────────────┘
                   │                                        │
                   ▼                                        ▼
      ┌─────────────────────────┐              ┌────────────────────────┐
      │ Independent Web (Blogs) │              │  PostgreSQL (Supabase) │
      │   Atom & RSS Feed XML   │              │   • feeds              │
      │   Raw Article HTML      │              │   • anonymous_batches  │
      │                         │              │   • batch_feeds        │
      └─────────────────────────┘              │  (PGlite memory engine │
                                               │   auto-fallback)       │
                                               └────────────────────────┘
```

### Component Interaction Flow

1. **Feed Ingestion**: The user inputs a site URL (e.g. `danluu.com`). The client calls `/api/fetch?url=...`. The server validates DNS, ensures no private/cloud IPs, follows up to 3 redirects safely, and returns raw XML.
2. **Off-Thread Processing**: The raw XML passes into a dedicated Web Worker (`feed-worker.ts`). The worker runs `fast-xml-parser`, stores posts in Dexie IndexedDB, and runs smoothed TF-IDF keyword extraction.
3. **Reader Extraction**: When an article is selected, the client requests the raw HTML via `/api/fetch`, and the Web Worker extracts the readable content using `@mozilla/readability`, sanitizes it with `DOMPurify`, and rewrites all relative links/images to absolute URLs.
4. **Anonymous Co-Subscription Discovery**: If the user opts in, their browser normalizes their followed feed URLs into canonical keys (stripping protocols, query parameters, and feed extensions) and sends an anonymous batch to `/api/discovery/submit`.
5. **Serendipity Graph Calculation**: `/api/discovery/recommendations` calculates co-occurrence across batches:
   $$\text{Score}(F) = \text{Co-Subscribers}(F) \times \log(1 + \text{Subscribers}(F))$$
   The engine guarantees that **10–15%** of the surfaced recommendations belong to disjoint categories to break algorithmic filter bubbles.

---

## 2. Setup Instructions

### Prerequisites
- **Node.js**: v18.18.0 or newer (v20+ or v24 LTS recommended)
- **Package Manager**: `npm` or `pnpm`
- **Git**

### Local Installation

```bash
# 1. Clone the repository
git clone https://github.com/PECathon-2026/Team-PF7UDRPK.git
cd Team-PF7UDRPK

# 2. Install dependencies
npm install

# 3. Configure environment variables (optional — defaults to embedded PGlite)
cp .env.example .env.local
```

### Environment Variables

Create a `.env.local` file in the root directory:

```env
# PostgreSQL connection string (Supabase Transaction Pooler recommended)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"

# Optional: Disable PGlite in-memory fallback in development
FORCE_REMOTE_DB="false"
```

> **Zero-Config Database**: If `DATABASE_URL` is omitted, the application automatically boots an embedded, in-memory **PGlite (Postgres WASM)** instance with automated schema initialization.

### Running the App

```bash
# Start local development server
npm run dev

# Open in browser: http://localhost:3000
```

### Running Test Suite & Quality Checks

```bash
# Run all 182 Vitest unit and integration tests
npm test

# Run TypeScript typecheck
npm run typecheck

# Build for production
npm run build
```

---

## 3. Privacy & Threat Model

Small Web Reader is designed around **Verifiable Zero-Knowledge Discovery**. 

### What the Server Stores vs. What It NEVER Stores

| Data Entity | Server Database | Client IndexedDB | Privacy Guarantee |
|---|:---:|:---:|---|
| **User Identifiers / Accounts** | ❌ **NEVER** | ❌ **NEVER** | No accounts, emails, UUIDs, or cookies exist in the system. |
| **IP Addresses** | ❌ **NEVER** | ❌ **NEVER** | In-memory SHA-256 salted hashes are used solely for rate limiting and cleared every 60s. |
| **Reading History** | ❌ **NEVER** | ✅ Local Only | Which articles you open, read, star, or scroll remains exclusively on your device. |
| **Article Full Text** | ❌ **NEVER** | ✅ Local Only | The proxy streams raw HTML; it never logs or stores article content on disk or DB. |
| **Extracted Semantic Topics** | ❌ **NEVER** | ✅ Local Only | TF-IDF runs in browser memory; topic vectors never leave the client. |
| **Anonymous Feed Subscriptions** | ✅ Canonical URLs only | ✅ Full Feed Objects | Submitted anonymously in unlinked batches; stored with a 90-day rolling TTL. |

### How Opt-in Works
- **Zero-Sharing Default**: By default, the application runs in purely isolated offline mode. No subscriptions or signals are sent to the discovery API.
- **Explicit Contribution**: In the **Discover** tab, the user can toggle *"Contribute Anonymous Overlap"*. When enabled, the browser submits only canonical feed URL keys in an anonymous batch without session tokens, cookies, or client fingerprints.
- **Local Unsubscribe**: Unsubscribing from a feed instantly removes the feed, all its posts, and all cached reader articles from local IndexedDB.

### Abuse & Security Protections

#### 1. Multi-Layer SSRF Defense (`ssrf-guard.ts`)
The `/api/fetch` CORS proxy executes strict security checks before any HTTP request:
- **Disallowed Schemes**: Enforces `http:` or `https:`. Rejects `ftp:`, `file:`, `data:`, `javascript:`, or triple-slash bypasses (`https:///path`).
- **Loopback & Private Network Blocking**: Resolves hostnames against system DNS and validates every returned IP using `ipaddr.js`. Blocks RFC-1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), RFC-3927 link-local/cloud metadata (`169.254.169.254`), loopback (`127.0.0.0/8`), and IPv6 equivalents (`::1`, `fc00::/7`, `fe80::/10`).
- **DNS Re-Validation on Redirects**: Follows redirects safely up to 3 hops, re-validating the target URL at DNS resolution on every hop to prevent TOCTOU DNS-rebinding attacks.
- **Resource Constraints**: Strict **8-second timeout** and **10 MB response payload ceiling** to block decompression bombs and memory exhaustion.

#### 2. Hashcash Proof-of-Work (`pow.ts`)
- To prevent bot floods and Sybil batch injection, `/api/discovery/submit` requires clients to solve a cryptographic Hashcash puzzle:
  $$\text{SHA-256}(\text{challenge} + \text{nonce}) < 2^{256 - \text{difficulty}}$$
- Challenges expire within 5 minutes and include single-use replay protection.

#### 3. Salted Sliding-Window Rate Limiting (`rate-limiter.ts`)
- Client IPs are hashed with a daily rotating salt: $\text{SHA-256}(\text{IP} + \text{SALT})$.
- Rate limits allow at most 30 requests per minute per salted bucket. Raw IPs are never written to disk or database.

---

## 4. Demo & Verification Guide

### Recommended Sample Sites to Test

| Site Name | Test URL | Category | What to Notice |
|---|---|:---:|---|
| **Dan Luu** | `https://danluu.com` | Systems | Autodiscovers Atom XML, handles ~6.6MB uncompressed feed, renders technical essays with relative images resolved. |
| **Simon Willison** | `https://simonwillison.net` | Web / AI | Fast sync, clean author bylines, extracts tags like `ai`, `python`, `sqlite`. |
| **Xe Iaso** | `https://xeiaso.net` | Tech / Culture | Subscribed topics extracted via client-side TF-IDF, distraction-free typography. |
| **Robin Sloan** | `https://www.robinsloan.com` | Essays / Design | Demonstrates cross-category Serendipity Shelf matching. |
| **Bunnie Studios** | `https://www.bunniestudios.com` | Hardware | Hardware hacking blog; tests RSS 2.0 channel parsing. |

---

### Edge Cases Handled

#### 1. Autodiscovery on Plain Website (No `/feed` in URL)
- **Input**: Enter `https://danluu.com` in "+ Add Feed".
- **Expected Outcome**: Autodiscovery scans the HTML `<head>`, finds `<link rel="alternate" type="application/atom+xml" href="/atom.xml">`, resolves the absolute URL, and subscribes.

#### 2. Non-Feed HTML Page
- **Input**: Enter `https://github.com`.
- **Expected Outcome**: Autodiscovery checks `<link rel="alternate">` and probe suffixes (`/feed`, `/rss.xml`, `/atom.xml`), cleanly fails without crashing, and informs the user: *"Could not discover an RSS or Atom feed for this URL."*

#### 3. Non-Existent Domain / Dead Feed
- **Input**: Enter `https://thisdomaindoesnotexist123456.org/feed.xml`.
- **Expected Outcome**: Server catches DNS resolution failure (`ENOTFOUND`), returns a standard `400 Bad Request`, and the UI displays a clean error banner without freezing.

#### 4. SSRF & Intranet Protection
- **Input**: Enter `http://127.0.0.1:3000` or `http://169.254.169.254/latest/meta-data/`.
- **Expected Outcome**: Proxy blocks access immediately with `403 Forbidden` (`BLOCKED_IP_RANGE: Destination IP is in a reserved/private subnet`).

#### 5. Relative Images & Link Resolution
- **Scenario**: Blogs that write images as `<img src="/images/diagram.png">`.
- **Expected Outcome**: Readability pre-injects `<base href="...">` and rewrites all `src` and `href` attributes to the canonical domain (`https://danluu.com/images/diagram.png`). Images load cleanly without 404s.

#### 6. True Offline Mode
- **Scenario**: Add feeds while online. Open Chrome DevTools → Network → set to **"Offline"**.
- **Expected Outcome**: You can freely navigate feeds, open cached articles, toggle starred items, change font sizes, and search. Data is served directly from Dexie IndexedDB.

---

## 5. Bonus: Seed Trap Detector

The project includes an automated **Seed Trap Detector** (`src/lib/discovery/trap-detector.ts`) built for the 10-point bonus bounty.

```bash
# Run the Seed Trap Detector CLI with sample URLs
npm run trap-detector https://danluu.com/atom.xml https://danluu.com/feed.xml https://xeiaso.net/blog.rss
```

### Detection Heuristics:
1. **Canonical Domain Redundancy**: Identifies different URL variants pointing to the same underlying blog publication (e.g. `danluu.com/atom.xml` vs `danluu.com/feed.xml`).
2. **Redirect Loop Trapping**: Traps HTTP 301/302 redirects where an RSS endpoint redirects to another feed in the list.
3. **Invalid Feed Payloads**: Detects non-XML feeds, HTML honeypots, and corrupted feeds before they enter the discovery graph.

---

## 6. Tech Stack

- **Framework**: [Next.js 15.1.12](https://nextjs.org/) (App Router, Server Functions)
- **Frontend**: [React 19](https://react.dev/), [Tailwind CSS 3.4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/)
- **Local Persistence**: [Dexie.js 4](https://dexie.org/) (IndexedDB wrapper)
- **Content Sanitization**: [DOMPurify 3](https://github.com/cure53/DOMPurify), [@mozilla/readability](https://github.com/mozilla/readability)
- **Feed Parser**: [fast-xml-parser 5](https://github.com/NaturalIntelligence/fast-xml-parser)
- **Database & ORM**: [PostgreSQL (Supabase)](https://supabase.com/), [@electric-sql/pglite](https://pglite.dev/), [Drizzle ORM 0.39](https://orm.drizzle.team/)
- **Network & Security**: [ipaddr.js 2](https://github.com/whitequark/ipaddr.js), Web Crypto SHA-256
- **Test Runner**: [Vitest 3.0](https://vitest.dev/) (182 tests)

