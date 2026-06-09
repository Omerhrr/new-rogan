import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, signToken, setAuthCookie, validateEmail, validateUsername, sanitizeString, rateLimit, getClientId, type CookieOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5/min per IP
    const clientId = getClientId(request);
    if (!rateLimit(`register:ip:${clientId}`, 5, 60 * 1000)) {
      return NextResponse.json({ error: 'Too many registration attempts. Please try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const { email, username, password } = body;

    if (!email || !username || !password) {
      return NextResponse.json({ error: 'Email, username, and password are required' }, { status: 400 });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Validate username format
    if (!validateUsername(username)) {
      return NextResponse.json({ error: 'Username must be 3-30 characters, letters, numbers, and underscores only' }, { status: 400 });
    }

    // Password strength
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (password.length > 128) {
      return NextResponse.json({ error: 'Password too long (max 128 characters)' }, { status: 400 });
    }

    const sanitizedUsername = sanitizeString(username, 30);
    const sanitizedEmail = sanitizeString(email, 254).toLowerCase();

    // Check for existing user with generic error message
    const existingUser = await db.user.findFirst({
      where: { OR: [{ email: sanitizedEmail }, { username: sanitizedUsername }] },
    });

    if (existingUser) {
      // Generic duplicate error message to prevent enumeration
      return NextResponse.json({ error: 'Unable to create account with the provided information' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await db.user.create({
      data: { email: sanitizedEmail, username: sanitizedUsername, passwordHash },
    });

    await db.wallet.create({ data: { userId: user.id } });
    await db.ledgerAccount.create({ data: { userId: user.id, tkBalance: 0 } });

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    const cookieOptions = setAuthCookie(token);

    // SECURITY: Don't return the token in the response body — it's already in httpOnly cookie
    const response = NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role, displayName: user.displayName, avatar: user.avatar, bio: user.bio },
    });

    response.cookies.set(cookieOptions as CookieOptions);
    return response;
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
