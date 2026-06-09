import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, sanitizeString, rateLimit } from '@/lib/auth';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { userId: otherUserId } = await params;

    // SECURITY: Verify the other user exists
    const otherUser = await db.user.findUnique({ where: { id: otherUserId }, select: { id: true } });
    if (!otherUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const messages = await db.directMessage.findMany({
      where: {
        OR: [
          { senderId: user.id, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: user.id },
        ],
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    // Mark unread messages as read
    await db.directMessage.updateMany({
      where: { senderId: otherUserId, receiverId: user.id, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Get DMs error:', error);
    return NextResponse.json({ error: 'Failed to get messages' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Rate limit: 30/min per user
    if (!rateLimit(`dm:send:${user.id}`, 30, 60 * 1000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { userId: receiverId } = await params;

    // SECURITY: Verify the receiver exists
    const receiver = await db.user.findUnique({ where: { id: receiverId }, select: { id: true } });
    if (!receiver) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }

    // SECURITY: Prevent sending DMs to yourself
    if (receiverId === user.id) {
      return NextResponse.json({ error: 'Cannot send a message to yourself' }, { status: 400 });
    }

    const body = await request.json();
    const { message, isPaid, price } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // SECURITY: Sanitize and limit message length
    const sanitizedMessage = sanitizeString(message, 1000);
    if (!sanitizedMessage) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    let tkPrice = 0;

    if (isPaid && price && price > 0) {
      // SECURITY: Validate price is a reasonable number
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 100000) {
        return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
      }

      tkPrice = Math.floor(price * 100);
      if (tkPrice <= 0) {
        return NextResponse.json({ error: 'Price too small' }, { status: 400 });
      }

      // SECURITY: Wrap financial operations in transaction to prevent race conditions
      await db.$transaction(async (tx) => {
        const ledger = await tx.ledgerAccount.findUnique({
          where: { userId: user.id },
        });
        if (!ledger || ledger.tkBalance < tkPrice) {
          throw new Error('Insufficient TK balance');
        }
        // Deduct from sender
        await tx.ledgerAccount.update({
          where: { userId: user.id },
          data: { tkBalance: { decrement: tkPrice } },
        });
        // Add to receiver
        await tx.ledgerAccount.upsert({
          where: { userId: receiverId },
          update: { tkBalance: { increment: tkPrice } },
          create: { userId: receiverId, tkBalance: tkPrice },
        });
        // Create transaction
        await tx.transaction.create({
          data: {
            type: 'dm_payment',
            amount: tkPrice,
            fromUserId: user.id,
            toUserId: receiverId,
            metadata: JSON.stringify({ messagePreview: sanitizedMessage.substring(0, 50) }),
          },
        });
      });
    }

    const dm = await db.directMessage.create({
      data: {
        senderId: user.id,
        receiverId,
        message: sanitizedMessage,
        isPaid: isPaid || false,
        price: tkPrice,
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
    });

    // Create notification
    try {
      await db.notification.create({
        data: {
          userId: receiverId,
          type: 'dm_received',
          title: 'New Message',
          message: `${user.username} sent you a message`,
          metadata: JSON.stringify({ dmId: dm.id }),
        },
      });
    } catch {
      // Notification failure shouldn't break the DM
    }

    return NextResponse.json({ message: dm }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Insufficient TK balance') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Send DM error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
