import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, signToken, setAuthCookie, rateLimit, getClientId, type CookieOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Rate limiting by both email and IP (dual-key prevents distributed attacks)
    const clientId = getClientId(request);
    if (!rateLimit(`login:ip:${clientId}`, 20, 15 * 60_000)) {
      return NextResponse.json({ error: 'Too many login attempts from this IP. Please try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Rate limit per email
    if (!rateLimit(`login:email:${email}`, 10, 15 * 60_000)) {
      return NextResponse.json({ error: 'Too many login attempts. Please try again later.' }, { status: 429 });
    }

    const user = await db.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash) {
      // Generic error message to prevent user enumeration
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    const cookieOptions = setAuthCookie(token);

    // SECURITY: Don't return the token in the response body — it's already in httpOnly cookie
    const response = NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role, displayName: user.displayName, avatar: user.avatar, bio: user.bio },
    });

    response.cookies.set(cookieOptions as CookieOptions);
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
