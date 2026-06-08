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
    const { tkAmount } = body;

    // SECURITY: Validate amount is a positive finite number within bounds
    if (typeof tkAmount !== 'number' || !Number.isFinite(tkAmount) || tkAmount <= 0 || tkAmount > 100000000) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // SECURITY: Wrap in transaction to prevent race conditions
    const result = await db.$transaction(async (tx) => {
      const ledger = await tx.ledgerAccount.findUnique({
        where: { userId: user.id },
      });

      if (!ledger || ledger.tkBalance < tkAmount) {
        throw new Error('Insufficient TK balance');
      }

      // Deduct from ledger
      const updatedLedger = await tx.ledgerAccount.update({
        where: { userId: user.id },
        data: { tkBalance: { decrement: tkAmount } },
      });

      const roganAmount = tkAmount / 100;

      // Create transaction
      await tx.transaction.create({
        data: {
          type: 'withdraw',
          amount: tkAmount,
          fromUserId: user.id,
          toUserId: user.id,
          metadata: JSON.stringify({ roganAmount, tkAmount, rate: '100 TK = 1 ROGAN' }),
        },
      });

      return { tkBalance: updatedLedger.tkBalance, withdrawn: tkAmount, roganAmount };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Insufficient TK balance') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Withdraw error:', error);
    return NextResponse.json({ error: 'Withdrawal failed' }, { status: 500 });
  }
}
