import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, sanitizeString } from '@/lib/auth';
import { parsePagination, paginateResults } from '@/lib/pagination';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  try {
    const { limit, cursor } = parsePagination(request);

    const streams = await db.stream.findMany({
      where: { isLive: true, isPrivate: false },
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
        createdAt: true,
        creator: {
          select: { id: true, username: true, displayName: true, avatar: true, isLive: true },
        },
      },
      orderBy: { viewerCount: 'desc' },
      take: limit + 1,
      ...(cursor
        ? { skip: 1, cursor: { id: cursor } }
        : {}),
    });

    const paginated = paginateResults(streams, limit);

    return NextResponse.json({ streams: paginated.data, pagination: paginated.pagination });
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

    // Auto-promote user to creator role on first stream
    // Any authenticated user can go live — they become a creator automatically
    if (user.role === 'user') {
      await db.user.update({
        where: { id: user.id },
        data: { role: 'creator' },
      });
    }

    const body = await request.json();
    const { title, description, isPrivate } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // SECURITY: Sanitize and validate input
    const sanitizedTitle = sanitizeString(title, 100);
    const sanitizedDescription = description ? sanitizeString(description, 500) : null;

    if (!sanitizedTitle) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    }

    const stream = await db.stream.create({
      data: {
        creatorId: user.id,
        title: sanitizedTitle,
        description: sanitizedDescription,
        streamKey: uuidv4(),
        isLive: true,
        isPrivate: isPrivate || false,
        startedAt: new Date(),
      },
      select: {
        id: true,
        creatorId: true,
        title: true,
        description: true,
        streamKey: true, // Include for creator's own stream
        isLive: true,
        isPrivate: true,
        thumbnailUrl: true,
        viewerCount: true,
        startedAt: true,
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
