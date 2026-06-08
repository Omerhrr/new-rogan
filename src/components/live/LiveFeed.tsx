'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStreamStore } from '@/stores/streamStore';
import { LiveBadge } from '@/components/shared/LiveBadge';
import { ViewerCount } from '@/components/shared/ViewerCount';
import { MessageCircle, Gift, ChevronUp, ChevronDown } from 'lucide-react';

interface LiveFeedProps {
  onEnterStream: (streamId: string) => void;
}

const GRADIENTS = [
  'from-red-900 via-purple-900 to-black',
  'from-blue-900 via-indigo-900 to-black',
  'from-green-900 via-teal-900 to-black',
  'from-orange-900 via-red-900 to-black',
  'from-purple-900 via-pink-900 to-black',
  'from-cyan-900 via-blue-900 to-black',
  'from-amber-900 via-orange-900 to-black',
  'from-rose-900 via-red-900 to-black',
];

export function LiveFeed({ onEnterStream }: LiveFeedProps) {
  const { streams, fetchStreams, isLoading } = useStreamStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStreams();
  }, [fetchStreams]);

  const goToNext = useCallback(() => {
    if (streams.length > 0 && currentIndex < streams.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [streams.length, currentIndex]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientY;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goToNext();
      else goToPrev();
    }
    setTouchStart(null);
  };

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) goToNext();
      else goToPrev();
    };

    const el = containerRef.current;
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: false });
      return () => el.removeEventListener('wheel', handleWheel);
    }
  }, [goToNext, goToPrev]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') goToNext();
      if (e.key === 'ArrowUp' || e.key === 'k') goToPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev]);

  const currentStream = streams[currentIndex];

  if (isLoading) {
    return (
      <div className="h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading live streams...</p>
        </div>
      </div>
    );
  }

  if (streams.length === 0) {
    return (
      <div className="h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-[#1A1A1A] flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-10 h-10 text-gray-600" />
          </div>
          <p className="text-gray-400 text-lg font-semibold">No Live Streams</p>
          <p className="text-gray-600 text-sm mt-1">Check back soon!</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-screen bg-black overflow-hidden relative"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStream?.id || 'empty'}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0"
        >
          {currentStream && (
            <>
              {/* Animated gradient background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${GRADIENTS[currentIndex % GRADIENTS.length]}`}>
                {/* Animated particles */}
                <div className="absolute inset-0 overflow-hidden">
                  {[...Array(20)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-1 h-1 bg-white/20 rounded-full"
                      style={{
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                      }}
                      animate={{
                        y: [0, -30, 0],
                        opacity: [0.2, 0.6, 0.2],
                      }}
                      transition={{
                        duration: 2 + Math.random() * 3,
                        repeat: Infinity,
                        delay: Math.random() * 2,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Top gradient overlay */}
              <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/60 to-transparent z-10" />

              {/* Top bar: creator info */}
              <div className="absolute top-4 left-4 right-4 z-20 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white font-bold text-lg ring-2 ring-white/20">
                      {currentStream.creator.displayName?.[0] || currentStream.creator.username[0]}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5">
                      <LiveBadge className="text-[8px] px-1 py-0" />
                    </div>
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">
                      {currentStream.creator.displayName || currentStream.creator.username}
                    </p>
                    <p className="text-gray-300 text-xs">
                      @{currentStream.creator.username}
                    </p>
                  </div>
                </div>
                <ViewerCount count={currentStream.viewerCount} />
              </div>

              {/* Stream title overlay */}
              <div className="absolute bottom-24 left-4 right-16 z-20">
                <h2 className="text-white font-bold text-xl drop-shadow-lg">
                  {currentStream.title}
                </h2>
                {currentStream.description && (
                  <p className="text-gray-300 text-sm mt-1 line-clamp-2">
                    {currentStream.description}
                  </p>
                )}
              </div>

              {/* Right side action buttons */}
              <div className="absolute right-3 bottom-28 z-20 flex flex-col items-center gap-4">
                <button
                  onClick={() => onEnterStream(currentStream.id)}
                  className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-95"
                >
                  <MessageCircle className="w-6 h-6" />
                </button>
                <button
                  onClick={() => onEnterStream(currentStream.id)}
                  className="w-12 h-12 rounded-full bg-red-500/80 backdrop-blur-md flex items-center justify-center text-white hover:bg-red-600 transition-all active:scale-95 shadow-lg shadow-red-500/30"
                >
                  <Gift className="w-6 h-6" />
                </button>
              </div>

              {/* Bottom gradient */}
              <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/80 to-transparent z-10" />

              {/* Tap to enter */}
              <button
                onClick={() => onEnterStream(currentStream.id)}
                className="absolute inset-0 z-0 cursor-pointer"
                aria-label="Enter live stream"
              />
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation indicators */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-2">
        <button
          onClick={goToPrev}
          disabled={currentIndex === 0}
          className="w-8 h-8 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-white/60 hover:text-white disabled:opacity-30 transition-all"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <div className="flex flex-col items-center gap-1 py-2">
          {streams.slice(Math.max(0, currentIndex - 2), currentIndex + 3).map((s, i) => {
            const actualIndex = Math.max(0, currentIndex - 2) + i;
            return (
              <div
                key={s.id}
                className={`w-1.5 rounded-full transition-all ${
                  actualIndex === currentIndex
                    ? 'h-6 bg-red-500'
                    : 'h-1.5 bg-white/30'
                }`}
              />
            );
          })}
        </div>
        <button
          onClick={goToNext}
          disabled={currentIndex >= streams.length - 1}
          className="w-8 h-8 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-white/60 hover:text-white disabled:opacity-30 transition-all"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
