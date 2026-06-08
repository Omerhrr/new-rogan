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

    // ===== Phase 3: Subscriber data =====
    const subscriberCount = await db.subscription.count({
      where: { creatorId: user.id, isActive: true },
    });

    const recentSubscribers = await db.subscription.findMany({
      where: { creatorId: user.id, isActive: true },
      include: {
        subscriber: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
      orderBy: { startDate: 'desc' },
      take: 5,
    });

    // ===== Phase 3: PK Battle history =====
    const pkBattles = await db.pKBattle.findMany({
      where: {
        OR: [{ creator1Id: user.id }, { creator2Id: user.id }],
      },
      include: {
        creator1: { select: { id: true, username: true, displayName: true, avatar: true } },
        creator2: { select: { id: true, username: true, displayName: true, avatar: true } },
        winner: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const pkWins = await db.pKBattle.count({
      where: { winnerId: user.id },
    });

    const pkTotal = await db.pKBattle.count({
      where: {
        OR: [{ creator1Id: user.id }, { creator2Id: user.id }],
        status: 'completed',
      },
    });

    // ===== Phase 3: Average service rating =====
    const services = await db.serviceListing.findMany({
      where: { creatorId: user.id },
      select: { rating: true, reviewCount: true },
    });

    const totalReviews = services.reduce((sum, s) => sum + s.reviewCount, 0);
    const avgServiceRating = services.length > 0
      ? services.reduce((sum, s) => sum + s.rating * s.reviewCount, 0) / Math.max(totalReviews, 1)
      : 0;

    // Active subscription tiers count
    const tierCount = await db.subscriptionTier.count({
      where: { creatorId: user.id, isActive: true },
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
      // Phase 3 additions
      subscriberCount,
      recentSubscribers,
      pkBattles,
      pkWins,
      pkTotal,
      avgServiceRating: Math.round(avgServiceRating * 10) / 10,
      totalReviews,
      tierCount,
    });
  } catch (error) {
    console.error('Creator dashboard error:', error);
    return NextResponse.json({ error: 'Failed to get dashboard data' }, { status: 500 });
  }
}
