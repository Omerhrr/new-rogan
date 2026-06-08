import { create } from 'zustand';

interface SubscriptionTier {
  id: string;
  creatorId: string;
  name: string;
  tier: string;
  price: number;
  benefits: string;
  isActive: boolean;
  createdAt: string;
  creator?: {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    isLive: boolean;
  };
}

interface Subscription {
  id: string;
  subscriberId: string;
  creatorId: string;
  tier: string;
  price: number;
  isActive: boolean;
  startDate: string;
  endDate: string | null;
  creator: {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    isLive: boolean;
  };
}

interface SubscriberInfo {
  id: string;
  tier: string;
  price: number;
  startDate: string;
  subscriber: {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
  };
}

interface SubscriptionState {
  tiers: SubscriptionTier[];
  mySubscriptions: Subscription[];
  subscribers: SubscriberInfo[];
  isLoading: boolean;
  error: string | null;
  fetchTiers: (creatorId: string) => Promise<void>;
  fetchAllTiers: () => Promise<void>;
  fetchMySubscriptions: () => Promise<void>;
  fetchSubscribers: () => Promise<void>;
  createTier: (data: { name: string; tier: string; price: number; benefits: string[] }) => Promise<boolean>;
  updateTier: (id: string, data: Partial<{ name: string; tier: string; price: number; benefits: string[]; isActive: boolean }>) => Promise<boolean>;
  deleteTier: (id: string) => Promise<boolean>;
  subscribe: (creatorId: string, tier: string) => Promise<boolean>;
  cancelSubscription: (id: string) => Promise<boolean>;
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  tiers: [],
  mySubscriptions: [],
  subscribers: [],
  isLoading: false,
  error: null,

  fetchTiers: async (creatorId: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/subscriptions/tiers?creatorId=${creatorId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch tiers');
      // Replace tiers for a specific creator view (My Tiers tab)
      set({ tiers: data.tiers, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  fetchAllTiers: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/subscriptions/tiers');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch tiers');
      set({ tiers: data.tiers, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  fetchMySubscriptions: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/subscriptions/mine');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch subscriptions');
      set({ mySubscriptions: data.subscriptions, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  fetchSubscribers: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/subscriptions/subscribers');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch subscribers');
      set({ subscribers: data.subscribers, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  createTier: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/subscriptions/tiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to create tier');
      set((state) => ({ tiers: [...state.tiers, resData.tier], isLoading: false }));
      return true;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      return false;
    }
  },

  updateTier: async (id, data) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/subscriptions/tiers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to update tier');
      set((state) => ({
        tiers: state.tiers.map((t) => (t.id === id ? resData.tier : t)),
      }));
      return true;
    } catch (error) {
      set({ error: (error as Error).message });
      return false;
    }
  },

  deleteTier: async (id) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/subscriptions/tiers/${id}`, {
        method: 'DELETE',
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to delete tier');
      set((state) => ({ tiers: state.tiers.filter((t) => t.id !== id) }));
      return true;
    } catch (error) {
      set({ error: (error as Error).message });
      return false;
    }
  },

  subscribe: async (creatorId, tier) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/subscriptions/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorId, tier }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to subscribe');
      set({ isLoading: false });
      return true;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      return false;
    }
  },

  cancelSubscription: async (id) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/subscriptions/${id}`, {
        method: 'PATCH',
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to cancel subscription');
      set((state) => ({
        mySubscriptions: state.mySubscriptions.filter((s) => s.id !== id),
      }));
      return true;
    } catch (error) {
      set({ error: (error as Error).message });
      return false;
    }
  },
}));
