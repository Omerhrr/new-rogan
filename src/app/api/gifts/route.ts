import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

const GIFT_PRICES: Record<string, number> = {
  rose: 1,
  heart: 5,
  fire: 50,
  diamond: 10,
  crown: 100,
};

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { streamId, receiverId, giftType, message } = body;

    if (!streamId || !receiverId || !giftType) {
      return NextResponse.json({ error: 'Stream ID, receiver ID, and gift type are required' }, { status: 400 });
    }

    const price = GIFT_PRICES[giftType];
    if (!price) {
      return NextResponse.json({ error: 'Invalid gift type' }, { status: 400 });
    }

    const tkAmount = price * 100; // Convert to TK units

    // Check balance
    const ledger = await db.ledgerAccount.findUnique({
      where: { userId: user.id },
    });

    if (!ledger || ledger.tkBalance < tkAmount) {
      return NextResponse.json({ error: 'Insufficient TK balance' }, { status: 400 });
    }

    // Deduct from sender
    await db.ledgerAccount.update({
      where: { userId: user.id },
      data: { tkBalance: { decrement: tkAmount } },
    });

    // Add to receiver (80% goes to creator)
    const creatorShare = Math.floor(tkAmount * 0.8);
    await db.ledgerAccount.upsert({
      where: { userId: receiverId },
      update: { tkBalance: { increment: creatorShare } },
      create: { userId: receiverId, tkBalance: creatorShare },
    });

    // Create gift record
    const gift = await db.gift.create({
      data: {
        streamId,
        senderId: user.id,
        receiverId,
        giftType,
        amount: tkAmount,
        message: message || null,
      },
    });

    // Create transactions
    await db.transaction.create({
      data: {
        type: 'gift_send',
        amount: tkAmount,
        fromUserId: user.id,
        toUserId: receiverId,
        referenceId: gift.id,
        metadata: JSON.stringify({ giftType, streamId }),
      },
    });

    await db.transaction.create({
      data: {
        type: 'gift_receive',
        amount: creatorShare,
        fromUserId: user.id,
        toUserId: receiverId,
        referenceId: gift.id,
        metadata: JSON.stringify({ giftType, streamId, originalAmount: tkAmount }),
      },
    });

    // Create notification
    await db.notification.create({
      data: {
        userId: receiverId,
        type: 'gift_received',
        title: 'Gift Received!',
        message: `${user.username} sent you a ${giftType}!`,
        metadata: JSON.stringify({ giftId: gift.id, giftType, amount: tkAmount, senderUsername: user.username }),
      },
    });

    return NextResponse.json({
      gift,
      tkAmount,
      creatorShare,
    }, { status: 201 });
  } catch (error) {
    console.error('Send gift error:', error);
    return NextResponse.json({ error: 'Failed to send gift' }, { status: 500 });
  }
}
