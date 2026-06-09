import { NextResponse } from 'next/server';
import { getUserFromRequest, signToken } from '@/lib/auth';

/**
 * GET /api/auth/ws-token
 * Issues a short-lived JWT token for WebSocket authentication.
 * This is needed because the main auth cookie is httpOnly and
 * cannot be read by client-side JavaScript (document.cookie).
 */
export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Issue a short-lived token (5 minutes) specifically for WS auth
    const wsToken = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return NextResponse.json({ token: wsToken });
  } catch {
    return NextResponse.json({ error: 'Failed to generate WS token' }, { status: 500 });
  }
}
