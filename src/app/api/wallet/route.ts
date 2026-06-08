import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const wallet = await db.wallet.findUnique({
      where: { userId: user.id },
    });

    const ledger = await db.ledgerAccount.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({
      wallet,
      tkBalance: ledger?.tkBalance || 0,
      roganEquivalent: (ledger?.tkBalance || 0) / 100,
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    return NextResponse.json({ error: 'Failed to get wallet' }, { status: 500 });
  }
}
