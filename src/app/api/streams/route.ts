import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  try {
    const streams = await db.stream.findMany({
      where: { isLive: true },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatar: true, isLive: true },
        },
      },
      orderBy: { viewerCount: 'desc' },
    });

    return NextResponse.json({ streams });
  } catch (error) {
    console.error('Get streams error:', error);
    return NextResponse.json({ error: 'Failed to get streams' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, isPrivate } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const stream = await db.stream.create({
      data: {
        creatorId: user.id,
        title,
        description: description || null,
        streamKey: uuidv4(),
        isLive: true,
        isPrivate: isPrivate || false,
        startedAt: new Date(),
      },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatar: true },
        },
      },
    });

    await db.user.update({ where: { id: user.id }, data: { isLive: true } });

    return NextResponse.json({ stream }, { status: 201 });
  } catch (error) {
    console.error('Create stream error:', error);
    return NextResponse.json({ error: 'Failed to create stream' }, { status: 500 });
  }
}
