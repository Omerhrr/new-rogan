import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, sanitizeString } from '@/lib/auth';

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
      // SECURITY: Validate category to prevent injection
      const validCategories = ['video_call', 'custom_video', 'shoutout', 'coaching', 'other'];
      if (validCategories.includes(category)) {
        where.category = category;
      }
    }

    const services = await db.serviceListing.findMany({
      where,
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatar: true, isLive: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // SECURITY: Limit results
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

    // SECURITY: Validate and sanitize inputs
    const sanitizedTitle = sanitizeString(title, 100);
    const sanitizedDescription = sanitizeString(description, 2000);

    if (!sanitizedTitle || !sanitizedDescription) {
      return NextResponse.json({ error: 'Title and description cannot be empty' }, { status: 400 });
    }

    const validCategories = ['video_call', 'custom_video', 'shoutout', 'coaching', 'other'];
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    // SECURITY: Validate price is a reasonable number
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 100000) {
      return NextResponse.json({ error: 'Price must be between 1 and 100,000 TK' }, { status: 400 });
    }

    // SECURITY: Validate deliveryDays
    const deliveryDaysNum = typeof deliveryDays === 'number' ? deliveryDays : 3;
    if (deliveryDaysNum < 1 || deliveryDaysNum > 90) {
      return NextResponse.json({ error: 'Delivery days must be between 1 and 90' }, { status: 400 });
    }

    const service = await db.serviceListing.create({
      data: {
        creatorId: user.id,
        title: sanitizedTitle,
        description: sanitizedDescription,
        category,
        price: Math.floor(price * 100), // Convert TK to units
        deliveryDays: deliveryDaysNum,
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
