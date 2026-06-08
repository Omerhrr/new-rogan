import { create } from 'zustand';

interface WalletState {
  tkBalance: number;
  roganEquivalent: number;
  isLoading: boolean;

  fetchBalance: () => Promise<void>;
  deposit: (roganAmount: number) => Promise<boolean>;
  withdraw: (tkAmount: number) => Promise<boolean>;
}

export const useWalletStore = create<WalletState>((set) => ({
  tkBalance: 0,
  roganEquivalent: 0,
  isLoading: false,

  fetchBalance: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/economy/balance');
      if (res.ok) {
        const data = await res.json();
        set({ tkBalance: data.tkBalance, roganEquivalent: data.roganEquivalent, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  deposit: async (roganAmount) => {
    try {
      const res = await fetch('/api/economy/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roganAmount }),
      });
      if (res.ok) {
        const data = await res.json();
        set({ tkBalance: data.tkBalance, roganEquivalent: data.tkBalance / 100 });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  withdraw: async (tkAmount) => {
    try {
      const res = await fetch('/api/economy/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tkAmount }),
      });
      if (res.ok) {
        const data = await res.json();
        set({ tkBalance: data.tkBalance, roganEquivalent: data.tkBalance / 100 });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
}));
