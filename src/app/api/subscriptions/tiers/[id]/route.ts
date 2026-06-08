import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

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
    if (body.name !== undefined) updateData.name = body.name;
    if (body.tier !== undefined) {
      if (!['basic', 'premium', 'vip'].includes(body.tier)) {
        return NextResponse.json({ error: 'Invalid tier level' }, { status: 400 });
      }
      updateData.tier = body.tier;
    }
    if (body.price !== undefined) updateData.price = Math.max(0, body.price);
    if (body.benefits !== undefined) updateData.benefits = JSON.stringify(body.benefits);
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

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
