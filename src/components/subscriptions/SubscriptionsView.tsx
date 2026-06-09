'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Crown, Sparkles, Star, Users, Loader2, Plus, Trash2, Search } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore, type SubscriptionTier } from '@/stores/subscriptionStore';
import { CreateTierModal } from './CreateTierModal';

type SubTab = 'subscribe' | 'mySubs' | 'myTiers';

const TIER_STYLES: Record<string, { border: string; bg: string; text: string; glow: string; icon: typeof Heart }> = {
  basic: {
    border: 'border-gray-500/30',
    bg: 'bg-gray-500/10',
    text: 'text-gray-400',
    glow: '',
    icon: Heart,
  },
  premium: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    glow: 'shadow-amber-500/20 shadow-lg',
    icon: Star,
  },
  vip: {
    border: 'border-purple-500/30',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    glow: 'shadow-purple-500/20 shadow-lg',
    icon: Crown,
  },
};

export function SubscriptionsView() {
  const { user } = useAuthStore();
  const {
    tiers,
    mySubscriptions,
    subscribers,
    isLoading,
    error,
    fetchAllTiers,
    fetchTiers,
    fetchMySubscriptions,
    fetchSubscribers,
    subscribe,
    cancelSubscription,
    deleteTier,
  } = useSubscriptionStore();

  const [activeTab, setActiveTab] = useState<SubTab>('subscribe');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [subscribingTo, setSubscribingTo] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Load data based on tab
  useEffect(() => {
    if (activeTab === 'subscribe') {
      fetchAllTiers();
    } else if (activeTab === 'mySubs') {
      fetchMySubscriptions();
    } else if (activeTab === 'myTiers' && user?.role === 'creator') {
      fetchTiers(user.id);
      fetchSubscribers();
    }
  }, [activeTab, user, fetchAllTiers, fetchTiers, fetchMySubscriptions, fetchSubscribers]);

  // Also load my subscriptions on mount (for badge/status)
  useEffect(() => {
    fetchMySubscriptions();
  }, [fetchMySubscriptions]);

  const handleSubscribe = async (creatorId: string, tier: string) => {
    setSubscribingTo(creatorId + '_' + tier);
    await subscribe(creatorId, tier);
    setSubscribingTo(null);
    fetchMySubscriptions();
    fetchAllTiers(); // Refresh to update subscribed status
  };

  const handleCancelSub = async (id: string) => {
    await cancelSubscription(id);
    fetchAllTiers(); // Refresh to update subscribed status
  };

  const handleDeleteTier = async (id: string) => {
    if (confirm('Delete this tier? Existing subscribers will keep their subscription.')) {
      await deleteTier(id);
    }
  };

  const isSubscribedTo = (creatorId: string) =>
    mySubscriptions.some((s) => s.creatorId === creatorId && s.isActive);

  // Filter tiers by search
  const filteredTiers = searchQuery
    ? tiers.filter((t) =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.creator?.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.creator?.username.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tiers;

  // Group tiers by creator for the subscribe tab
  const tiersByCreator = filteredTiers.reduce<Record<string, SubscriptionTier[]>>((acc, tier) => {
    const key = tier.creatorId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(tier);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-6">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Heart className="w-6 h-6 text-red-500 fill-red-500" />
            <h1 className="text-2xl font-bold text-white">Subscriptions</h1>
          </div>
          {user?.role === 'creator' && activeTab === 'myTiers' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-all"
            >
              <Plus className="w-4 h-4" />
              Create Tier
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl mb-6">
          <button
            onClick={() => setActiveTab('subscribe')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'subscribe' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Heart className="w-4 h-4" />
            Subscribe
          </button>
          <button
            onClick={() => setActiveTab('mySubs')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'mySubs' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            My Subs
          </button>
          {user?.role === 'creator' && (
            <button
              onClick={() => setActiveTab('myTiers')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'myTiers' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Crown className="w-4 h-4" />
              My Tiers
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* Subscribe Tab */}
            {activeTab === 'subscribe' && (
              <div>
                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search creators or tiers..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-red-500/50"
                  />
                </div>

                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
                  </div>
                ) : filteredTiers.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-full bg-[#1A1A1A] flex items-center justify-center mx-auto mb-3">
                      <Heart className="w-8 h-8 text-gray-600" />
                    </div>
                    <p className="text-gray-400 font-medium">No subscription tiers available</p>
                    <p className="text-gray-600 text-sm mt-1">Check back later for creator tiers</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(tiersByCreator).map(([creatorId, creatorTiers]) => {
                      const creatorInfo = creatorTiers[0]?.creator;
                      const isSubbed = isSubscribedTo(creatorId);

                      return (
                        <div key={creatorId}>
                          {/* Creator header */}
                          {creatorInfo && (
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white font-bold text-sm">
                                {creatorInfo.displayName?.[0] || creatorInfo.username[0]}
                              </div>
                              <div>
                                <p className="text-white font-semibold text-sm">
                                  {creatorInfo.displayName || creatorInfo.username}
                                </p>
                                <div className="flex items-center gap-2">
                                  {creatorInfo.isLive && (
                                    <span className="flex items-center gap-1 text-[10px] text-red-400 font-medium">
                                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                      LIVE
                                    </span>
                                  )}
                                  <span className="text-gray-500 text-[10px]">{creatorTiers.length} tier{creatorTiers.length > 1 ? 's' : ''}</span>
                                </div>
                              </div>
                              {isSubbed && (
                                <span className="ml-auto px-2 py-0.5 rounded-md bg-green-500/20 text-green-400 text-[10px] font-bold">
                                  SUBSCRIBED
                                </span>
                              )}
                            </div>
                          )}

                          {/* Tier cards */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {creatorTiers.map((tier) => {
                              const style = TIER_STYLES[tier.tier] || TIER_STYLES.basic;
                              const TierIcon = style.icon;
                              const benefits: string[] = JSON.parse(tier.benefits || '[]');
                              const isSubscribing = subscribingTo === tier.creatorId + '_' + tier.tier;

                              return (
                                <motion.div
                                  key={tier.id}
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  whileHover={{ scale: 1.02 }}
                                  className={`bg-[#1A1A1A] rounded-xl border ${style.border} p-4 ${style.glow} transition-all`}
                                >
                                  {/* Tier badge */}
                                  <div className="flex items-center justify-between mb-2">
                                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg ${style.bg}`}>
                                      <TierIcon className={`w-3.5 h-3.5 ${style.text}`} />
                                      <span className={`text-[10px] font-bold uppercase tracking-wider ${style.text}`}>
                                        {tier.tier}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Tier name */}
                                  <h3 className="text-white font-bold text-sm mb-1">{tier.name}</h3>

                                  {/* Price */}
                                  <div className="flex items-baseline gap-1 mb-2">
                                    <span className="text-xl font-black text-amber-400">{(tier.price / 100).toFixed(0)}</span>
                                    <span className="text-amber-400/60 text-xs font-medium">TK/mo</span>
                                  </div>

                                  {/* Benefits */}
                                  {benefits.length > 0 && (
                                    <ul className="space-y-1 mb-3">
                                      {benefits.slice(0, 4).map((b, i) => (
                                        <li key={i} className="flex items-center gap-1.5 text-gray-400 text-[10px]">
                                          <span className={`w-1 h-1 rounded-full ${style.text} bg-current`} />
                                          {b}
                                        </li>
                                      ))}
                                      {benefits.length > 4 && (
                                        <li className="text-gray-500 text-[10px] pl-2.5">+{benefits.length - 4} more</li>
                                      )}
                                    </ul>
                                  )}

                                  {/* Subscribe button */}
                                  <button
                                    onClick={() => !isSubbed && handleSubscribe(tier.creatorId, tier.tier)}
                                    disabled={isSubbed || isSubscribing}
                                    className={`w-full py-2 rounded-xl text-xs font-semibold transition-all ${
                                      isSubbed
                                        ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                                        : isSubscribing
                                        ? 'bg-red-600/50 text-white/50 cursor-wait'
                                        : 'bg-red-600 hover:bg-red-700 text-white'
                                    }`}
                                  >
                                    {isSubscribing ? (
                                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                                    ) : isSubbed ? (
                                      'Subscribed ✓'
                                    ) : (
                                      `Subscribe ${(tier.price / 100).toFixed(0)} TK`
                                    )}
                                  </button>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* My Subs Tab */}
            {activeTab === 'mySubs' && (
              <div>
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
                  </div>
                ) : mySubscriptions.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-full bg-[#1A1A1A] flex items-center justify-center mx-auto mb-3">
                      <Sparkles className="w-8 h-8 text-gray-600" />
                    </div>
                    <p className="text-gray-400 font-medium">No active subscriptions</p>
                    <p className="text-gray-600 text-sm mt-1">Subscribe to a creator to see their exclusive content!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mySubscriptions.map((sub) => {
                      const style = TIER_STYLES[sub.tier] || TIER_STYLES.basic;
                      const TierIcon = style.icon;
                      return (
                        <motion.div
                          key={sub.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="bg-[#1A1A1A] rounded-xl border border-white/10 p-4 flex items-center gap-4"
                        >
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
                            {sub.creator.displayName?.[0] || sub.creator.username[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-semibold text-sm truncate">
                              {sub.creator.displayName || sub.creator.username}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${style.bg}`}>
                                <TierIcon className={`w-3 h-3 ${style.text}`} />
                                <span className={`text-[10px] font-bold uppercase ${style.text}`}>{sub.tier}</span>
                              </div>
                              <span className="text-amber-400 text-xs font-medium">{(sub.price / 100).toFixed(0)} TK/mo</span>
                              {sub.creator.isLive && (
                                <span className="flex items-center gap-1 text-[10px] text-red-400 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                  LIVE
                                </span>
                              )}
                            </div>
                            <p className="text-gray-600 text-[10px] mt-1">
                              Since {new Date(sub.startDate).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={() => handleCancelSub(sub.id)}
                            className="px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 text-xs font-medium hover:bg-red-500/10 hover:text-red-400 transition-all"
                          >
                            Cancel
                          </button>
                        </motion.div>
                      );
                    })}

                    {/* Total monthly cost */}
                    <div className="bg-[#1A1A1A] rounded-xl border border-white/10 p-4 flex items-center justify-between">
                      <span className="text-gray-400 text-sm">Total monthly cost</span>
                      <span className="text-amber-400 font-bold">
                        {mySubscriptions.reduce((sum, s) => sum + s.price, 0) / 100} TK/mo
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* My Tiers Tab (creators) */}
            {activeTab === 'myTiers' && user?.role === 'creator' && (
              <div>
                {/* Subscribers overview */}
                <div className="bg-[#1A1A1A] rounded-xl border border-white/10 p-4 mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-5 h-5 text-amber-400" />
                    <h3 className="text-white font-semibold">Subscribers</h3>
                    <span className="ml-auto text-amber-400 text-sm font-bold">{subscribers.length}</span>
                  </div>
                  {subscribers.length === 0 ? (
                    <p className="text-gray-600 text-sm text-center py-3">No subscribers yet</p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {subscribers.map((sub) => {
                        const style = TIER_STYLES[sub.tier] || TIER_STYLES.basic;
                        return (
                          <div key={sub.id} className="flex items-center gap-2 py-1">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white text-[10px] font-bold">
                              {sub.subscriber.displayName?.[0] || sub.subscriber.username[0]}
                            </div>
                            <span className="text-gray-400 text-xs">{sub.subscriber.displayName || sub.subscriber.username}</span>
                            <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${style.bg} ${style.text}`}>
                              {sub.tier}
                            </span>
                            <span className="text-amber-400/60 text-[10px]">{(sub.price / 100).toFixed(0)} TK</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Revenue summary */}
                  {subscribers.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                      <span className="text-gray-500 text-xs">Monthly revenue from subs</span>
                      <span className="text-amber-400 text-sm font-bold">
                        {subscribers.reduce((sum, s) => sum + s.price, 0) / 100} TK
                      </span>
                    </div>
                  )}
                </div>

                {/* Tiers list */}
                {tiers.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-[#1A1A1A] flex items-center justify-center mx-auto mb-3">
                      <Crown className="w-8 h-8 text-gray-600" />
                    </div>
                    <p className="text-gray-400 font-medium">No subscription tiers</p>
                    <p className="text-gray-600 text-sm mt-1 mb-4">Create tiers to let fans support you!</p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-all"
                    >
                      Create Tier
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tiers.map((tier) => {
                      const style = TIER_STYLES[tier.tier] || TIER_STYLES.basic;
                      const TierIcon = style.icon;
                      const benefits: string[] = JSON.parse(tier.benefits || '[]');
                      const subCount = subscribers.filter((s) => s.tier === tier.tier).length;
                      return (
                        <motion.div
                          key={tier.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`bg-[#1A1A1A] rounded-xl border ${style.border} p-4 ${style.glow}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <TierIcon className={`w-4 h-4 ${style.text}`} />
                                <h3 className="text-white font-bold">{tier.name}</h3>
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${style.bg} ${style.text}`}>
                                  {tier.tier}
                                </span>
                                <span className="text-gray-500 text-[10px]">
                                  {subCount} sub{subCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <p className="text-amber-400 font-bold text-lg">{(tier.price / 100).toFixed(0)} TK/mo</p>
                              {benefits.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {benefits.map((b, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-white/5 rounded-md text-gray-400 text-[10px]">
                                      {b}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteTier(tier.id)}
                              className="p-2 rounded-lg bg-white/5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <CreateTierModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}
