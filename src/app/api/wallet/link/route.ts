import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const wallet = await db.wallet.upsert({
      where: { userId: user.id },
      update: { walletAddress, linkedAt: new Date() },
      create: { userId: user.id, walletAddress, linkedAt: new Date() },
    });

    return NextResponse.json({ wallet });
  } catch (error) {
    console.error('Link wallet error:', error);
    return NextResponse.json({ error: 'Failed to link wallet' }, { status: 500 });
  }
}
