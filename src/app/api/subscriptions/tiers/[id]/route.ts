import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, sanitizeString } from '@/lib/auth';

// PATCH - Update a subscription tier
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    const existingTier = await db.subscriptionTier.findUnique({ where: { id } });
    if (!existingTier) return NextResponse.json({ error: 'Tier not found' }, { status: 404 });
    if (existingTier.creatorId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const sanitizedName = sanitizeString(body.name, 50);
      if (!sanitizedName) return NextResponse.json({ error: 'Tier name cannot be empty' }, { status: 400 });
      updateData.name = sanitizedName;
    }
    if (body.tier !== undefined) {
      if (!['basic', 'premium', 'vip'].includes(body.tier)) {
        return NextResponse.json({ error: 'Invalid tier level' }, { status: 400 });
      }
      updateData.tier = body.tier;
    }
    if (body.price !== undefined) {
      if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price <= 0 || body.price > 10000000) {
        return NextResponse.json({ error: 'Price must be a positive number' }, { status: 400 });
      }
      updateData.price = Math.floor(body.price);
    }
    if (body.benefits !== undefined) {
      if (!Array.isArray(body.benefits)) {
        return NextResponse.json({ error: 'Benefits must be an array' }, { status: 400 });
      }
      const sanitizedBenefits = body.benefits.map((b: unknown) => typeof b === 'string' ? sanitizeString(b, 100) : '').filter(Boolean);
      updateData.benefits = JSON.stringify(sanitizedBenefits);
    }
    if (body.isActive !== undefined) {
      updateData.isActive = Boolean(body.isActive);
    }

    const updated = await db.subscriptionTier.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ tier: updated });
  } catch (error) {
    console.error('Update tier error:', error);
    return NextResponse.json({ error: 'Failed to update tier' }, { status: 500 });
  }
}

// DELETE - Delete a subscription tier
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const existingTier = await db.subscriptionTier.findUnique({ where: { id } });
    if (!existingTier) return NextResponse.json({ error: 'Tier not found' }, { status: 404 });
    if (existingTier.creatorId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await db.subscriptionTier.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete tier error:', error);
    return NextResponse.json({ error: 'Failed to delete tier' }, { status: 500 });
  }
}
