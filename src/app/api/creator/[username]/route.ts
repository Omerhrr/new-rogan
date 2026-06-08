import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

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

    // SECURITY: Only show earnings to the creator themselves or admin
    const currentUser = await getUserFromRequest();
    const canSeeEarnings = currentUser && (currentUser.id === user.id || currentUser.role === 'admin');

    const totalEarned = canSeeEarnings
      ? (await db.gift.aggregate({
          where: { receiverId: user.id },
          _sum: { amount: true },
        }))._sum.amount || 0
      : null;

    // SECURITY: Exclude streamKey from the response
    const streams = await db.stream.findMany({
      where: { creatorId: user.id, isLive: true },
      select: {
        id: true,
        title: true,
        description: true,
        isLive: true,
        isPrivate: true,
        viewerCount: true,
        startedAt: true,
        // streamKey intentionally excluded
      },
      take: 1,
    });

    return NextResponse.json({
      creator: user,
      followerCount,
      totalEarned,
      currentStream: streams[0] || null,
    });
  } catch (error) {
    console.error('Get creator profile error:', error);
    return NextResponse.json({ error: 'Failed to get creator profile' }, { status: 500 });
  }
}
