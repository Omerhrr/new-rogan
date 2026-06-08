import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { db } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'rogan-live-jwt-secret-key-2024-super-secure';
const TOKEN_NAME = 'rogan_live_token';
const TOKEN_EXPIRY = '7d';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: { userId: string; email: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): { userId: string; email: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string; role: string };
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

  return user;
}

export function setAuthCookie(token: string): Record<string, string | number | boolean> {
  return {
    name: TOKEN_NAME,
    value: token,
    httpOnly: true,
    secure: false,
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
    secure: false,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };
}
