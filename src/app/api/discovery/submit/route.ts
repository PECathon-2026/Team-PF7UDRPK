import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { submitAnonymousBatch, seedInitialFeeds } from '@/lib/discovery/engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body || !Array.isArray(body.feeds) || body.feeds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid payload: "feeds" must be a non-empty array of URL strings' },
        { status: 400 }
      );
    }

    // Optional Proof of Work verification hook (Member C's contract)
    // If Member C's verifyPoWChallenge is available, it can validate here
    if (body.powSolution) {
      // Plug-and-play hook for Member C's PoW validation
      console.log('PoW solution received:', body.powSolution);
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

