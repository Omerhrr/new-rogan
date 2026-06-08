import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, signToken, setAuthCookie, validateEmail, validateUsername, sanitizeString } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, username, password } = body;

    if (!email || !username || !password) {
      return NextResponse.json({ error: 'Email, username, and password are required' }, { status: 400 });
    }

    // SECURITY: Validate email format
    if (!validateEmail(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // SECURITY: Validate username format
    if (!validateUsername(username)) {
      return NextResponse.json({ error: 'Username must be 3-30 characters (letters, numbers, underscores only)' }, { status: 400 });
    }

    // SECURITY: Stronger password policy
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (password.length > 128) {
      return NextResponse.json({ error: 'Password must be at most 128 characters' }, { status: 400 });
    }

    const existingUser = await db.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existingUser) {
      // SECURITY: Generic message to prevent email/username enumeration
      return NextResponse.json({ error: 'Registration failed. Please try different credentials.' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await db.user.create({
      data: { email: email.toLowerCase().trim(), username: username.trim(), passwordHash },
    });

    await db.wallet.create({ data: { userId: user.id } });
    await db.ledgerAccount.create({ data: { userId: user.id, tkBalance: 0 } });

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    const cookieOptions = setAuthCookie(token);

    // SECURITY: Don't return the token in the response body — it's already in httpOnly cookie
    const response = NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role, displayName: user.displayName, avatar: user.avatar, bio: user.bio },
    });

    response.cookies.set(cookieOptions as Parameters<typeof response.cookies.set>[0]);
    return response;
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
