import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const ledger = await db.ledgerAccount.findUnique({
      where: { userId: user.id },
    });

    const tkBalance = ledger?.tkBalance || 0;
    const roganEquivalent = tkBalance / 100;

    return NextResponse.json({ tkBalance, roganEquivalent });
  } catch (error) {
    console.error('Balance error:', error);
    return NextResponse.json({ error: 'Failed to get balance' }, { status: 500 });
  }
}
