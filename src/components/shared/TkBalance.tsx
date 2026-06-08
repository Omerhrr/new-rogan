'use client';

import { Coins } from 'lucide-react';

export function TkBalance({ balance }: { balance: number }) {
  const tkValue = (balance / 100).toFixed(2);

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
      <Coins className="w-3 h-3" />
      {tkValue} TK
    </span>
  );
}
