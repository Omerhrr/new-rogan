import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const gifts = await db.gift.findMany({
      where: { senderId: user.id },
      include: {
        receiver: { select: { id: true, username: true, displayName: true, avatar: true } },
        stream: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ gifts });
  } catch (error) {
    console.error('Get sent gifts error:', error);
    return NextResponse.json({ error: 'Failed to get gifts' }, { status: 500 });
  }
}
