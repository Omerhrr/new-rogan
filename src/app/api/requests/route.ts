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

    // SECURITY: Sanitize message
    const sanitizedMessage = sanitizeString(message, 1000);
    if (!sanitizedMessage) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
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

    // SECURITY: Wrap financial operations in transaction to prevent race conditions
    const serviceRequest = await db.$transaction(async (tx) => {
      // Check buyer balance within transaction
      const ledger = await tx.ledgerAccount.findUnique({ where: { userId: user.id } });
      if (!ledger || ledger.tkBalance < service.price) {
        throw new Error('Insufficient TK balance');
      }

      // Deduct from buyer (hold funds)
      await tx.ledgerAccount.update({
        where: { userId: user.id },
        data: { tkBalance: { decrement: service.price } },
      });

      // Create transaction
      await tx.transaction.create({
        data: {
          type: 'service_purchase',
          amount: service.price,
          fromUserId: user.id,
          toUserId: service.creatorId,
          metadata: JSON.stringify({ serviceId, serviceName: service.title }),
        },
      });

      // Create request
      return tx.serviceRequest.create({
        data: {
          serviceId,
          buyerId: user.id,
          creatorId: service.creatorId,
          message: sanitizedMessage,
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
    });

    return NextResponse.json({ request: serviceRequest }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Insufficient TK balance') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Create request error:', error);
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }
}
