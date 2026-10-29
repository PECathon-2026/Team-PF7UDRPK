import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { getRecommendations, seedInitialFeeds } from '@/lib/discovery/engine';

export async function GET(req: NextRequest) {
  try {
    const feedsParam = req.nextUrl.searchParams.get('feeds');
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 8;

    const subscribedUrls = feedsParam
      ? feedsParam.split(',').map((u) => decodeURIComponent(u.trim())).filter(Boolean)
      : [];

    const db = await getDb();
    await seedInitialFeeds(db);

    const result = await getRecommendations(db, subscribedUrls, limit);

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('Error in /api/discovery/recommendations:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to compute recommendations' },
      { status: 500 }
    );
  }
}
