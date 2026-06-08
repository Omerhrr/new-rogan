import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await params;

    const user = await db.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        role: true,
        isLive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    const followerCount = await db.follow.count({
      where: { followingId: user.id },
    });

    const totalEarned = await db.gift.aggregate({
      where: { receiverId: user.id },
      _sum: { amount: true },
    });

    const streams = await db.stream.findMany({
      where: { creatorId: user.id, isLive: true },
      take: 1,
    });

    return NextResponse.json({
      creator: user,
      followerCount,
      totalEarned: totalEarned._sum.amount || 0,
      currentStream: streams[0] || null,
    });
  } catch (error) {
    console.error('Get creator profile error:', error);
    return NextResponse.json({ error: 'Failed to get creator profile' }, { status: 500 });
  }
}
