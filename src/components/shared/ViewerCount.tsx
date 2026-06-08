'use client';

import { Eye } from 'lucide-react';

export function ViewerCount({ count }: { count: number }) {
  const formatCount = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
      <Eye className="w-3 h-3" />
      {formatCount(count)}
    </span>
  );
}
