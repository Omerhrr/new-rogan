import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth';

export async function POST() {
  try {
    const cookieOptions = clearAuthCookie();
    const response = NextResponse.json({ message: 'Logged out successfully' });
    response.cookies.set(cookieOptions as Parameters<typeof response.cookies.set>[0]);
    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
