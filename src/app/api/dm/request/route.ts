import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { receiverId, message } = body;

    if (!receiverId || !message) {
      return NextResponse.json({ error: 'receiverId and message are required' }, { status: 400 });
    }

    // Check if they already have a conversation (follow each other or have exchanged DMs)
    const existingDMs = await db.directMessage.findFirst({
      where: {
        OR: [
          { senderId: user.id, receiverId },
          { senderId: receiverId, receiverId: user.id },
        ],
      },
    });

    if (existingDMs) {
      // They already have a conversation, just send the DM directly
      const dm = await db.directMessage.create({
        data: {
          senderId: user.id,
          receiverId,
          message,
        },
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatar: true } },
        },
      });

      await db.notification.create({
        data: {
          userId: receiverId,
          type: 'dm_received',
          title: 'New Message',
          message: `${user.username} sent you a message`,
          metadata: JSON.stringify({ dmId: dm.id }),
        },
      });

      return NextResponse.json({ message: dm, wasRequest: false }, { status: 201 });
    }

    // Check if they follow each other
    const mutualFollow = await db.follow.findFirst({
      where: { followerId: user.id, followingId: receiverId },
    });

    const reverseFollow = await db.follow.findFirst({
      where: { followerId: receiverId, followingId: user.id },
    });

    if (mutualFollow && reverseFollow) {
      // They follow each other, send DM directly
      const dm = await db.directMessage.create({
        data: {
          senderId: user.id,
          receiverId,
          message,
        },
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatar: true } },
        },
      });

      await db.notification.create({
        data: {
          userId: receiverId,
          type: 'dm_received',
          title: 'New Message',
          message: `${user.username} sent you a message`,
          metadata: JSON.stringify({ dmId: dm.id }),
        },
      });

      return NextResponse.json({ message: dm, wasRequest: false }, { status: 201 });
    }

    // Not following each other - create a DM request (still send as DM but with metadata)
    // For MVP, we'll still create the DM but mark it with a special notification
    const dm = await db.directMessage.create({
      data: {
        senderId: user.id,
        receiverId,
        message,
        isPaid: false,
        price: 0,
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
    });

    await db.notification.create({
      data: {
        userId: receiverId,
        type: 'dm_received',
        title: 'Message Request',
        message: `${user.username} wants to message you: "${message.substring(0, 50)}"`,
        metadata: JSON.stringify({ dmId: dm.id, isRequest: true, senderId: user.id }),
      },
    });

    return NextResponse.json({ message: dm, wasRequest: true }, { status: 201 });
  } catch (error) {
    console.error('DM request error:', error);
    return NextResponse.json({ error: 'Failed to send DM request' }, { status: 500 });
  }
}
