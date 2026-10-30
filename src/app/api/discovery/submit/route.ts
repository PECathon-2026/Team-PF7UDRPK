import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { submitAnonymousBatch, seedInitialFeeds } from '@/lib/discovery/engine';
import { validateSubmissionIntegrity } from '@/lib/server/security-helpers';
import { checkRateLimitBySaltedIp, extractClientIp } from '@/lib/server/rate-limiter';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body || !Array.isArray(body.feeds) || body.feeds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid payload: "feeds" must be a non-empty array of URL strings' },
        { status: 400 }
      );
    }

    // ── Enforce Proof of Work & IP Rate-Limiting ────────────────────────────
    if (body.powSolution) {
      const security = await validateSubmissionIntegrity(req, body.powSolution);
      if (!security.ok) {
        return NextResponse.json(
          { error: security.message, code: security.code },
          { status: security.httpStatus }
        );
      }
    } else {
      // Enforce privacy-preserving salted IP rate limiting on all batch submissions
      const clientIp = extractClientIp(req);
      const isAllowed = checkRateLimitBySaltedIp(clientIp);
      if (!isAllowed) {
        return NextResponse.json(
          {
            error: 'Rate limit exceeded: maximum 10 submissions per hour per IP.',
            code: 'RATE_LIMITED',
          },
          { status: 429 }
        );
      }
    }

    const db = await getDb();
    await seedInitialFeeds(db);

    const result = await submitAnonymousBatch(db, body.feeds);

    return NextResponse.json(
      {
        success: true,
        batchId: result.batchId,
        processedFeedsCount: result.count,
        message: 'Anonymous subscription batch recorded successfully',
        isDownweighted: result.isDownweighted ?? false,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Error in /api/discovery/submit:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to submit anonymous batch' },
      { status: 400 }
    );
  }
}
