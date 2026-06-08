import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// POST - Challenge a creator to a PK battle
export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'creator') return NextResponse.json({ error: 'Only creators can start PK battles' }, { status: 403 });

    const body = await request.json();
    const { toCreatorId, streamId, duration } = body;

    if (!toCreatorId || !streamId) {
      return NextResponse.json({ error: 'toCreatorId and streamId are required' }, { status: 400 });
    }

    if (toCreatorId === user.id) {
      return NextResponse.json({ error: 'Cannot challenge yourself' }, { status: 400 });
    }

    // Verify stream belongs to the challenger
    const stream = await db.stream.findUnique({ where: { id: streamId } });
    if (!stream) return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    if (stream.creatorId !== user.id) return NextResponse.json({ error: 'Not your stream' }, { status: 403 });

    // Check if there's already an active battle for this stream
    const existingBattle = await db.pKBattle.findFirst({
      where: { streamId, status: { in: ['pending', 'active'] } },
    });
    if (existingBattle) {
      return NextResponse.json({ error: 'Stream already has an active PK battle' }, { status: 400 });
    }

    const battleDuration = duration || 300; // default 5 minutes

    const battle = await db.pKBattle.create({
      data: {
        streamId,
        creator1Id: user.id,
        creator2Id: toCreatorId,
        status: 'pending',
        duration: battleDuration,
      },
      include: {
        creator1: { select: { id: true, username: true, displayName: true, avatar: true } },
        creator2: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
    });

    return NextResponse.json({ battle }, { status: 201 });
  } catch (error) {
    console.error('PK challenge error:', error);
    return NextResponse.json({ error: 'Failed to create PK challenge' }, { status: 500 });
  }
}
