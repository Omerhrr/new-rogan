import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const receivedGifts = await db.gift.findMany({
      where: { receiverId: user.id },
      select: { amount: true, createdAt: true },
    });

    const totalEarned = receivedGifts.reduce((sum, g) => sum + g.amount, 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEarned = receivedGifts
      .filter((g) => new Date(g.createdAt) >= monthStart)
      .reduce((sum, g) => sum + g.amount, 0);

    const recentGifts = await db.gift.findMany({
      where: { receiverId: user.id },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatar: true } },
        stream: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const followerCount = await db.follow.count({
      where: { followingId: user.id },
    });

    const followingCount = await db.follow.count({
      where: { followerId: user.id },
    });

    const totalStreams = await db.stream.count({
      where: { creatorId: user.id },
    });

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dailyEarnings: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      dailyEarnings[key] = 0;
    }

    receivedGifts
      .filter((g) => new Date(g.createdAt) >= sevenDaysAgo)
      .forEach((g) => {
        const key = new Date(g.createdAt).toISOString().split('T')[0];
        if (dailyEarnings[key] !== undefined) {
          dailyEarnings[key] += g.amount;
        }
      });

    const ledger = await db.ledgerAccount.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({
      totalEarned,
      thisMonthEarned,
      pendingWithdrawal: 0,
      tkBalance: ledger?.tkBalance || 0,
      followerCount,
      followingCount,
      totalStreams,
      recentGifts,
      dailyEarnings,
    });
  } catch (error) {
    console.error('Creator dashboard error:', error);
    return NextResponse.json({ error: 'Failed to get dashboard data' }, { status: 500 });
  }
}
