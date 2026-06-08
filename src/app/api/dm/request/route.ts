import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, sanitizeString } from '@/lib/auth';

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

    // SECURITY: Verify receiver exists
    const receiver = await db.user.findUnique({ where: { id: receiverId }, select: { id: true } });
    if (!receiver) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }

    // SECURITY: Prevent DMing yourself
    if (receiverId === user.id) {
      return NextResponse.json({ error: 'Cannot send a message to yourself' }, { status: 400 });
    }

    // SECURITY: Sanitize message
    const sanitizedMessage = sanitizeString(message, 1000);
    if (!sanitizedMessage) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
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
          message: sanitizedMessage,
        },
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatar: true } },
        },
      });

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
      } catch { /* non-critical */ }

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
          message: sanitizedMessage,
        },
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatar: true } },
        },
      });

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
      } catch { /* non-critical */ }

      return NextResponse.json({ message: dm, wasRequest: false }, { status: 201 });
    }

    // Not following each other - create a DM request
    const dm = await db.directMessage.create({
      data: {
        senderId: user.id,
        receiverId,
        message: sanitizedMessage,
        isPaid: false,
        price: 0,
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
    });

    try {
      await db.notification.create({
        data: {
          userId: receiverId,
          type: 'dm_received',
          title: 'Message Request',
          message: `${user.username} wants to message you: "${sanitizedMessage.substring(0, 50)}"`,
          metadata: JSON.stringify({ dmId: dm.id, isRequest: true, senderId: user.id }),
        },
      });
    } catch { /* non-critical */ }

    return NextResponse.json({ message: dm, wasRequest: true }, { status: 201 });
  } catch (error) {
    console.error('DM request error:', error);
    return NextResponse.json({ error: 'Failed to send DM request' }, { status: 500 });
  }
}
