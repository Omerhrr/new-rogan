import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, rateLimit } from '@/lib/auth';

// POST - Subscribe to a creator's tier
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    // SECURITY: Rate limit subscription attempts
    if (!rateLimit(`subscribe:${user.id}`, 5, 60_000)) {
      return NextResponse.json({ error: 'Too many subscription attempts. Please wait.' }, { status: 429 });
    }

    const body = await request.json();
    const { creatorId, tier } = body;

    if (!creatorId || !tier) {
      return NextResponse.json({ error: 'creatorId and tier are required' }, { status: 400 });
    }

    if (creatorId === user.id) {
      return NextResponse.json({ error: 'Cannot subscribe to yourself' }, { status: 400 });
    }

    // Validate tier value
    if (!['basic', 'premium', 'vip'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier level' }, { status: 400 });
    }

    // SECURITY: Move ALL checks and operations into a single transaction to prevent TOCTOU race condition.
    const result = await db.$transaction(async (tx) => {
      // Find the tier
      const subscriptionTier = await tx.subscriptionTier.findFirst({
        where: { creatorId, tier, isActive: true },
      });

      if (!subscriptionTier) {
        throw new Error('NOT_FOUND');
      }

      // Check if already subscribed
      const existing = await tx.subscription.findFirst({
        where: { subscriberId: user.id, creatorId, isActive: true },
      });

      if (existing) {
        throw new Error('Already subscribed to this creator');
      }

      // SECURITY: Check balance WITHIN the transaction to prevent race condition
      const ledger = await tx.ledgerAccount.findUnique({ where: { userId: user.id } });
      if (!ledger || ledger.tkBalance < subscriptionTier.price) {
        throw new Error('Insufficient balance');
      }

      // Deduct TK
      await tx.ledgerAccount.update({
        where: { userId: user.id },
        data: { tkBalance: { decrement: subscriptionTier.price } },
      });

      // Credit creator (80% to creator, 20% platform fee)
      const creatorShare = Math.floor(subscriptionTier.price * 0.8);
      await tx.ledgerAccount.upsert({
        where: { userId: creatorId },
        update: { tkBalance: { increment: creatorShare } },
        create: { userId: creatorId, tkBalance: creatorShare },
      });

      // Create subscription
      const subscription = await tx.subscription.create({
        data: {
          subscriberId: user.id,
          creatorId,
          tier,
          price: subscriptionTier.price,
          isActive: true,
        },
      });

      // Create transaction records
      await tx.transaction.create({
        data: {
          type: 'subscription',
          amount: subscriptionTier.price,
          fromUserId: user.id,
          toUserId: creatorId,
          referenceId: subscription.id,
          metadata: JSON.stringify({ tier, tierName: subscriptionTier.name }),
        },
      });

      return { subscriptionId: subscription.id, price: subscriptionTier.price, creatorShare };
    });

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Already subscribed to this creator') {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.message === 'Insufficient balance') {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.message === 'NOT_FOUND') {
        return NextResponse.json({ error: 'Tier not found' }, { status: 404 });
      }
    }
    console.error('Subscribe error:', error);
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}
