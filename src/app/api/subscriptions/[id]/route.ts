import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// PATCH - Cancel subscription
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    const subscription = await db.subscription.findUnique({ where: { id } });
    if (!subscription) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    if (subscription.subscriberId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await db.subscription.update({
      where: { id },
      data: { isActive: false, endDate: new Date() },
    });

    return NextResponse.json({ success: true, message: 'Subscription cancelled' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 });
  }
}
