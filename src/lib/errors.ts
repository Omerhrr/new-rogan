// ── Rogan Live · Consistent API Error Handling ─────────────────────
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

/**
 * Centralized API error handler.
 * - Validation/auth errors: safe to return details to client
 * - Prisma errors: mapped to safe messages
 * - Unknown errors: generic 500, never expose internals
 */
export function handleApiError(error: unknown): NextResponse {
  // Deliberate business-logic throws with safe messages
  if (error instanceof Error) {
    switch (error.message) {
      case 'Insufficient TK balance':
        return NextResponse.json({ error: error.message }, { status: 400 });
      case 'Insufficient balance':
        return NextResponse.json({ error: error.message }, { status: 400 });
      case 'UNAUTHORIZED':
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      case 'FORBIDDEN':
        return NextResponse.json({ error: 'You do not have permission to do this' }, { status: 403 });
      case 'NOT_FOUND':
        return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
      case 'RATE_LIMITED':
        return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    // Check for our custom validation error pattern
    if (error.message.startsWith('VALIDATION:')) {
      return NextResponse.json({ error: error.message.replace('VALIDATION: ', '') }, { status: 400 });
    }
  }

  // Prisma unique constraint violation (e.g. duplicate username/email)
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = (error.meta?.target as string[])?.join(', ') || 'field';
    return NextResponse.json({ error: `A record with this ${target} already exists` }, { status: 409 });
  }

  // Prisma record not found
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }

  // Never expose internal error details in production
  console.error('[API Error]', error);
  return NextResponse.json({ error: 'An internal error occurred' }, { status: 500 });
}
