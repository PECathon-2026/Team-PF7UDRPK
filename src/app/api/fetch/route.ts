import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/fetch?url=<encoded>
 *
 * CORS proxy stub — Member B scaffold.
 * Member C will add DNS resolution + SSRF IP blocklist validation.
 *
 * Current implementation:
 *  ✅ URL validation (must be http/https)
 *  ✅ 8-second abort timeout
 *  ✅ Raw text pass-through (no parsing, no storage)
 *  ✅ Correct Content-Type forwarding
 *  ⏳ TODO (Member C): Add dns.promises.lookup + ipaddr.js SSRF guard
 */
export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'Invalid protocol — only http and https are allowed' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  // ── TODO (Member C): Insert SSRF guard here ───────────────────────────────
  // import dns from 'dns/promises';
  // import ipaddr from 'ipaddr.js';
  // const addresses = await dns.lookup(parsed.hostname, { all: true });
  // for (const record of addresses) {
  //   const addr = ipaddr.parse(record.address);
  //   if (['loopback', 'private', 'linkLocal', ...].includes(addr.range())) {
  //     return NextResponse.json({ error: 'Access to private IP ranges is forbidden' }, { status: 403 });
  //   }
  // }
  // ── End SSRF guard placeholder ────────────────────────────────────────────

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SmallWebReader/1.0 (+https://smallweb-reader.vercel.app; RSS discovery bot)',
        Accept: 'application/rss+xml, application/atom+xml, text/xml, application/xml, text/html, */*',
      },
    });
    clearTimeout(timeout);

    const text = await response.text();

    return new NextResponse(text, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') ?? 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        // Allow any origin (CORS) — this proxy is the entire point
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Proxy fetch failed: ${message}` }, { status: 502 });
  }
}

