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
    const { roganAmount } = body;

    if (!roganAmount || roganAmount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // 1 ROGAN = 100 TK
    const tkAmount = Math.floor(roganAmount * 100);

    // Update ledger
    const ledger = await db.ledgerAccount.upsert({
      where: { userId: user.id },
      update: { tkBalance: { increment: tkAmount } },
      create: { userId: user.id, tkBalance: tkAmount },
    });

    // Create transaction
    await db.transaction.create({
      data: {
        type: 'deposit',
        amount: tkAmount,
        fromUserId: user.id,
        toUserId: user.id,
        metadata: JSON.stringify({ roganAmount, tkAmount, rate: '1 ROGAN = 100 TK' }),
      },
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
