import { NextResponse } from 'next/server';
import { clearAuthCookie, type CookieOptions } from '@/lib/auth';

export async function POST() {
  try {
    const cookieOptions = clearAuthCookie();
    const response = NextResponse.json({ message: 'Logged out successfully' });
    response.cookies.set(cookieOptions as CookieOptions);
    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
