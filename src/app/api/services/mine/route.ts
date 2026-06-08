import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const services = await db.serviceListing.findMany({
      where: { creatorId: user.id },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatar: true },
        },
        requests: {
          include: {
            buyer: { select: { id: true, username: true, displayName: true, avatar: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ services });
  } catch (error) {
    console.error('Get my services error:', error);
    return NextResponse.json({ error: 'Failed to get my services' }, { status: 500 });
  }
}
