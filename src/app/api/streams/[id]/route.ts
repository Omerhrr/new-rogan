import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, sanitizeString } from '@/lib/auth';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const stream = await db.stream.findUnique({
      where: { id },
      select: {
        // SECURITY: Exclude streamKey from public response
        id: true,
        creatorId: true,
        title: true,
        description: true,
        isLive: true,
        isPrivate: true,
        thumbnailUrl: true,
        viewerCount: true,
        peakViewers: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
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

    // SECURITY: For private streams, verify the user has access
    if (stream.isPrivate) {
      const user = await getUserFromRequest();
      if (!user) {
        return NextResponse.json({ error: 'Authentication required for private streams' }, { status: 401 });
      }

      // Creator always has access
      if (stream.creatorId !== user.id) {
        const access = await db.streamAccess.findUnique({
          where: { streamId_userId: { streamId: stream.id, userId: user.id } },
        });
        if (!access && user.role !== 'admin') {
          return NextResponse.json({ error: 'No access to this private stream' }, { status: 403 });
        }
      }
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

    if (stream.creatorId !== user.id && user.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const sanitized = sanitizeString(body.title, 100);
      if (!sanitized) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
      updateData.title = sanitized;
    }
    if (body.description !== undefined) updateData.description = sanitizeString(body.description, 500);
    if (body.isLive === false) {
      updateData.isLive = false;
      updateData.endedAt = new Date();
      await db.user.update({ where: { id: stream.creatorId }, data: { isLive: false } });
    }
    // SECURITY: Removed viewerCount from PATCH — viewer count should be computed server-side, not client-submitted

    const updatedStream = await db.stream.update({
      where: { id },
      data: updateData,
      select: {
        // SECURITY: Exclude streamKey
        id: true,
        creatorId: true,
        title: true,
        description: true,
        isLive: true,
        isPrivate: true,
        thumbnailUrl: true,
        viewerCount: true,
        peakViewers: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ stream: updatedStream });
  } catch (error) {
    console.error('Update stream error:', error);
    return NextResponse.json({ error: 'Failed to update stream' }, { status: 500 });
  }
}
