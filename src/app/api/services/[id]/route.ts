import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, sanitizeString } from '@/lib/auth';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    const service = await db.serviceListing.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatar: true, isLive: true, bio: true },
        },
        requests: {
          where: { buyerId: user.id },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    return NextResponse.json({ service });
  } catch (error) {
    console.error('Get service error:', error);
    return NextResponse.json({ error: 'Failed to get service' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    const existing = await db.serviceListing.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    if (existing.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can update this service' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, category, price, deliveryDays, isActive } = body;

    // SECURITY: Sanitize all text fields and validate numeric fields
    const updateData: Record<string, unknown> = {};
    if (title !== undefined) {
      const sanitized = sanitizeString(title, 100);
      if (!sanitized) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
      updateData.title = sanitized;
    }
    if (description !== undefined) {
      updateData.description = sanitizeString(description, 2000);
    }
    if (category !== undefined) {
      const validCategories = ['video_call', 'custom_video', 'shoutout', 'coaching', 'other'];
      if (!validCategories.includes(category)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
      }
      updateData.category = category;
    }
    if (price !== undefined) {
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 100000) {
        return NextResponse.json({ error: 'Price must be a positive number up to 1000 TK' }, { status: 400 });
      }
      updateData.price = Math.floor(price * 100);
    }
    if (deliveryDays !== undefined) {
      if (typeof deliveryDays !== 'number' || !Number.isInteger(deliveryDays) || deliveryDays < 1 || deliveryDays > 365) {
        return NextResponse.json({ error: 'Delivery days must be an integer between 1 and 365' }, { status: 400 });
      }
      updateData.deliveryDays = deliveryDays;
    }
    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    const service = await db.serviceListing.update({
      where: { id },
      data: updateData,
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatar: true },
        },
      },
    });

    return NextResponse.json({ service });
  } catch (error) {
    console.error('Update service error:', error);
    return NextResponse.json({ error: 'Failed to update service' }, { status: 500 });
  }
}
