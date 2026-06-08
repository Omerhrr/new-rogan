import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// POST - Subscribe to a creator's tier
export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { creatorId, tier } = body;

    if (!creatorId || !tier) {
      return NextResponse.json({ error: 'creatorId and tier are required' }, { status: 400 });
    }

    if (creatorId === user.id) {
      return NextResponse.json({ error: 'Cannot subscribe to yourself' }, { status: 400 });
    }

    // Find the tier
    const subscriptionTier = await db.subscriptionTier.findFirst({
      where: { creatorId, tier, isActive: true },
    });

    if (!subscriptionTier) {
      return NextResponse.json({ error: 'Tier not found' }, { status: 404 });
    }

    // Check if already subscribed
    const existing = await db.subscription.findFirst({
      where: { subscriberId: user.id, creatorId, isActive: true },
    });

    if (existing) {
      return NextResponse.json({ error: 'Already subscribed to this creator' }, { status: 400 });
    }

    // Check balance
    const ledger = await db.ledgerAccount.findUnique({ where: { userId: user.id } });
    if (!ledger || ledger.tkBalance < subscriptionTier.price) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 });
    }

    // Deduct TK and create subscription
    await db.$transaction([
      db.ledgerAccount.update({
        where: { userId: user.id },
        data: { tkBalance: { decrement: subscriptionTier.price } },
      }),
      db.subscription.create({
        data: {
          subscriberId: user.id,
          creatorId,
          tier,
          price: subscriptionTier.price,
          isActive: true,
        },
      }),
      db.transaction.create({
        data: {
          type: 'subscription',
          amount: subscriptionTier.price,
          fromUserId: user.id,
          toUserId: creatorId,
          metadata: JSON.stringify({ tier, tierName: subscriptionTier.name }),
        },
      }),
    ]);

    return NextResponse.json({ success: true, message: 'Subscribed successfully' }, { status: 201 });
  } catch (error) {
    console.error('Subscribe error:', error);
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}
