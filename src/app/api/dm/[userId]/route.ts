import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { userId: otherUserId } = await params;

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

    const { userId: receiverId } = await params;
    const body = await request.json();
    const { message, isPaid, price } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    let tkPrice = 0;
    if (isPaid && price && price > 0) {
      tkPrice = price * 100;
      // Check balance
      const ledger = await db.ledgerAccount.findUnique({
        where: { userId: user.id },
      });
      if (!ledger || ledger.tkBalance < tkPrice) {
        return NextResponse.json({ error: 'Insufficient TK balance' }, { status: 400 });
      }
      // Deduct from sender
      await db.ledgerAccount.update({
        where: { userId: user.id },
        data: { tkBalance: { decrement: tkPrice } },
      });
      // Add to receiver
      await db.ledgerAccount.upsert({
        where: { userId: receiverId },
        update: { tkBalance: { increment: tkPrice } },
        create: { userId: receiverId, tkBalance: tkPrice },
      });
      // Create transaction
      await db.transaction.create({
        data: {
          type: 'dm_payment',
          amount: tkPrice,
          fromUserId: user.id,
          toUserId: receiverId,
          metadata: JSON.stringify({ messagePreview: message.substring(0, 50) }),
        },
      });
    }

    const dm = await db.directMessage.create({
      data: {
        senderId: user.id,
        receiverId,
        message,
        isPaid: isPaid || false,
        price: tkPrice,
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
    });

    // Create notification
    await db.notification.create({
      data: {
        userId: receiverId,
        type: 'dm_received',
        title: 'New Message',
        message: `${user.username} sent you a message`,
        metadata: JSON.stringify({ dmId: dm.id }),
      },
    });

    return NextResponse.json({ message: dm }, { status: 201 });
  } catch (error) {
    console.error('Send DM error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
