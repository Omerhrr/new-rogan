import { NextResponse } from 'next/server';
import { getUserFromRequest, signToken } from '@/lib/auth';
import { createHash } from 'crypto';

// Diagnostic: compute hash of the secret being used (matches WS server log)
const EFFECTIVE_SECRET = process.env.JWT_SECRET || 'rogan-live-dev-only-insecure-secret';
const secretHash = createHash('sha256').update(EFFECTIVE_SECRET).digest('hex').slice(0, 8);

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

    // Include secret hash in response for debugging (not the actual secret!)
    return NextResponse.json({
      token: wsToken,
      _debug: { secretHash },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to generate WS token' }, { status: 500 });
  }
}
