import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const q = req.nextUrl.searchParams.get('q') || '';
    const role = req.nextUrl.searchParams.get('role') || '';

    const where: Record<string, unknown> = {
      id: { not: user.id },
    };

    if (role) {
      where.role = role;
    }

    if (q.length >= 2) {
      where.OR = [
        { username: { contains: q } },
        { displayName: { contains: q } },
      ];
    }

    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        role: true,
        isLive: true,
      },
      take: 20,
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('User search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
