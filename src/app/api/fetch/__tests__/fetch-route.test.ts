import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

describe('/api/fetch CORS proxy route handler', () => {
  it('returns 400 if url parameter is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/fetch');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing url parameter');
  });

  it('returns 400 for invalid protocols (e.g. ftp://)', async () => {
    const req = new NextRequest('http://localhost:3000/api/fetch?url=ftp://files.example.com');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid protocol');
  });

  it('returns 400 for completely invalid URL formats', async () => {
    const req = new NextRequest('http://localhost:3000/api/fetch?url=not_a_valid_url');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid URL format');
  });
});
