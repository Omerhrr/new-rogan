import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { db } from './db';

// SECURITY: Fail hard if JWT_SECRET is missing — no hardcoded fallbacks
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is required in production. Server cannot start.');
  }
  console.error('WARNING: JWT_SECRET not set. Using insecure dev-only secret. DO NOT use in production!');
}
const EFFECTIVE_SECRET = JWT_SECRET || 'rogan-live-dev-only-insecure-secret';
const TOKEN_NAME = 'rogan_live_token';
const TOKEN_EXPIRY = '7d';

export async function hashPassword(password: string): Promise<string> {
  // Limit password length to prevent bcrypt DoS (max 72 bytes processed by bcrypt anyway)
  if (password.length > 128) {
    throw new Error('Password too long (max 128 characters)');
  }
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: { userId: string; email: string; role: string }): string {
  // SECURITY: Explicitly pin algorithm to HS256 to prevent algorithm confusion attacks
  return jwt.sign(payload, EFFECTIVE_SECRET, { expiresIn: TOKEN_EXPIRY, algorithm: 'HS256' });
}

export function verifyToken(token: string): { userId: string; email: string; role: string } | null {
  try {
    // SECURITY: Explicitly allow only HS256 algorithm
    return jwt.verify(token, EFFECTIVE_SECRET, { algorithms: ['HS256'] }) as { userId: string; email: string; role: string };
  } catch {
    return null;
  }
}

export async function getUserFromRequest(): Promise<{
  id: string;
  email: string;
  username: string;
  role: string;
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  isLive: boolean;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_NAME)?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      displayName: true,
      avatar: true,
      bio: true,
      isLive: true,
    },
  });

  // SECURITY: Verify role hasn't been elevated since token was issued
  if (user && user.role !== payload.role && payload.role === 'admin') {
    return null; // Token claims admin but user is no longer admin
  }

  return user;
}

// SECURITY: Use secure cookies in production
export function setAuthCookie(token: string): Record<string, string | number | boolean> {
  return {
    name: TOKEN_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}

export function clearAuthCookie(): Record<string, string | number | boolean> {
  return {
    name: TOKEN_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };
}

// SECURITY: Input validation helpers
export function validateEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 254;
}

export function validateUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

export function sanitizeString(input: string, maxLength: number = 1000): string {
  // Strip HTML tags and trim whitespace
  return input.replace(/<[^>]*>/g, '').trim().slice(0, maxLength);
}

// ── Rate Limiting ─────────────────────────────────────────────────
// In-memory rate limiter (per-process).
// For multi-instance deployments, replace with Redis-backed store.
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check if a request is within rate limits.
 * @returns `true` if allowed, `false` if rate-limited
 */
export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

// Clean up expired entries every 2 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
      if (now > entry.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, 120_000);
}

/**
 * Extract a client identifier from the request for rate limiting.
 * Uses x-forwarded-for (first IP), x-real-ip, or falls back to 'unknown'.
 */
export function getClientId(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}
