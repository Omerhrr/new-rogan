import { create } from 'zustand';

interface PKBattle {
  id: string;
  streamId: string;
  creator1Id: string;
  creator2Id: string;
  creator1Score: number;
  creator2Score: number;
  status: string;
  duration: number;
  startedAt: string | null;
  endedAt: string | null;
  winnerId: string | null;
  createdAt: string;
  creator1: {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    isLive: boolean;
  };
  creator2: {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    isLive: boolean;
  };
  winner?: {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
  } | null;
  stream?: {
    id: string;
    title: string;
    viewerCount?: number;
  };
}

interface PKState {
  activeBattle: PKBattle | null;
  activeBattles: PKBattle[];
  battleScores: { creator1Score: number; creator2Score: number } | null;
  timeRemaining: number | null;
  isLoading: boolean;
  error: string | null;
  challenge: (toCreatorId: string, streamId: string, duration: number) => Promise<string | null>;
  accept: (battleId: string) => Promise<boolean>;
  endBattle: (battleId: string) => Promise<boolean>;
  fetchActiveBattles: () => Promise<void>;
  fetchBattle: (id: string) => Promise<void>;
  setScores: (creator1Score: number, creator2Score: number) => void;
  setTimeRemaining: (time: number) => void;
  setActiveBattle: (battle: PKBattle | null) => void;
}

export const usePKStore = create<PKState>((set) => ({
  activeBattle: null,
  activeBattles: [],
  battleScores: null,
  timeRemaining: null,
  isLoading: false,
  error: null,

  challenge: async (toCreatorId, streamId, duration) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/pk/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toCreatorId, streamId, duration }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create challenge');
      set({ isLoading: false });
      return data.battle.id;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      return null;
    }
  },

  accept: async (battleId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/pk/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battleId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to accept challenge');
      set({ activeBattle: data.battle, isLoading: false });
      return true;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      return false;
    }
  },

  endBattle: async (battleId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/pk/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battleId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to end battle');
      set({ activeBattle: null, battleScores: null, timeRemaining: null, isLoading: false });
      return true;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      return false;
    }
  },

  fetchActiveBattles: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/pk/active');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch battles');
      set({ activeBattles: data.battles, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  fetchBattle: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/pk/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch battle');
      set({ activeBattle: data.battle, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  setScores: (creator1Score, creator2Score) => {
    set({ battleScores: { creator1Score, creator2Score } });
  },

  setTimeRemaining: (time) => {
    set({ timeRemaining: time });
  },

  setActiveBattle: (battle) => {
    set({ activeBattle: battle });
  },
}));
