import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, sanitizeString } from '@/lib/auth';

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

    // SECURITY: Validate the stream exists and receiver is the stream's creator
    const stream = await db.stream.findUnique({ where: { id: streamId } });
    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }
    if (stream.creatorId !== receiverId) {
      return NextResponse.json({ error: 'Gift receiver must be the stream creator' }, { status: 400 });
    }

    // SECURITY: For private streams, verify sender has access
    if (stream.isPrivate) {
      const access = await db.streamAccess.findUnique({
        where: { streamId_userId: { streamId, userId: user.id } },
      });
      if (!access && stream.creatorId !== user.id) {
        return NextResponse.json({ error: 'No access to this private stream' }, { status: 403 });
      }
    }

    // SECURITY: Sanitize message
    const sanitizedMessage = message ? sanitizeString(message, 200) : null;

    // SECURITY: Wrap all financial operations in a transaction to prevent race conditions
    const result = await db.$transaction(async (tx) => {
      // Check balance within transaction
      const ledger = await tx.ledgerAccount.findUnique({
        where: { userId: user.id },
      });

      if (!ledger || ledger.tkBalance < tkAmount) {
        throw new Error('Insufficient TK balance');
      }

      // Deduct from sender
      await tx.ledgerAccount.update({
        where: { userId: user.id },
        data: { tkBalance: { decrement: tkAmount } },
      });

      // Add to receiver (80% goes to creator)
      const creatorShare = Math.floor(tkAmount * 0.8);
      await tx.ledgerAccount.upsert({
        where: { userId: receiverId },
        update: { tkBalance: { increment: creatorShare } },
        create: { userId: receiverId, tkBalance: creatorShare },
      });

      // Create gift record
      const gift = await tx.gift.create({
        data: {
          streamId,
          senderId: user.id,
          receiverId,
          giftType,
          amount: tkAmount,
          message: sanitizedMessage,
        },
      });

      // Create transactions
      await tx.transaction.create({
        data: {
          type: 'gift_send',
          amount: tkAmount,
          fromUserId: user.id,
          toUserId: receiverId,
          referenceId: gift.id,
          metadata: JSON.stringify({ giftType, streamId }),
        },
      });

      await tx.transaction.create({
        data: {
          type: 'gift_receive',
          amount: creatorShare,
          fromUserId: user.id,
          toUserId: receiverId,
          referenceId: gift.id,
          metadata: JSON.stringify({ giftType, streamId, originalAmount: tkAmount }),
        },
      });

      return { gift, tkAmount, creatorShare };
    });

    // Create notification outside transaction (non-critical, can fail)
    try {
      await db.notification.create({
        data: {
          userId: receiverId,
          type: 'gift_received',
          title: 'Gift Received!',
          message: `${user.username} sent you a ${giftType}!`,
          metadata: JSON.stringify({ giftId: result.gift.id, giftType, amount: result.tkAmount }),
        },
      });
    } catch {
      // Notification failure shouldn't break the gift
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Insufficient TK balance') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Send gift error:', error);
    return NextResponse.json({ error: 'Failed to send gift' }, { status: 500 });
  }
}
