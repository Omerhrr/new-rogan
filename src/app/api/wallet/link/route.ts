import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, sanitizeString } from '@/lib/auth';

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

    // SECURITY: Validate wallet address format and length
    const sanitizedAddress = sanitizeString(walletAddress, 128);
    if (!sanitizedAddress || sanitizedAddress.length < 10) {
      return NextResponse.json({ error: 'Invalid wallet address format' }, { status: 400 });
    }

    // SECURITY: Basic format check for common blockchain addresses (0x... for EVM, etc.)
    const isValidFormat = /^(0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|[48][0-9AB][1-9A-HJ-NP-Za-km-z]{11,})/.test(sanitizedAddress);
    if (!isValidFormat) {
      return NextResponse.json({ error: 'Wallet address format not recognized' }, { status: 400 });
    }

    const wallet = await db.wallet.upsert({
      where: { userId: user.id },
      update: { walletAddress: sanitizedAddress, linkedAt: new Date() },
      create: { userId: user.id, walletAddress: sanitizedAddress, linkedAt: new Date() },
    });

    return NextResponse.json({ wallet: { id: wallet.id, userId: wallet.userId, walletAddress: wallet.walletAddress, linkedAt: wallet.linkedAt } });
  } catch (error) {
    console.error('Link wallet error:', error);
    return NextResponse.json({ error: 'Failed to link wallet' }, { status: 500 });
  }
}
