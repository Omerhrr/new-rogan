import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, signToken, setAuthCookie, validateEmail } from '@/lib/auth';

// SECURITY: Simple in-memory rate limiter for login attempts
const loginAttempts: Record<string, { count: number; lastAttempt: number }> = {};
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 10;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // SECURITY: Rate limiting by email
    const now = Date.now();
    const attempts = loginAttempts[email];
    if (attempts && attempts.count >= MAX_LOGIN_ATTEMPTS && (now - attempts.lastAttempt) < RATE_LIMIT_WINDOW) {
      return NextResponse.json({ error: 'Too many login attempts. Please try again later.' }, { status: 429 });
    }

    const user = await db.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash) {
      // SECURITY: Generic error message to prevent user enumeration
      incrementAttempts(email, now);
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      incrementAttempts(email, now);
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Clear rate limit on successful login
    delete loginAttempts[email];

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    const cookieOptions = setAuthCookie(token);

    // SECURITY: Don't return the token in the response body — it's already in httpOnly cookie
    const response = NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role, displayName: user.displayName, avatar: user.avatar, bio: user.bio },
    });

    response.cookies.set(cookieOptions as Parameters<typeof response.cookies.set>[0]);
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}

function incrementAttempts(email: string, now: number) {
  const attempts = loginAttempts[email];
  if (attempts && (now - attempts.lastAttempt) < RATE_LIMIT_WINDOW) {
    attempts.count++;
    attempts.lastAttempt = now;
  } else {
    loginAttempts[email] = { count: 1, lastAttempt: now };
  }
}
