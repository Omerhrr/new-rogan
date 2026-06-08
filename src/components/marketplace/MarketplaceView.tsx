'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Star, Clock, Briefcase, ShoppingBag, ListTodo, Loader2 } from 'lucide-react';
import { useServiceStore } from '@/stores/serviceStore';
import { useRequestStore } from '@/stores/requestStore';
import { useAuthStore } from '@/stores/authStore';
import { CreateServiceModal } from './CreateServiceModal';
import { ServiceDetailModal } from './ServiceDetailModal';
import { RequestCard } from './RequestCard';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'video_call', label: 'Video Call' },
  { value: 'custom_video', label: 'Custom Video' },
  { value: 'shoutout', label: 'Shoutout' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_LABELS: Record<string, string> = {
  video_call: 'Video Call',
  custom_video: 'Custom Video',
  shoutout: 'Shoutout',
  coaching: 'Coaching',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  video_call: 'bg-green-500/20 text-green-400 border-green-500/30',
  custom_video: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  shoutout: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  coaching: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  other: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

type Tab = 'browse' | 'myServices' | 'myRequests';

export function MarketplaceView() {
  const { services, myServices, isLoading, fetchServices, fetchMyServices, createService } = useServiceStore();
  const { requests, fetchRequests, createRequest, updateRequestStatus } = useRequestStore();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState<Tab>('browse');
  const [category, setCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedService, setSelectedService] = useState<typeof services[0] | null>(null);

  useEffect(() => {
    fetchServices(category);
  }, [fetchServices, category]);

  useEffect(() => {
    if (activeTab === 'myServices' && user?.role === 'creator') {
      fetchMyServices();
    }
    if (activeTab === 'myRequests') {
      fetchRequests();
    }
  }, [activeTab, fetchMyServices, fetchRequests, user?.role]);

  const filteredServices = services.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.creator.username.toLowerCase().includes(q) ||
      (s.creator.displayName?.toLowerCase().includes(q) ?? false)
    );
  });

  const handleCreateService = async (data: {
    title: string;
    description: string;
    category: string;
    price: number;
    deliveryDays: number;
  }) => {
    return await createService(data);
  };

  const handleRequestService = async (serviceId: string, message: string) => {
    return await createRequest(serviceId, message);
  };

  const handleUpdateRequestStatus = async (requestId: string, status: string, deliveryMessage?: string) => {
    return await updateRequestStatus(requestId, status, deliveryMessage);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-6">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Briefcase className="w-6 h-6 text-red-500" />
            <h1 className="text-2xl font-bold text-white">Services</h1>
          </div>
          {user?.role === 'creator' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-all"
            >
              <Plus className="w-4 h-4" />
              Create
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl mb-4">
          <button
            onClick={() => setActiveTab('browse')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'browse'
                ? 'bg-red-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            Browse
          </button>
          {user?.role === 'creator' && (
            <button
              onClick={() => setActiveTab('myServices')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'myServices'
                  ? 'bg-red-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              My Services
            </button>
          )}
          <button
            onClick={() => setActiveTab('myRequests')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'myRequests'
                ? 'bg-red-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <ListTodo className="w-4 h-4" />
            Requests
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'browse' && (
              <div>
                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search services..."
                    className="w-full pl-10 pr-4 py-2.5 bg-[#1A1A1A] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-red-500/50"
                  />
                </div>

                {/* Category filter */}
                <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-2 scrollbar-hide">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setCategory(cat.value)}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        category === cat.value
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/20'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Service Grid */}
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
                  </div>
                ) : filteredServices.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-full bg-[#1A1A1A] flex items-center justify-center mx-auto mb-3">
                      <ShoppingBag className="w-8 h-8 text-gray-600" />
                    </div>
                    <p className="text-gray-400 font-medium">No services found</p>
                    <p className="text-gray-600 text-sm mt-1">Try a different category or search term</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredServices.map((service) => (
                      <motion.button
                        key={service.id}
                        onClick={() => setSelectedService(service)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="bg-[#1A1A1A] rounded-xl border border-white/10 p-4 text-left hover:border-white/20 transition-all"
                      >
                        {/* Creator row */}
                        <div className="flex items-center gap-2 mb-3">
                          <div className="relative">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold">
                              {service.creator.displayName?.[0] || service.creator.username[0]}
                            </div>
                            {service.creator.isLive && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#1A1A1A]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white text-xs font-semibold truncate">
                              {service.creator.displayName || service.creator.username}
                            </p>
                            <p className="text-gray-600 text-[10px]">@{service.creator.username}</p>
                          </div>
                        </div>

                        {/* Title & description */}
                        <h3 className="text-white font-semibold text-sm mb-1 truncate">{service.title}</h3>
                        <p className="text-gray-400 text-xs line-clamp-2 mb-3">{service.description}</p>

                        {/* Category badge */}
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-medium border mb-3 ${CATEGORY_COLORS[service.category] || CATEGORY_COLORS.other}`}>
                          {CATEGORY_LABELS[service.category] || service.category}
                        </span>

                        {/* Bottom row: price + rating + delivery */}
                        <div className="flex items-center justify-between pt-2 border-t border-white/5">
                          <span className="text-amber-400 font-bold text-sm">{(service.price / 100).toFixed(0)} TK</span>
                          <div className="flex items-center gap-3">
                            {service.rating > 0 && (
                              <div className="flex items-center gap-0.5">
                                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                <span className="text-gray-400 text-[10px]">{service.rating.toFixed(1)}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-0.5">
                              <Clock className="w-3 h-3 text-gray-500" />
                              <span className="text-gray-500 text-[10px]">{service.deliveryDays}d</span>
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'myServices' && (
              <div>
                {myServices.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-full bg-[#1A1A1A] flex items-center justify-center mx-auto mb-3">
                      <Briefcase className="w-8 h-8 text-gray-600" />
                    </div>
                    <p className="text-gray-400 font-medium">No services yet</p>
                    <p className="text-gray-600 text-sm mt-1 mb-4">Create your first service listing!</p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-all"
                    >
                      Create Service
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myServices.map((service) => (
                      <div key={service.id} className="bg-[#1A1A1A] rounded-xl border border-white/10 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-white font-semibold text-sm">{service.title}</h3>
                            <p className="text-gray-400 text-xs mt-1 line-clamp-2">{service.description}</p>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-amber-400 font-bold text-xs">{(service.price / 100).toFixed(0)} TK</span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${CATEGORY_COLORS[service.category] || CATEGORY_COLORS.other}`}>
                                {CATEGORY_LABELS[service.category] || service.category}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${
                                service.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                              }`}>
                                {service.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </div>
                        </div>
                        {/* Show requests for this service */}
                        {'requests' in service && Array.isArray((service as Record<string, unknown>).requests) && ((service as Record<string, unknown>).requests as unknown[])?.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-white/5">
                            <p className="text-gray-500 text-[10px] font-semibold mb-2 uppercase tracking-wider">
                              Recent Requests ({((service as Record<string, unknown>).requests as unknown[]).length})
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'myRequests' && (
              <div>
                {requests.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-full bg-[#1A1A1A] flex items-center justify-center mx-auto mb-3">
                      <ListTodo className="w-8 h-8 text-gray-600" />
                    </div>
                    <p className="text-gray-400 font-medium">No requests yet</p>
                    <p className="text-gray-600 text-sm mt-1">Browse services and request one!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {requests.map((req) => (
                      <RequestCard
                        key={req.id}
                        request={req}
                        currentUserId={user?.id || ''}
                        onUpdateStatus={handleUpdateRequestStatus}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Modals */}
      <CreateServiceModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateService}
      />

      {selectedService && (
        <ServiceDetailModal
          service={selectedService}
          isOpen={!!selectedService}
          onClose={() => setSelectedService(null)}
          onRequest={handleRequestService}
        />
      )}
    </div>
  );
}
