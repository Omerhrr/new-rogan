'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Star, Loader2, MessageSquare } from 'lucide-react';
import { useReviewStore } from '@/stores/reviewStore';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceId: string;
  requestId: string;
  creatorName: string;
}

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

export function ReviewModal({ isOpen, onClose, serviceId, requestId, creatorName }: ReviewModalProps) {
  const { createReview, isLoading } = useReviewStore();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) return;

    const success = await createReview(serviceId, requestId, rating, comment.trim());
    if (success) {
      setRating(0);
      setComment('');
      onClose();
    }
  };

  if (!isOpen) return null;

  const displayRating = hoveredRating || rating;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-md bg-[#1A1A1A] rounded-2xl border border-white/10 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-amber-400" />
            <h2 className="text-white font-bold text-lg">Leave a Review</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-5">
          {/* Creator name */}
          <p className="text-gray-400 text-sm">
            Reviewing service by <span className="text-white font-medium">{creatorName}</span>
          </p>

          {/* Star Rating */}
          <div>
            <label className="block text-gray-400 text-xs font-medium mb-3">Rating</label>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-125"
                >
                  <Star
                    className={`w-10 h-10 transition-all ${
                      star <= displayRating
                        ? 'text-amber-400 fill-amber-400 drop-shadow-lg'
                        : 'text-gray-600 hover:text-gray-400'
                    }`}
                  />
                </button>
              ))}
            </div>
            {displayRating > 0 && (
              <motion.p
                key={displayRating}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mt-2"
              >
                <span className="text-amber-400 font-bold text-sm">{displayRating}/5</span>
                <span className="text-gray-400 text-xs ml-2">— {RATING_LABELS[displayRating]}</span>
              </motion.p>
            )}
          </div>

          {/* Comment */}
          <div>
            <label className="block text-gray-400 text-xs font-medium mb-1.5">Comment (optional)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience..."
              rows={3}
              className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-red-500/50 resize-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={rating === 0 || isLoading}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Star className="w-4 h-4 fill-white" />
                Submit Review
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
