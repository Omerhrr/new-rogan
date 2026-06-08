import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET - Get user's active subscriptions
export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const subscriptions = await db.subscription.findMany({
      where: { subscriberId: user.id, isActive: true },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatar: true, isLive: true },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    return NextResponse.json({ subscriptions });
  } catch (error) {
    console.error('Fetch my subscriptions error:', error);
    return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
  }
}
