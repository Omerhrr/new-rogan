import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id: streamId } = await params;

    const stream = await db.stream.findUnique({
      where: { id: streamId },
      select: { isPrivate: true, creatorId: true },
    });

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    // If not private, user has access
    if (!stream.isPrivate) {
      return NextResponse.json({ hasAccess: true });
    }

    // Creator always has access
    if (stream.creatorId === user.id) {
      return NextResponse.json({ hasAccess: true });
    }

    // Check access list
    const access = await db.streamAccess.findUnique({
      where: { streamId_userId: { streamId, userId: user.id } },
    });

    return NextResponse.json({ hasAccess: !!access });
  } catch (error) {
    console.error('Check stream access error:', error);
    return NextResponse.json({ error: 'Failed to check access' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id: streamId } = await params;
    const body = await request.json();
    const { userId, action } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: 'userId and action are required' }, { status: 400 });
    }

    const stream = await db.stream.findUnique({
      where: { id: streamId },
    });

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    // Only the creator can grant/revoke access
    if (stream.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the stream creator can manage access' }, { status: 403 });
    }

    if (action === 'grant') {
      await db.streamAccess.upsert({
        where: { streamId_userId: { streamId, userId } },
        update: { grantedAt: new Date() },
        create: { streamId, userId },
      });
      return NextResponse.json({ message: 'Access granted' });
    } else if (action === 'revoke') {
      await db.streamAccess.deleteMany({
        where: { streamId, userId },
      });
      return NextResponse.json({ message: 'Access revoked' });
    } else {
      return NextResponse.json({ error: 'Invalid action. Use "grant" or "revoke"' }, { status: 400 });
    }
  } catch (error) {
    console.error('Stream access error:', error);
    return NextResponse.json({ error: 'Failed to update access' }, { status: 500 });
  }
}
