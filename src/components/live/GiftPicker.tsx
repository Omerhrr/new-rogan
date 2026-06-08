'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Coins } from 'lucide-react';
import { useGiftStore, GIFT_TYPES, type GiftType } from '@/stores/giftStore';
import { useState } from 'react';

interface GiftPickerProps {
  onSelect: (giftType: GiftType) => void;
  tkBalance: number;
  onClose: () => void;
}

export function GiftPicker({ onSelect, tkBalance, onClose }: GiftPickerProps) {
  const [selectedGift, setSelectedGift] = useState<GiftType | null>(null);
  const [quantity, setQuantity] = useState(1);

  const handleSend = () => {
    if (selectedGift) {
      for (let i = 0; i < quantity; i++) {
        onSelect(selectedGift);
      }
      onClose();
    }
  };

  const totalCost = selectedGift ? GIFT_TYPES[selectedGift].price * quantity * 100 : 0;
  const canAfford = totalCost <= tkBalance;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        exit={{ y: 300 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-lg bg-[#1A1A1A] rounded-t-2xl border-t border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-white font-bold text-lg">Send a Gift</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2 mb-4 px-2 py-1.5 bg-amber-500/10 rounded-lg">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="text-amber-400 text-sm font-semibold">
              Balance: {(tkBalance / 100).toFixed(2)} TK
            </span>
          </div>

          <div className="grid grid-cols-5 gap-3">
            {(Object.entries(GIFT_TYPES) as [GiftType, typeof GIFT_TYPES[GiftType]][]).map(
              ([key, gift]) => (
                <button
                  key={key}
                  onClick={() => setSelectedGift(key)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all ${
                    selectedGift === key
                      ? 'bg-white/10 ring-2 ring-amber-500'
                      : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <span className="text-3xl">{gift.emoji}</span>
                  <span className="text-[10px] text-gray-400 font-medium">{gift.name}</span>
                  <span className="text-[10px] text-amber-400 font-bold">{gift.price} TK</span>
                </button>
              )
            )}
          </div>

          {selectedGift && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Quantity</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all"
                  >
                    -
                  </button>
                  <span className="text-white font-bold w-8 text-center">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(99, quantity + 1))}
                    className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-all"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between px-2">
                <span className="text-gray-400 text-sm">Total:</span>
                <span className="text-amber-400 font-bold">
                  {GIFT_TYPES[selectedGift].price * quantity} TK
                </span>
              </div>

              <button
                onClick={handleSend}
                disabled={!canAfford}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-600 hover:to-red-600 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/20"
              >
                {canAfford ? `Send ${GIFT_TYPES[selectedGift].emoji} × ${quantity}` : 'Insufficient Balance'}
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
