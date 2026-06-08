import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// POST - End a PK battle
export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { battleId, creator1Score, creator2Score } = body;

    if (!battleId) return NextResponse.json({ error: 'battleId is required' }, { status: 400 });

    const battle = await db.pKBattle.findUnique({ where: { id: battleId } });
    if (!battle) return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
    if (battle.status !== 'active') return NextResponse.json({ error: 'Battle is not active' }, { status: 400 });

    // Only participants can end the battle
    if (battle.creator1Id !== user.id && battle.creator2Id !== user.id) {
      return NextResponse.json({ error: 'Only participants can end the battle' }, { status: 403 });
    }

    const c1Score = creator1Score ?? battle.creator1Score;
    const c2Score = creator2Score ?? battle.creator2Score;
    const winnerId = c1Score > c2Score ? battle.creator1Id : c2Score > c1Score ? battle.creator2Id : null;

    const updatedBattle = await db.pKBattle.update({
      where: { id: battleId },
      data: {
        status: 'completed',
        creator1Score: c1Score,
        creator2Score: c2Score,
        winnerId,
        endedAt: new Date(),
      },
      include: {
        creator1: { select: { id: true, username: true, displayName: true, avatar: true } },
        creator2: { select: { id: true, username: true, displayName: true, avatar: true } },
        winner: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
    });

    return NextResponse.json({ battle: updatedBattle });
  } catch (error) {
    console.error('End PK battle error:', error);
    return NextResponse.json({ error: 'Failed to end battle' }, { status: 500 });
  }
}
