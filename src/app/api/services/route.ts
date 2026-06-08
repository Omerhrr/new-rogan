import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const where: Record<string, unknown> = { isActive: true };
    if (category && category !== 'all') {
      where.category = category;
    }

    const services = await db.serviceListing.findMany({
      where,
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatar: true, isLive: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ services });
  } catch (error) {
    console.error('Get services error:', error);
    return NextResponse.json({ error: 'Failed to get services' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (user.role !== 'creator') {
      return NextResponse.json({ error: 'Only creators can create service listings' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, category, price, deliveryDays } = body;

    if (!title || !description || !category || !price) {
      return NextResponse.json({ error: 'Title, description, category, and price are required' }, { status: 400 });
    }

    const validCategories = ['video_call', 'custom_video', 'shoutout', 'coaching', 'other'];
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const service = await db.serviceListing.create({
      data: {
        creatorId: user.id,
        title,
        description,
        category,
        price: price * 100, // Convert TK to units
        deliveryDays: deliveryDays || 3,
      },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatar: true, isLive: true },
        },
      },
    });

    return NextResponse.json({ service }, { status: 201 });
  } catch (error) {
    console.error('Create service error:', error);
    return NextResponse.json({ error: 'Failed to create service' }, { status: 500 });
  }
}
