import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, signToken, setAuthCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, username, password } = body;

    if (!email || !username || !password) {
      return NextResponse.json({ error: 'Email, username, and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const existingUser = await db.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'Email or username already taken' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await db.user.create({
      data: { email, username, passwordHash },
    });

    await db.wallet.create({ data: { userId: user.id } });
    await db.ledgerAccount.create({ data: { userId: user.id, tkBalance: 0 } });

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    const cookieOptions = setAuthCookie(token);

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, username: user.username, role: user.role, displayName: user.displayName, avatar: user.avatar, bio: user.bio },
      token,
    });

    response.cookies.set(cookieOptions as Parameters<typeof response.cookies.set>[0]);
    return response;
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
