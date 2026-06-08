import { create } from 'zustand';

interface StreamCreator {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  isLive: boolean;
}

interface Stream {
  id: string;
  creatorId: string;
  title: string;
  description: string | null;
  isLive: boolean;
  viewerCount: number;
  peakViewers: number;
  startedAt: string | null;
  creator: StreamCreator;
}

interface StreamState {
  streams: Stream[];
  currentStream: Stream | null;
  viewerCount: number;
  isLoading: boolean;

  fetchStreams: () => Promise<void>;
  setCurrentStream: (stream: Stream | null) => void;
  setViewerCount: (count: number) => void;
  createStream: (title: string, description?: string) => Promise<Stream | null>;
  endStream: (streamId: string) => Promise<void>;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  streams: [],
  currentStream: null,
  viewerCount: 0,
  isLoading: false,

  fetchStreams: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/streams');
      const data = await res.json();
      set({ streams: data.streams || [], isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setCurrentStream: (stream) => set({ currentStream: stream, viewerCount: stream?.viewerCount || 0 }),
  setViewerCount: (count) => set({ viewerCount: count }),

  createStream: async (title, description) => {
    try {
      const res = await fetch('/api/streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      const data = await res.json();
      if (res.ok) {
        set((state) => ({ streams: [data.stream, ...state.streams] }));
        return data.stream;
      }
      return null;
    } catch {
      return null;
    }
  },

  endStream: async (streamId) => {
    try {
      await fetch(`/api/streams/${streamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLive: false }),
      });
      set((state) => ({
        streams: state.streams.filter((s) => s.id !== streamId),
        currentStream: state.currentStream?.id === streamId ? null : state.currentStream,
      }));
    } catch {
      // silently fail
    }
  },
}));
