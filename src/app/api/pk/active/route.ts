import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET - Get active PK battles
export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const battles = await db.pKBattle.findMany({
      where: { status: { in: ['pending', 'active'] } },
      include: {
        creator1: { select: { id: true, username: true, displayName: true, avatar: true, isLive: true } },
        creator2: { select: { id: true, username: true, displayName: true, avatar: true, isLive: true } },
        stream: { select: { id: true, title: true, viewerCount: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ battles });
  } catch (error) {
    console.error('Fetch active PK battles error:', error);
    return NextResponse.json({ error: 'Failed to fetch active battles' }, { status: 500 });
  }
}
