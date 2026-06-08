import { create } from 'zustand';

export interface GiftAnimation {
  id: string;
  giftType: string;
  senderName: string;
  amount: number;
  timestamp: number;
}

export const GIFT_TYPES = {
  rose: { name: 'Rose', emoji: '🌹', price: 1, color: '#EF4444' },
  heart: { name: 'Heart', emoji: '❤️', price: 5, color: '#EC4899' },
  fire: { name: 'Fire', emoji: '🔥', price: 50, color: '#F97316' },
  diamond: { name: 'Diamond', emoji: '💎', price: 10, color: '#06B6D4' },
  crown: { name: 'Crown', emoji: '👑', price: 100, color: '#EAB308' },
} as const;

export type GiftType = keyof typeof GIFT_TYPES;

interface GiftState {
  animations: GiftAnimation[];
  showPicker: boolean;

  addAnimation: (animation: GiftAnimation) => void;
  removeAnimation: (id: string) => void;
  setShowPicker: (show: boolean) => void;
}

export const useGiftStore = create<GiftState>((set) => ({
  animations: [],
  showPicker: false,

  addAnimation: (animation) =>
    set((state) => ({ animations: [...state.animations, animation] })),

  removeAnimation: (id) =>
    set((state) => ({ animations: state.animations.filter((a) => a.id !== id) })),

  setShowPicker: (show) => set({ showPicker: show }),
}));
