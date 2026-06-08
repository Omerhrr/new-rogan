'use client';

import { motion } from 'framer-motion';

export function LiveBadge({ className = '' }: { className?: string }) {
  return (
    <motion.span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-600 text-white ${className}`}
      animate={{ opacity: [1, 0.7, 1] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
      LIVE
    </motion.span>
  );
}
