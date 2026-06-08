import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, sanitizeString } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const fullUser = await db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        role: true,
        isLive: true,
        createdAt: true,
        wallet: true,
        ledgerAccount: true,
      },
    });

    const followerCount = await db.follow.count({
      where: { followingId: user.id },
    });
    const followingCount = await db.follow.count({
      where: { followerId: user.id },
    });

    return NextResponse.json({ user: { ...fullUser, followerCount, followingCount } });
  } catch (error) {
    console.error('Get me error:', error);
    return NextResponse.json({ error: 'Failed to get user' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { displayName, avatar, bio } = body;

    // SECURITY: Sanitize all user-provided text fields to prevent XSS
    const sanitizedData: Record<string, string | null> = {};
    if (displayName !== undefined) {
      sanitizedData.displayName = sanitizeString(displayName, 50);
    }
    if (avatar !== undefined) {
      // Avatar should be a URL — validate it looks like one
      const sanitizedAvatar = sanitizeString(avatar, 500);
      if (sanitizedAvatar && !sanitizedAvatar.match(/^https?:\/\//i)) {
        return NextResponse.json({ error: 'Avatar must be a valid URL' }, { status: 400 });
      }
      sanitizedData.avatar = sanitizedAvatar || null;
    }
    if (bio !== undefined) {
      sanitizedData.bio = sanitizeString(bio, 500);
    }

    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: sanitizedData,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        role: true,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
