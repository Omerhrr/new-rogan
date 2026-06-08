import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, sanitizeString } from '@/lib/auth';

// GET - List subscription tiers
// If creatorId is provided, return tiers for that creator
// If no creatorId, return all active tiers with creator info (for browse/discover)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const creatorId = searchParams.get('creatorId');

    if (creatorId) {
      // Return tiers for a specific creator
      const tiers = await db.subscriptionTier.findMany({
        where: { creatorId, isActive: true },
        orderBy: { price: 'asc' },
        include: {
          creator: {
            select: { id: true, username: true, displayName: true, avatar: true, isLive: true },
          },
        },
      });

      return NextResponse.json({ tiers });
    }

    // Return all active tiers with creator info (for browse)
    const tiers = await db.subscriptionTier.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatar: true, isLive: true },
        },
      },
      take: 50, // SECURITY: Limit results
    });

    return NextResponse.json({ tiers });
  } catch (error) {
    console.error('Fetch tiers error:', error);
    return NextResponse.json({ error: 'Failed to fetch tiers' }, { status: 500 });
  }
}

// POST - Create a subscription tier (creator only)
export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'creator') return NextResponse.json({ error: 'Only creators can create tiers' }, { status: 403 });

    const body = await request.json();
    const { name, tier, price, benefits } = body;

    if (!name || !tier || !price) {
      return NextResponse.json({ error: 'Name, tier, and price are required' }, { status: 400 });
    }

    if (!['basic', 'premium', 'vip'].includes(tier)) {
      return NextResponse.json({ error: 'Tier must be basic, premium, or vip' }, { status: 400 });
    }

    // SECURITY: Validate and sanitize name
    const sanitizedName = sanitizeString(name, 50);
    if (!sanitizedName) {
      return NextResponse.json({ error: 'Tier name cannot be empty' }, { status: 400 });
    }

    // SECURITY: Validate price — must be positive and reasonable
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 100 || price > 10000000) {
      return NextResponse.json({ error: 'Price must be between 1 and 100,000 TK' }, { status: 400 });
    }

    // SECURITY: Validate benefits array
    const safeBenefits = Array.isArray(benefits)
      ? benefits.filter((b: unknown) => typeof b === 'string').map((b: string) => sanitizeString(b, 100)).filter(Boolean).slice(0, 10)
      : [];

    const subscriptionTier = await db.subscriptionTier.create({
      data: {
        creatorId: user.id,
        name: sanitizedName,
        tier,
        price: Math.floor(price),
        benefits: JSON.stringify(safeBenefits),
        isActive: true,
      },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatar: true, isLive: true },
        },
      },
    });

    return NextResponse.json({ tier: subscriptionTier }, { status: 201 });
  } catch (error) {
    console.error('Create tier error:', error);
    return NextResponse.json({ error: 'Failed to create tier' }, { status: 500 });
  }
}
