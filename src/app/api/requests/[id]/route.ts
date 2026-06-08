import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, deliveryMessage } = body;

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    const existing = await db.serviceRequest.findUnique({
      where: { id },
      include: { service: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const isCreator = existing.creatorId === user.id;
    const isBuyer = existing.buyerId === user.id;

    if (!isCreator && !isBuyer) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Status transition validation
    const validTransitions: Record<string, string[]> = {
      pending: ['accepted', 'cancelled'],
      accepted: ['in_progress', 'cancelled'],
      in_progress: ['delivered', 'cancelled'],
      delivered: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    const allowed = validTransitions[existing.status] || [];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: `Cannot transition from ${existing.status} to ${status}` }, { status: 400 });
    }

    // Role-based status transition check
    if (status === 'accepted' && !isCreator) {
      return NextResponse.json({ error: 'Only the creator can accept requests' }, { status: 403 });
    }
    if (status === 'in_progress' && !isCreator) {
      return NextResponse.json({ error: 'Only the creator can start work' }, { status: 403 });
    }
    if (status === 'delivered' && !isCreator) {
      return NextResponse.json({ error: 'Only the creator can deliver' }, { status: 403 });
    }
    if (status === 'completed' && !isBuyer) {
      return NextResponse.json({ error: 'Only the buyer can confirm completion' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = { status };
    if (status === 'delivered' && deliveryMessage) {
      updateData.deliveryMessage = deliveryMessage;
    }

    // Handle completion: release funds to creator (minus 10% platform fee)
    if (status === 'completed') {
      const platformFee = Math.floor(existing.price * 0.1);
      const creatorPayout = existing.price - platformFee;

      await db.ledgerAccount.upsert({
        where: { userId: existing.creatorId },
        update: { tkBalance: { increment: creatorPayout } },
        create: { userId: existing.creatorId, tkBalance: creatorPayout },
      });

      await db.transaction.create({
        data: {
          type: 'service_payout',
          amount: creatorPayout,
          fromUserId: existing.buyerId,
          toUserId: existing.creatorId,
          referenceId: existing.id,
          metadata: JSON.stringify({ platformFee, originalPrice: existing.price }),
        },
      });
    }

    // Handle cancellation: refund buyer
    if (status === 'cancelled') {
      await db.ledgerAccount.upsert({
        where: { userId: existing.buyerId },
        update: { tkBalance: { increment: existing.price } },
        create: { userId: existing.buyerId, tkBalance: existing.price },
      });

      await db.transaction.create({
        data: {
          type: 'service_refund',
          amount: existing.price,
          fromUserId: existing.creatorId,
          toUserId: existing.buyerId,
          referenceId: existing.id,
          metadata: JSON.stringify({ reason: 'cancelled' }),
        },
      });
    }

    const updated = await db.serviceRequest.update({
      where: { id },
      data: updateData,
      include: {
        service: {
          include: {
            creator: { select: { id: true, username: true, displayName: true, avatar: true } },
          },
        },
        buyer: { select: { id: true, username: true, displayName: true, avatar: true } },
        creator: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
    });

    return NextResponse.json({ request: updated });
  } catch (error) {
    console.error('Update request error:', error);
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 });
  }
}
