import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET - Get subscribers for the logged-in creator
export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const subscribers = await db.subscription.findMany({
      where: { creatorId: user.id, isActive: true },
      include: {
        subscriber: {
          select: { id: true, username: true, displayName: true, avatar: true },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    return NextResponse.json({ subscribers });
  } catch (error) {
    console.error('Fetch subscribers error:', error);
    return NextResponse.json({ error: 'Failed to fetch subscribers' }, { status: 500 });
  }
}
