'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Star, Clock, User, Send, Loader2, Shield } from 'lucide-react';

interface ServiceCreator {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  isLive: boolean;
}

interface ServiceListing {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  category: string;
  price: number;
  deliveryDays: number;
  isActive: boolean;
  rating: number;
  reviewCount: number;
  createdAt: string;
  creator: ServiceCreator;
}

interface ServiceDetailModalProps {
  service: ServiceListing;
  isOpen: boolean;
  onClose: () => void;
  onRequest: (serviceId: string, message: string) => Promise<boolean>;
}

const CATEGORY_LABELS: Record<string, string> = {
  video_call: 'Video Call',
  custom_video: 'Custom Video',
  shoutout: 'Shoutout',
  coaching: 'Coaching',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  video_call: 'bg-green-500/20 text-green-400 border-green-500/30',
  custom_video: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  shoutout: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  coaching: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  other: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export function ServiceDetailModal({ service, isOpen, onClose, onRequest }: ServiceDetailModalProps) {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSubmitting(true);
    const success = await onRequest(service.id, message.trim());
    setIsSubmitting(false);
    if (success) {
      setMessage('');
      onClose();
    }
  };

  if (!isOpen) return null;

  const priceInTk = (service.price / 100).toFixed(0);

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
        className="relative w-full max-w-md bg-[#1A1A1A] rounded-2xl border border-white/10 overflow-hidden max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-white font-bold text-lg">Service Details</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Creator Info */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white font-bold text-lg">
                {service.creator.displayName?.[0] || service.creator.username[0]}
              </div>
              {service.creator.isLive && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-[#1A1A1A]" />
              )}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">
                {service.creator.displayName || service.creator.username}
              </p>
              <p className="text-gray-500 text-xs">@{service.creator.username}</p>
            </div>
          </div>

          {/* Title & Description */}
          <div>
            <h3 className="text-white font-bold text-xl">{service.title}</h3>
            <p className="text-gray-400 text-sm mt-2 leading-relaxed">{service.description}</p>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${CATEGORY_COLORS[service.category] || CATEGORY_COLORS.other}`}>
              {CATEGORY_LABELS[service.category] || service.category}
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-amber-400 font-bold text-lg">{priceInTk}</p>
              <p className="text-gray-500 text-xs">TK</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span className="text-white font-bold text-lg">{service.rating > 0 ? service.rating.toFixed(1) : '-'}</span>
              </div>
              <p className="text-gray-500 text-xs">{service.reviewCount} reviews</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span className="text-white font-bold text-lg">{service.deliveryDays}</span>
              </div>
              <p className="text-gray-500 text-xs">days</p>
            </div>
          </div>

          {/* Secure payment note */}
          <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
            <Shield className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-amber-400/80 text-xs leading-relaxed">
              Payment is held securely until you confirm the service is delivered. Full refund if cancelled before delivery.
            </p>
          </div>
        </div>

        {/* Request Form */}
        <div className="p-4 border-t border-white/10">
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="block text-gray-400 text-xs font-medium mb-1.5">Your message to the creator</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe what you need..."
                rows={2}
                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-red-500/50 resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !message.trim()}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Requesting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Request for {priceInTk} TK
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
