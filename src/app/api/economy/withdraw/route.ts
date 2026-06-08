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

    if (!tkAmount || tkAmount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const ledger = await db.ledgerAccount.findUnique({
      where: { userId: user.id },
    });

    if (!ledger || ledger.tkBalance < tkAmount) {
      return NextResponse.json({ error: 'Insufficient TK balance' }, { status: 400 });
    }

    // Deduct from ledger
    const updatedLedger = await db.ledgerAccount.update({
      where: { userId: user.id },
      data: { tkBalance: { decrement: tkAmount } },
    });

    const roganAmount = tkAmount / 100;

    // Create transaction
    await db.transaction.create({
      data: {
        type: 'withdraw',
        amount: tkAmount,
        fromUserId: user.id,
        toUserId: user.id,
        metadata: JSON.stringify({ roganAmount, tkAmount, rate: '100 TK = 1 ROGAN' }),
      },
    });

    return NextResponse.json({
      tkBalance: updatedLedger.tkBalance,
      withdrawn: tkAmount,
      roganAmount,
    });
  } catch (error) {
    console.error('Withdraw error:', error);
    return NextResponse.json({ error: 'Withdrawal failed' }, { status: 500 });
  }
}
