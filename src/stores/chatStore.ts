import { create } from 'zustand';

interface ChatMessage {
  id: string;
  streamId: string;
  userId: string;
  username: string;
  message: string;
  type: 'chat' | 'system' | 'gift_alert';
  avatar?: string;
  timestamp: number;
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;

  addMessage: (message: ChatMessage) => void;
  addSystemMessage: (streamId: string, message: string) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages.slice(-100), message],
    })),

  addSystemMessage: (streamId, message) =>
    set((state) => ({
      messages: [
        ...state.messages.slice(-100),
        {
          id: `sys_${Date.now()}`,
          streamId,
          userId: 'system',
          username: 'System',
          message,
          type: 'system' as const,
          timestamp: Date.now(),
        },
      ],
    })),

  clearMessages: () => set({ messages: [] }),
}));
