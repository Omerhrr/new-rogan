import { create } from 'zustand';

interface ServiceCreator {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  isLive: boolean;
}

interface ServiceListing {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  category: string;
  price: number;
  deliveryDays: number;
  isActive: boolean;
  rating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
  creator: ServiceCreator;
}

interface CreateServiceData {
  title: string;
  description: string;
  category: string;
  price: number;
  deliveryDays: number;
}

interface ServiceState {
  services: ServiceListing[];
  myServices: ServiceListing[];
  isLoading: boolean;
  fetchServices: (category?: string) => Promise<void>;
  fetchMyServices: () => Promise<void>;
  createService: (data: CreateServiceData) => Promise<boolean>;
  updateService: (id: string, data: Partial<CreateServiceData> & { isActive?: boolean }) => Promise<boolean>;
}

export const useServiceStore = create<ServiceState>((set) => ({
  services: [],
  myServices: [],
  isLoading: false,

  fetchServices: async (category?: string) => {
    set({ isLoading: true });
    try {
      const url = category && category !== 'all' 
        ? `/api/services?category=${category}` 
        : '/api/services';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        set({ services: data.services || [], isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  fetchMyServices: async () => {
    try {
      const res = await fetch('/api/services/mine');
      if (res.ok) {
        const data = await res.json();
        set({ myServices: data.services || [] });
      }
    } catch {
      // ignore
    }
  },

  createService: async (data: CreateServiceData) => {
    try {
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        set((state) => ({ services: [result.service, ...state.services] }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  updateService: async (id: string, data: Partial<CreateServiceData> & { isActive?: boolean }) => {
    try {
      const res = await fetch(`/api/services/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        set((state) => ({
          services: state.services.map((s) => s.id === id ? result.service : s),
          myServices: state.myServices.map((s) => s.id === id ? result.service : s),
        }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
}));
