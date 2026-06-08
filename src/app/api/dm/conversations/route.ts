import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const sentMessages = await db.directMessage.findMany({
      where: { senderId: user.id },
      select: { receiverId: true },
      distinct: ['receiverId'],
    });

    const receivedMessages = await db.directMessage.findMany({
      where: { receiverId: user.id },
      select: { senderId: true },
      distinct: ['senderId'],
    });

    const userIds = new Set([
      ...sentMessages.map((m) => m.receiverId),
      ...receivedMessages.map((m) => m.senderId),
    ]);

    const conversations = [];

    for (const otherUserId of userIds) {
      const otherUser = await db.user.findUnique({
        where: { id: otherUserId },
        select: { id: true, username: true, displayName: true, avatar: true },
      });

      const lastMessage = await db.directMessage.findFirst({
        where: {
          OR: [
            { senderId: user.id, receiverId: otherUserId },
            { senderId: otherUserId, receiverId: user.id },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      const unreadCount = await db.directMessage.count({
        where: { senderId: otherUserId, receiverId: user.id, isRead: false },
      });

      if (otherUser && lastMessage) {
        conversations.push({ user: otherUser, lastMessage, unreadCount });
      }
    }

    conversations.sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    return NextResponse.json({ error: 'Failed to get conversations' }, { status: 500 });
  }
}
