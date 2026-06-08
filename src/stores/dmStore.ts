import { create } from 'zustand';

interface ConversationUser {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
}

interface DMMessage {
  id: string;
  senderId: string;
  receiverId: string;
  message: string;
  isPaid: boolean;
  price: number;
  isRead: boolean;
  createdAt: string;
  sender?: ConversationUser;
}

interface Conversation {
  user: ConversationUser;
  lastMessage: DMMessage;
  unreadCount: number;
}

interface DMState {
  conversations: Conversation[];
  activeConversation: ConversationUser | null;
  messages: DMMessage[];
  isLoading: boolean;

  fetchConversations: () => Promise<void>;
  openConversation: (user: ConversationUser) => Promise<void>;
  sendMessage: (receiverId: string, message: string, isPaid?: boolean, price?: number) => Promise<boolean>;
  closeConversation: () => void;
}

export const useDMStore = create<DMState>((set) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  isLoading: false,

  fetchConversations: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/dm/conversations');
      if (res.ok) {
        const data = await res.json();
        set({ conversations: data.conversations || [], isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  openConversation: async (user) => {
    set({ activeConversation: user, isLoading: true });
    try {
      const res = await fetch(`/api/dm/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        set({ messages: data.messages || [], isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  sendMessage: async (receiverId, message, isPaid = false, price = 0) => {
    try {
      const res = await fetch(`/api/dm/${receiverId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, isPaid, price }),
      });
      if (res.ok) {
        const data = await res.json();
        set((state) => ({ messages: [...state.messages, data.message] }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  closeConversation: () => set({ activeConversation: null, messages: [] }),
}));
