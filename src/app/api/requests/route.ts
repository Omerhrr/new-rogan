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
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {
      OR: [{ buyerId: user.id }, { creatorId: user.id }],
    };
    if (status) {
      where.status = status;
    }

    const requests = await db.serviceRequest.findMany({
      where,
      include: {
        service: {
          include: {
            creator: { select: { id: true, username: true, displayName: true, avatar: true } },
          },
        },
        buyer: { select: { id: true, username: true, displayName: true, avatar: true } },
        creator: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Get requests error:', error);
    return NextResponse.json({ error: 'Failed to get requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { serviceId, message } = body;

    if (!serviceId || !message) {
      return NextResponse.json({ error: 'Service ID and message are required' }, { status: 400 });
    }

    const service = await db.serviceListing.findUnique({
      where: { id: serviceId },
    });

    if (!service || !service.isActive) {
      return NextResponse.json({ error: 'Service not found or inactive' }, { status: 404 });
    }

    if (service.creatorId === user.id) {
      return NextResponse.json({ error: 'You cannot buy your own service' }, { status: 400 });
    }

    // Check buyer balance
    const ledger = await db.ledgerAccount.findUnique({ where: { userId: user.id } });
    if (!ledger || ledger.tkBalance < service.price) {
      return NextResponse.json({ error: 'Insufficient TK balance' }, { status: 400 });
    }

    // Deduct from buyer (hold funds)
    await db.ledgerAccount.update({
      where: { userId: user.id },
      data: { tkBalance: { decrement: service.price } },
    });

    // Create transaction
    await db.transaction.create({
      data: {
        type: 'service_purchase',
        amount: service.price,
        fromUserId: user.id,
        toUserId: service.creatorId,
        metadata: JSON.stringify({ serviceId, serviceName: service.title }),
      },
    });

    // Create request
    const serviceRequest = await db.serviceRequest.create({
      data: {
        serviceId,
        buyerId: user.id,
        creatorId: service.creatorId,
        message,
        status: 'pending',
        price: service.price,
      },
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

    return NextResponse.json({ request: serviceRequest }, { status: 201 });
  } catch (error) {
    console.error('Create request error:', error);
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }
}
