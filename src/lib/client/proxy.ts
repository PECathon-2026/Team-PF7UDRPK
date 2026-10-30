/**
 * src/lib/client/proxy.ts
 * ─────────────────────────────────────────────────────────────────
 * Fetches any URL through Member C's SSRF-safe CORS proxy.
 * The proxy lives at: GET /api/fetch?url=<encoded>
 *
 * Handles:
 *  - DNS resolution + SSRF IP blocklist (RFC 1918, loopback, metadata endpoints)
 *  - ETag and Last-Modified conditional header pass-through
 *  - HTTP 304 (Not Modified) zero-body caching optimization
 *  - 15-second timeout and streaming size caps
 * ─────────────────────────────────────────────────────────────────
 */

export interface ProxyFetchOptions {
  etag?: string;
  lastModified?: string;
}

export interface ProxyFetchResult {
  text: string;
  status: number;
  etag?: string;
  lastModified?: string;
  isNotModified: boolean;
}

/**
 * Enhanced proxy fetch that forwards ETag and Last-Modified headers
 * and returns metadata for HTTP 304 conditional caching.
 */
export async function safeFetchWithMeta(
  targetUrl: string,
  options?: ProxyFetchOptions,
): Promise<ProxyFetchResult> {
  const headers: Record<string, string> = {};
  if (options?.etag) headers['If-None-Match'] = options.etag;
  if (options?.lastModified) headers['If-Modified-Since'] = options.lastModified;

  const res = await fetch(`/api/fetch?url=${encodeURIComponent(targetUrl)}`, {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });

  if (res.status === 304) {
    return {
      text: '',
      status: 304,
      etag: res.headers.get('etag') || options?.etag,
      lastModified: res.headers.get('last-modified') || options?.lastModified,
      isNotModified: true,
    };
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error ?? `Proxy error (${res.status})`,
    );
  }

  const text = await res.text();
  return {
    text,
    status: 200,
    etag: res.headers.get('etag') || undefined,
    lastModified: res.headers.get('last-modified') || undefined,
    isNotModified: false,
  };
}

/**
 * Standard proxy fetch returning raw response body text.
 */
export async function safeFetchThroughProxy(
  targetUrl: string,
  options?: ProxyFetchOptions,
): Promise<string> {
  const result = await safeFetchWithMeta(targetUrl, options);
  return result.text;
}
