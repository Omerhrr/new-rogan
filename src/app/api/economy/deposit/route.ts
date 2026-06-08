import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // SECURITY: Deposit requires admin role in production
    // In development, allow any user for testing purposes
    if (process.env.NODE_ENV === 'production' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Deposits require admin authorization. Use the payment gateway.' }, { status: 403 });
    }

    const body = await request.json();
    const { roganAmount } = body;

    // SECURITY: Validate amount is a positive finite number within bounds
    if (typeof roganAmount !== 'number' || !Number.isFinite(roganAmount) || roganAmount <= 0 || roganAmount > 100000) {
      return NextResponse.json({ error: 'Invalid amount (must be between 0.01 and 1000 ROGAN)' }, { status: 400 });
    }

    // 1 ROGAN = 100 TK
    const tkAmount = Math.floor(roganAmount * 100);
    if (tkAmount <= 0) {
      return NextResponse.json({ error: 'Amount too small' }, { status: 400 });
    }

    // SECURITY: Wrap in transaction
    const ledger = await db.$transaction(async (tx) => {
      const updatedLedger = await tx.ledgerAccount.upsert({
        where: { userId: user.id },
        update: { tkBalance: { increment: tkAmount } },
        create: { userId: user.id, tkBalance: tkAmount },
      });

      await tx.transaction.create({
        data: {
          type: 'deposit',
          amount: tkAmount,
          fromUserId: user.id,
          toUserId: user.id,
          metadata: JSON.stringify({ roganAmount, tkAmount, rate: '1 ROGAN = 100 TK', note: 'Admin deposit (dev mode)' }),
        },
      });

      return updatedLedger;
    });

    return NextResponse.json({
      tkBalance: ledger.tkBalance,
      deposited: tkAmount,
      roganAmount,
    });
  } catch (error) {
    console.error('Deposit error:', error);
    return NextResponse.json({ error: 'Deposit failed' }, { status: 500 });
  }
}
