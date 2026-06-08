import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const stream = await db.stream.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatar: true, bio: true, isLive: true },
        },
        chats: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
        gifts: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            sender: { select: { id: true, username: true, displayName: true, avatar: true } },
          },
        },
      },
    });

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    return NextResponse.json({ stream });
  } catch (error) {
    console.error('Get stream error:', error);
    return NextResponse.json({ error: 'Failed to get stream' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const stream = await db.stream.findUnique({ where: { id } });
    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    if (stream.creatorId !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.isLive === false) {
      updateData.isLive = false;
      updateData.endedAt = new Date();
      await db.user.update({ where: { id: user.id }, data: { isLive: false } });
    }
    if (body.viewerCount !== undefined) updateData.viewerCount = body.viewerCount;

    const updatedStream = await db.stream.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ stream: updatedStream });
  } catch (error) {
    console.error('Update stream error:', error);
    return NextResponse.json({ error: 'Failed to update stream' }, { status: 500 });
  }
}
