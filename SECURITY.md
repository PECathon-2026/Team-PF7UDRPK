# Small Web Reader — Member C: Security Architecture & Threat Model

## 1. Components Implemented

| Module | Path | Purpose |
|---|---|---|
| SSRF Guard | `src/lib/server/ssrf-guard.ts` | URL validation, IP classification, DNS resolution |
| Fetch Proxy | `src/app/api/fetch/route.ts` | `GET /api/fetch` endpoint |
| PoW Engine | `src/lib/server/pow.ts` | Challenge generation & verification |
| Rate Limiter | `src/lib/server/rate-limiter.ts` | Salted IP rate limiting |
| Security Helpers | `src/lib/server/security-helpers.ts` | Member D integration |
| PoW Challenge API | `src/app/api/pow/challenge/route.ts` | `GET /api/pow/challenge` endpoint |

---

## 2. SSRF Defense

### URL Validation (`validateUrl`)
- Accepts only `http:` and `https:` schemes; rejects `file:`, `ftp:`, `javascript:`, `data:`, etc.
- Rejects embedded credentials (`user:pass@host`).
- Rejects empty hostnames.
- Rejects IPv6 zone identifiers (`%25`, bare `%`).
- Blocks cloud-metadata hostnames by name: `169.254.169.254`, `metadata.google.internal`, etc.

### IPv4 / IPv6 Address Classification (`isAddressForbidden`)
Uses `ipaddr.js` to classify every resolved address. Forbidden ranges include:

**IPv4:**
- `127.0.0.0/8` — loopback
- `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` — private networks
- `169.254.0.0/16` — link-local (includes AWS IMDS `169.254.169.254`)
- `100.64.0.0/10` — carrier-grade NAT (RFC 6598)
- `0.0.0.0/8` — unspecified
- `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` — documentation
- `224.0.0.0/4` — multicast
- `240.0.0.0/4`, `255.255.255.255` — reserved / broadcast

**IPv6:**
- `::1/128` — loopback
- `::/128` — unspecified
- `fe80::/10` — link-local
- `fc00::/7` — unique-local (ULA)
- `::ffff:0:0/96` — IPv4-mapped (unwrapped and re-checked as IPv4)
- `2001:db8::/32` — documentation
- `ff00::/8` — multicast

### DNS Resolution (`resolveAndValidate`)
- Uses `dns.promises.lookup(hostname, { all: true })` to resolve all A/AAAA records.
- Validates **every** resolved address — **fail-closed** (any forbidden IP rejects the entire hostname).
- IP literals bypass DNS and are checked directly.
- IPv4-mapped IPv6 addresses are unwrapped before classification.

### Redirect Handling
- Automatic redirects are **disabled** (`redirect: 'manual'`).
- Each redirect is followed manually with full URL + DNS re-validation.
- Maximum **3 redirect hops** enforced.
- Relative `Location` headers are resolved against the current request URL.

### Resource Limits
- **8-second timeout** via `AbortController`.
- **5 MB response cap** enforced during streaming read.
- Content-Type **allow-list**: HTML, XML, RSS, Atom, plain text only.
- No upstream cookies, authorization, or internal headers forwarded.
- No content stored on server (pure passthrough).

---

## 3. Proof of Work

### Protocol (Hashcash / SHA-256)
1. Client calls `GET /api/pow/challenge` → receives `{ id, challenge, difficulty, expiresAt }`.
2. Client brute-forces nonce such that `SHA-256(challenge + nonce)` starts with `"0".repeat(difficulty)`.
3. Client submits nonce alongside their discovery submission.
4. Server calls `verifyPoWChallenge(challengeId, nonce)`.

### Configuration
| Parameter | Default | Env Var |
|---|---|---|
| Difficulty (leading zeros) | `4` | `POW_DIFFICULTY` |
| Challenge TTL | `5 minutes` | `POW_CHALLENGE_TTL_SECONDS` |

Difficulty 4 ≈ 65,536 average SHA-256 attempts. This creates ~0.2s of CPU work in a browser while making bulk automation ~65k× more expensive.

### Security Properties
- Challenge values: 32 cryptographically random bytes (unpredictable).
- Challenge IDs: UUID v4 (unpredictable, unique).
- **Replay protection**: Challenge is marked `consumed = true` after first valid use. Subsequent attempts with the same `challengeId` are rejected with `CHALLENGE_CONSUMED`.
- **Expiry**: Challenges older than TTL are rejected and evicted.
- **Input bounds**: `challengeId` ≤ 64 chars, `nonce` ≤ 256 chars — prevents hash-DoS.
- **Store eviction**: Oldest entries removed when store reaches 50,000 entries.

---

## 4. Privacy-Preserving Rate Limiter

### Privacy Design
- Raw IP addresses are **never stored, logged, or persisted**.
- Each IP is immediately hashed: `SHA-256(ip + ":" + salt)`.
- Only the hex hash is used as a Map key.
- Salt rotates every **1 hour** using `crypto.randomUUID()`.
- On rotation, the store is **cleared** → old hashes are cryptographically unlinkable.

### Rate-Limit Policy
- **Limit**: 10 requests per hour per salted IP hash.
- **Window**: Fixed, aligned to salt generation time.
- **Exceeded**: HTTP `429 Too Many Requests`.

### IP Source
- Extracted from `X-Forwarded-For` header (first value).
- Validated as a parseable IP via `ipaddr.js`.
- Falls back to sentinel `UNKNOWN` if absent or invalid.

---

## 5. Threat Model

### Assets
- Internal network services (VPC, containers, databases)
- Cloud metadata services (AWS IMDS, GCP metadata, Azure IMDS)
- Server process resources (CPU, memory, file descriptors)
- User privacy (IP addresses, submission patterns)
- Discovery service data integrity

### Trust Boundaries
- Internet (untrusted) → `/api/fetch` and `/api/discovery/submit`
- Server process → internal DNS, Node.js `fetch` implementation
- Environment → `process.env` secrets (not exposed to clients)

### Threat Model Table

| Threat | Attack Vector | Control | Residual Risk |
|---|---|---|---|
| **SSRF — internal services** | `?url=http://10.0.0.1/` | DNS resolution + IP range check via ipaddr.js | DNS rebinding TOCTOU window (see below) |
| **SSRF — DNS rebinding** | Hostname resolves to public IP at validation, then switches to private IP at connection time | DNS validated before fetch; Node.js DNS cache provides partial protection | **Unresolved**: True connection pinning requires custom TCP stack. Window is narrow but real. Recommend deploying behind a network-level SSRF filter (e.g., AWS VPC security groups, GCP VPC Service Controls). |
| **SSRF — redirect-based** | Redirect from allowed host to `http://169.254.169.254/` | Manual redirect following with full re-validation per hop | Redirect loop detection limited to 3 hops |
| **Cloud metadata access** | Direct `?url=http://169.254.169.254/` | Blocked by hostname name list AND IP range check | SSRF via DNS rebinding (see above) |
| **DoS — oversized response** | Upstream returns multi-GB body | 5 MB cap enforced during streaming; read aborted | None — cap is hard-enforced |
| **DoS — slow response (Slowloris)** | Upstream drips bytes slowly | 8-second `AbortController` timeout | None — timeout is hard-enforced |
| **Automated discovery submissions** | Bot floods `/api/discovery/submit` | PoW (difficulty 4, ~65k hashes) + rate limit (10/hr/IP) | Distributed botnets with residential IPs solving PoW — accepted tradeoff |
| **PoW replay** | Submit same valid nonce twice | `consumed` flag set on first use; rejected on second | Multi-instance: replay possible across different server instances (see deployment note) |
| **IP spoofing / rate-limit bypass** | Spoof `X-Forwarded-For: <different_ip>` per request | IP is hashed (not stored), but spoofing still bypasses per-IP limit | **Partially mitigated**: Effective only when app runs behind a trusted proxy that validates the header. Without a trusted proxy, limit is bypassable. |
| **Privacy — IP in logs** | Attacker reads server logs for raw IPs | Raw IP never stored or logged; only salted hash used | Log libraries outside this module may capture request IPs — ensure log configuration excludes them |
| **Privacy — hash linkability** | Correlate hashes across requests before salt rotation | Salt rotates hourly; hashes from different hours are unlinkable | Within a 1-hour window, same IP produces same hash → correlation is possible within that window |
| **Multi-instance rate-limit bypass** | Route requests to different server instances | In-memory store is per-process | **Unresolved for multi-instance**: Effective limit is `10 × number_of_instances`. Upgrade path: use a shared Redis store with atomic increments. |
| **Content injection via proxied response** | Upstream serves malicious HTML | Content-Type allow-listed; `X-Content-Type-Options: nosniff` set; `Cache-Control: no-store` | Content sanitization is Member B's responsibility (DOMPurify); proxy is a passthrough |
| **Scheme confusion** | `file://`, `ftp://`, `javascript:` URLs | Strict allow-list: only `http:` and `https:` | None |
| **IPv6 zone ID confusion** | `http://[fe80::1%25eth0]/` | Rejected at URL validation stage | None |
| **IPv4-mapped IPv6 bypass** | `::ffff:192.168.1.1` bypasses IPv4 checks | IPv4-mapped addresses unwrapped before classification | None |

### Accepted Risks
1. **Distributed low-rate botnet PoW solving**: Bots with many residential IPs can each solve 10 PoW challenges/hour. Accepted tradeoff for zero-account anonymous service.
2. **DNS rebinding TOCTOU**: Narrow window between validation and connection. Partially mitigated by Node.js DNS TTL cache. Full mitigation requires network-level controls.
3. **Multi-instance rate-limit inconsistency**: In-memory store is per-process. Accepted for single-instance hackathon deployment.
4. **Salt rotation window resets**: An IP that used 9/10 slots gets 10 fresh slots after rotation. Privacy takes priority.

---

## 6. Member D Integration Guide

### How to integrate in `POST /api/discovery/submit`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { validateSubmissionIntegrity } from '@/lib/server/security-helpers';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { powSolution, feeds } = body as {
    powSolution: { challengeId: string; nonce: string };
    feeds: string[];
  };

  // Run all security checks (rate limit + PoW)
  const security = await validateSubmissionIntegrity(req, powSolution);
  if (!security.ok) {
    return NextResponse.json(
      { error: security.message },
      { status: security.httpStatus }
    );
  }

  // ✅ Security passed — proceed with discovery logic
  // ... Member D's submission processing ...
}
```

### Client workflow:
```typescript
// 1. Get a PoW challenge
const ch = await fetch('/api/pow/challenge').then(r => r.json());
// ch = { id, challenge, difficulty, expiresAt }

// 2. Solve (runs in browser / Web Worker)
const nonce = await solvePoW(ch.challenge, ch.difficulty);

// 3. Submit with PoW solution
await fetch('/api/discovery/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    powSolution: { challengeId: ch.id, nonce },
    feeds: ['https://danluu.com/atom.xml', ...]
  })
});
```

---

## 7. Commands

```bash
# Install dependencies
npm install

# Run all security tests
npm test

# Run tests with coverage
npm run test:coverage

# Type-check (no emit)
npm run type-check

# Lint
npm run lint

# Development server
npm run dev

# Production build
npm run build
```

---

## 8. Files Created (Member C only)

| File | Type | Description |
|---|---|---|
| `src/lib/server/ssrf-guard.ts` | Library | URL validation, IP classification, DNS guard |
| `src/app/api/fetch/route.ts` | API Route | Secure fetch proxy endpoint |
| `src/lib/server/pow.ts` | Library | PoW challenge engine |
| `src/lib/server/rate-limiter.ts` | Library | Salted IP rate limiter |
| `src/lib/server/security-helpers.ts` | Library | Member D integration helper |
| `src/app/api/pow/challenge/route.ts` | API Route | PoW challenge issuance endpoint |
| `src/__tests__/ssrf-guard.test.ts` | Tests | SSRF guard unit tests |
| `src/__tests__/pow.test.ts` | Tests | PoW engine unit tests |
| `src/__tests__/rate-limiter.test.ts` | Tests | Rate limiter unit tests |
| `src/__tests__/security-helpers.test.ts` | Tests | Integration helper tests |
| `package.json` | Config | Dependencies |
| `tsconfig.json` | Config | TypeScript (strict) |
| `next.config.ts` | Config | Next.js configuration |
| `vitest.config.ts` | Config | Test runner configuration |
| `.env.example` | Docs | Environment variables template |
| `.gitignore` | Config | Git ignore rules |
| `tailwind.config.js` | Config | Tailwind CSS |
| `postcss.config.js` | Config | PostCSS |
| `src/app/layout.tsx` | Scaffold | Root layout (placeholder for Member A) |
| `src/app/page.tsx` | Scaffold | Root page (placeholder for Member A) |
| `src/app/globals.css` | Scaffold | Global styles |
| `SECURITY.md` (this file) | Docs | Threat model & implementation docs |

