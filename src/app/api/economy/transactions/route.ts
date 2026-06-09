import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { parsePagination, paginateResults } from '@/lib/pagination';

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { limit, cursor } = parsePagination(request);

    const transactions = await db.transaction.findMany({
      where: {
        OR: [{ fromUserId: user.id }, { toUserId: user.id }],
      },
      include: {
        fromUser: { select: { id: true, username: true, displayName: true, avatar: true } },
        toUser: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor
        ? { skip: 1, cursor: { id: cursor } }
        : {}),
    });

    const paginated = paginateResults(transactions, limit);

    return NextResponse.json({ transactions: paginated.data, pagination: paginated.pagination });
  } catch (error) {
    console.error('Transactions error:', error);
    return NextResponse.json({ error: 'Failed to get transactions' }, { status: 500 });
  }
}
