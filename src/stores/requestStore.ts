import { create } from 'zustand';

interface RequestUser {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
}

interface ServiceInfo {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  creator: RequestUser;
}

interface ServiceRequest {
  id: string;
  serviceId: string;
  buyerId: string;
  creatorId: string;
  message: string;
  status: string;
  price: number;
  deliveryMessage: string | null;
  createdAt: string;
  updatedAt: string;
  service: ServiceInfo;
  buyer: RequestUser;
  creator: RequestUser;
}

interface RequestState {
  requests: ServiceRequest[];
  isLoading: boolean;
  fetchRequests: (status?: string) => Promise<void>;
  createRequest: (serviceId: string, message: string) => Promise<boolean>;
  updateRequestStatus: (requestId: string, status: string, deliveryMessage?: string) => Promise<boolean>;
}

export const useRequestStore = create<RequestState>((set) => ({
  requests: [],
  isLoading: false,

  fetchRequests: async (status?: string) => {
    set({ isLoading: true });
    try {
      const url = status ? `/api/requests?status=${status}` : '/api/requests';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        set({ requests: data.requests || [], isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  createRequest: async (serviceId: string, message: string) => {
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId, message }),
      });
      if (res.ok) {
        const data = await res.json();
        set((state) => ({ requests: [data.request, ...state.requests] }));
        return true;
      }
      const err = await res.json();
      console.error('Create request error:', err.error);
      return false;
    } catch {
      return false;
    }
  },

  updateRequestStatus: async (requestId: string, status: string, deliveryMessage?: string) => {
    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, deliveryMessage }),
      });
      if (res.ok) {
        const data = await res.json();
        set((state) => ({
          requests: state.requests.map((r) => r.id === requestId ? data.request : r),
        }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
}));
