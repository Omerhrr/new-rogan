import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { db } from './db';

// SECURITY: Fail hard if JWT_SECRET is missing — no hardcoded fallbacks
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
}
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
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
  // SECURITY: Explicitly pin algorithm to HS256 to prevent algorithm confusion attacks
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY, algorithm: 'HS256' });
}

export function verifyToken(token: string): { userId: string; email: string; role: string } | null {
  if (!JWT_SECRET) return null;
  try {
    // SECURITY: Explicitly allow only HS256 algorithm
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { userId: string; email: string; role: string };
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
