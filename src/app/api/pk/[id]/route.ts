import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET - Get PK battle details
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const battle = await db.pKBattle.findUnique({
      where: { id },
      include: {
        creator1: { select: { id: true, username: true, displayName: true, avatar: true, isLive: true } },
        creator2: { select: { id: true, username: true, displayName: true, avatar: true, isLive: true } },
        winner: { select: { id: true, username: true, displayName: true, avatar: true } },
        stream: { select: { id: true, title: true } },
      },
    });

    if (!battle) return NextResponse.json({ error: 'Battle not found' }, { status: 404 });

    return NextResponse.json({ battle });
  } catch (error) {
    console.error('Fetch PK battle error:', error);
    return NextResponse.json({ error: 'Failed to fetch battle' }, { status: 500 });
  }
}
