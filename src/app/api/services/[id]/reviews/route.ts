import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET - List reviews for a service
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const reviews = await db.serviceReview.findMany({
      where: { serviceId: id },
      include: {
        reviewer: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    return NextResponse.json({ reviews, avgRating, totalReviews: reviews.length });
  } catch (error) {
    console.error('Fetch reviews error:', error);
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 });
  }
}

// POST - Create a review (buyer only, after request completed)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { requestId, rating, comment } = body;

    if (!requestId || !rating) {
      return NextResponse.json({ error: 'requestId and rating are required' }, { status: 400 });
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
    }

    // Verify the service exists
    const service = await db.serviceListing.findUnique({ where: { id } });
    if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 });

    // Verify the request exists and is completed
    const serviceRequest = await db.serviceRequest.findUnique({ where: { id: requestId } });
    if (!serviceRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    if (serviceRequest.buyerId !== user.id) return NextResponse.json({ error: 'Only the buyer can review' }, { status: 403 });
    if (serviceRequest.status !== 'completed') return NextResponse.json({ error: 'Can only review completed requests' }, { status: 400 });
    if (serviceRequest.serviceId !== id) return NextResponse.json({ error: 'Request does not belong to this service' }, { status: 400 });

    // Check if already reviewed
    const existingReview = await db.serviceReview.findUnique({ where: { requestId } });
    if (existingReview) return NextResponse.json({ error: 'Already reviewed this request' }, { status: 400 });

    const review = await db.serviceReview.create({
      data: {
        serviceId: id,
        requestId,
        reviewerId: user.id,
        creatorId: service.creatorId,
        rating,
        comment: comment || null,
      },
      include: {
        reviewer: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
    });

    // Update service rating
    const allReviews = await db.serviceReview.findMany({
      where: { serviceId: id },
      select: { rating: true },
    });
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

    await db.serviceListing.update({
      where: { id },
      data: { rating: Math.round(avgRating * 10) / 10, reviewCount: allReviews.length },
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    console.error('Create review error:', error);
    return NextResponse.json({ error: 'Failed to create review' }, { status: 500 });
  }
}
