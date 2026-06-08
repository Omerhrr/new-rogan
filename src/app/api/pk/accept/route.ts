import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// POST - Accept a PK challenge
export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'creator') return NextResponse.json({ error: 'Only creators can accept PK battles' }, { status: 403 });

    const body = await request.json();
    const { battleId } = body;

    if (!battleId) return NextResponse.json({ error: 'battleId is required' }, { status: 400 });

    const battle = await db.pKBattle.findUnique({ where: { id: battleId } });
    if (!battle) return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
    if (battle.creator2Id !== user.id) return NextResponse.json({ error: 'You are not the challenged creator' }, { status: 403 });
    if (battle.status !== 'pending') return NextResponse.json({ error: 'Battle is not in pending state' }, { status: 400 });

    const updatedBattle = await db.pKBattle.update({
      where: { id: battleId },
      data: { status: 'active', startedAt: new Date() },
      include: {
        creator1: { select: { id: true, username: true, displayName: true, avatar: true } },
        creator2: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
    });

    return NextResponse.json({ battle: updatedBattle });
  } catch (error) {
    console.error('PK accept error:', error);
    return NextResponse.json({ error: 'Failed to accept PK challenge' }, { status: 500 });
  }
}
