import { create } from 'zustand';

interface ServiceReview {
  id: string;
  serviceId: string;
  requestId: string;
  reviewerId: string;
  creatorId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewer: {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
  };
}

interface ReviewState {
  reviews: ServiceReview[];
  avgRating: number;
  totalReviews: number;
  isLoading: boolean;
  error: string | null;
  fetchReviews: (serviceId: string) => Promise<void>;
  createReview: (serviceId: string, requestId: string, rating: number, comment: string) => Promise<boolean>;
}

export const useReviewStore = create<ReviewState>((set) => ({
  reviews: [],
  avgRating: 0,
  totalReviews: 0,
  isLoading: false,
  error: null,

  fetchReviews: async (serviceId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/services/${serviceId}/reviews`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch reviews');
      set({
        reviews: data.reviews,
        avgRating: data.avgRating,
        totalReviews: data.totalReviews,
        isLoading: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  createReview: async (serviceId, requestId, rating, comment) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/services/${serviceId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create review');
      set((state) => ({
        reviews: [data.review, ...state.reviews],
        totalReviews: state.totalReviews + 1,
        isLoading: false,
      }));
      return true;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      return false;
    }
  },
}));
