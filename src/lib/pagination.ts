import { NextRequest } from 'next/server';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export interface PaginationParams {
  limit: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { hasMore: boolean; nextCursor: string | null; limit: number };
}

export function parsePagination(request: NextRequest): PaginationParams {
  const { searchParams } = request.nextUrl;
  const rawLimit = searchParams.get('limit');
  let limit = DEFAULT_LIMIT;
  if (rawLimit) {
    const parsed = parseInt(rawLimit, 10);
    if (!isNaN(parsed) && parsed > 0) limit = Math.min(parsed, MAX_LIMIT);
  }
  const cursor = searchParams.get('cursor') || undefined;
  return { limit, cursor };
}

export function paginateResults<T extends { id: string }>(results: T[], limit: number): PaginatedResponse<T> {
  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;
  return { data, pagination: { hasMore, nextCursor, limit } };
}
