/**
 * src/app/api/pow/challenge/route.ts
 * ─────────────────────────────────────────────────────────────────
 * Issues a new Proof-of-Work challenge.
 * Called by the client before submitting to /api/discovery/submit.
 *
 * GET /api/pow/challenge
 *   200  { id, challenge, difficulty, expiresAt }
 *
 * No authentication required — anyone can request a challenge.
 * The rate limiter on /api/discovery/submit is the abuse backstop.
 * ─────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateChallenge } from '@/lib/server/pow';
import { buildCorsHeaders } from '@/app/api/fetch/route';

export function OPTIONS(req: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(req.headers.get('origin')),
  });
}

export function GET(req: NextRequest): NextResponse {
  const origin = req.headers.get('origin');
  const challenge = generateChallenge();
  return NextResponse.json(challenge, {
    status: 200,
    headers: {
      ...buildCorsHeaders(origin),
      'Cache-Control': 'no-store',
    },
  });
}

