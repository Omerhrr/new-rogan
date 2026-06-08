'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useGiftStore, GIFT_TYPES, type GiftAnimation } from '@/stores/giftStore';
import { useEffect } from 'react';

export function GiftOverlay() {
  const { animations, removeAnimation } = useGiftStore();

  useEffect(() => {
    animations.forEach((anim) => {
      const timer = setTimeout(() => {
        removeAnimation(anim.id);
      }, 3000);
      return () => clearTimeout(timer);
    });
  }, [animations, removeAnimation]);

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      <AnimatePresence>
        {animations.map((anim) => {
          const giftInfo = GIFT_TYPES[anim.giftType as keyof typeof GIFT_TYPES];
          if (!giftInfo) return null;

          return (
            <motion.div
              key={anim.id}
              initial={{ x: -100, y: 0, opacity: 0, scale: 0.5 }}
              animate={{
                x: Math.random() * 200 + 50,
                y: -300 - Math.random() * 200,
                opacity: [0, 1, 1, 0],
                scale: [0.5, 1.2, 1, 0.8],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 3, ease: 'easeOut' }}
              className="absolute bottom-20 left-10"
            >
              <div className="flex flex-col items-center gap-1">
                <span className="text-4xl">{giftInfo.emoji}</span>
                <span className="text-white text-xs font-bold bg-black/60 rounded-full px-2 py-0.5">
                  {anim.senderName}
                </span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
