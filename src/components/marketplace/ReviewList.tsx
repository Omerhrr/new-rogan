'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Star, Loader2, MessageSquare } from 'lucide-react';
import { useReviewStore } from '@/stores/reviewStore';

interface ReviewListProps {
  serviceId: string;
}

export function ReviewList({ serviceId }: ReviewListProps) {
  const { reviews, avgRating, totalReviews, isLoading, fetchReviews } = useReviewStore();

  useEffect(() => {
    fetchReviews(serviceId);
  }, [serviceId, fetchReviews]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center py-4">
        <MessageSquare className="w-6 h-6 text-gray-600 mx-auto mb-1" />
        <p className="text-gray-600 text-xs">No reviews yet</p>
      </div>
    );
  }

  return (
    <div>
      {/* Average Rating */}
      <div className="flex items-center gap-3 mb-4 p-3 bg-white/5 rounded-xl">
        <div className="text-center min-w-[60px]">
          <p className="text-2xl font-black text-amber-400">{avgRating.toFixed(1)}</p>
          <div className="flex items-center gap-0.5 mt-1 justify-center">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-3 h-3 ${
                  star <= Math.round(avgRating) ? 'text-amber-400 fill-amber-400' : 'text-gray-600'
                }`}
              />
            ))}
          </div>
        </div>
        <div className="text-xs text-gray-400">
          <span className="text-white font-semibold">{totalReviews}</span> review{totalReviews !== 1 ? 's' : ''}
        </div>
        {/* Rating distribution bar */}
        <div className="flex-1 ml-2">
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(avgRating / 5) * 100}%` }}
              transition={{ duration: 0.5 }}
              className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
            />
          </div>
        </div>
      </div>

      {/* Review items */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {reviews.map((review, index) => (
          <motion.div
            key={review.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white/5 rounded-xl p-3 hover:bg-white/[0.07] transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                {review.reviewer.displayName?.[0] || review.reviewer.username[0]}
              </div>
              <span className="text-white text-xs font-medium">{review.reviewer.displayName || review.reviewer.username}</span>
              <div className="flex items-center gap-0.5 ml-auto">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-3 h-3 ${
                      star <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-600'
                    }`}
                  />
                ))}
              </div>
            </div>
            {review.comment && (
              <p className="text-gray-400 text-xs leading-relaxed pl-9">{review.comment}</p>
            )}
            <p className="text-gray-600 text-[10px] mt-1.5 pl-9">
              {new Date(review.createdAt).toLocaleDateString()}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
