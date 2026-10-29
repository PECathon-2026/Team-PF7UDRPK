/**
 * Fetches any URL through Member C's SSRF-safe CORS proxy.
 * The proxy lives at: GET /api/fetch?url=<encoded>
 *
 * Member C's implementation at src/app/api/fetch/route.ts handles:
 *  - DNS resolution + SSRF IP blocklist (RFC 1918, loopback, metadata endpoints)
 *  - 8-second timeout
 *  - Raw text pass-through (no parsing/storage on the server)
 */
export async function safeFetchThroughProxy(targetUrl: string): Promise<string> {
  const res = await fetch(`/api/fetch?url=${encodeURIComponent(targetUrl)}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error ?? `Proxy error (${res.status})`,
    );
  }
  return res.text();
}

