'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { Coins, TrendingUp, Users, Eye, Gift, Star, Swords, Heart, Crown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface DashboardData {
  totalEarned: number;
  thisMonthEarned: number;
  pendingWithdrawal: number;
  tkBalance: number;
  followerCount: number;
  followingCount: number;
  totalStreams: number;
  recentGifts: Array<{
    id: string;
    giftType: string;
    amount: number;
    message: string | null;
    createdAt: string;
    sender: { id: string; username: string; displayName: string | null; avatar: string | null };
  }>;
  dailyEarnings: Record<string, number>;
  // Phase 3
  subscriberCount: number;
  recentSubscribers: Array<{
    id: string;
    tier: string;
    price: number;
    startDate: string;
    subscriber: { id: string; username: string; displayName: string | null; avatar: string | null };
  }>;
  pkBattles: Array<{
    id: string;
    creator1Score: number;
    creator2Score: number;
    status: string;
    winnerId: string | null;
    createdAt: string;
    creator1: { id: string; username: string; displayName: string | null; avatar: string | null };
    creator2: { id: string; username: string; displayName: string | null; avatar: string | null };
    winner: { id: string; username: string; displayName: string | null } | null;
  }>;
  pkWins: number;
  pkTotal: number;
  avgServiceRating: number;
  totalReviews: number;
  tierCount: number;
}

const TIER_STYLES: Record<string, { bg: string; text: string }> = {
  basic: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
  premium: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  vip: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
};

export function CreatorDashboard() {
  const { user } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/creator/dashboard')
      .then((res) => res.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0A0A0A]">
        <div className="w-10 h-10 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0A0A0A]">
        <p className="text-gray-500">Failed to load dashboard</p>
      </div>
    );
  }

  const chartData = Object.entries(data.dailyEarnings).map(([date, amount]) => ({
    date: date.split('-').slice(1).join('/'),
    earnings: amount / 100,
  }));

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Creator Dashboard</h1>
          <p className="text-gray-500 text-sm">Welcome back, {user?.displayName || user?.username}</p>
        </div>

        {/* Stats cards - Row 1 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0 }}
            className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5"
          >
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-gray-500">Total Earned</span>
            </div>
            <p className="text-xl font-bold text-amber-400">{(data.totalEarned / 100).toFixed(2)} TK</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5"
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-xs text-gray-500">This Month</span>
            </div>
            <p className="text-xl font-bold text-green-400">{(data.thisMonthEarned / 100).toFixed(2)} TK</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5"
          >
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-gray-500">Followers</span>
            </div>
            <p className="text-xl font-bold text-white">{data.followerCount}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5"
          >
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-4 h-4 text-red-400" />
              <span className="text-xs text-gray-500">Total Streams</span>
            </div>
            <p className="text-xl font-bold text-white">{data.totalStreams}</p>
          </motion.div>
        </div>

        {/* Stats cards - Row 2 (Phase 3) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5"
          >
            <div className="flex items-center gap-2 mb-2">
              <Heart className="w-4 h-4 text-red-400" />
              <span className="text-xs text-gray-500">Subscribers</span>
            </div>
            <p className="text-xl font-bold text-white">{data.subscriberCount}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5"
          >
            <div className="flex items-center gap-2 mb-2">
              <Swords className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-gray-500">PK Wins</span>
            </div>
            <p className="text-xl font-bold text-white">
              {data.pkWins}/{data.pkTotal}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5"
          >
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-gray-500">Avg Rating</span>
            </div>
            <p className="text-xl font-bold text-amber-400">
              {data.avgServiceRating > 0 ? data.avgServiceRating.toFixed(1) : '-'}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5"
          >
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-gray-500">Sub Tiers</span>
            </div>
            <p className="text-xl font-bold text-white">{data.tierCount}</p>
          </motion.div>
        </div>

        {/* Earnings Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5 mb-6"
        >
          <h3 className="text-white font-semibold mb-4">Earnings (Last 7 Days)</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 11 }} />
                <YAxis tick={{ fill: '#888', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1A1A1A',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  formatter={(value: number) => [`${value.toFixed(2)} TK`, 'Earnings']}
                />
                <Bar dataKey="earnings" fill="#EAB308" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Two column layout for bottom sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Recent Subscribers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5"
          >
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-400" />
              Recent Subscribers
            </h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {data.recentSubscribers.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-4">No subscribers yet</p>
              ) : (
                data.recentSubscribers.map((sub) => {
                  const style = TIER_STYLES[sub.tier] || TIER_STYLES.basic;
                  return (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold">
                          {sub.subscriber.displayName?.[0] || sub.subscriber.username[0]}
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">
                            {sub.subscriber.displayName || sub.subscriber.username}
                          </p>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${style.bg} ${style.text}`}>
                            {sub.tier}
                          </span>
                        </div>
                      </div>
                      <p className="text-amber-400 text-xs font-bold">{(sub.price / 100).toFixed(0)} TK/mo</p>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>

          {/* PK Battle History */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 }}
            className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5"
          >
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Swords className="w-5 h-5 text-cyan-400" />
              PK Battle History
            </h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {data.pkBattles.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-4">No PK battles yet</p>
              ) : (
                data.pkBattles.map((battle) => {
                  const isCreator1 = battle.creator1.id === user?.id;
                  const myScore = isCreator1 ? battle.creator1Score : battle.creator2Score;
                  const oppScore = isCreator1 ? battle.creator2Score : battle.creator1Score;
                  const opponent = isCreator1 ? battle.creator2 : battle.creator1;
                  const isWin = battle.winnerId === user?.id;
                  const isDraw = battle.status === 'completed' && !battle.winnerId;

                  return (
                    <div
                      key={battle.id}
                      className="py-2 border-b border-white/5 last:border-0"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white text-[10px] font-bold">
                            {opponent.displayName?.[0] || opponent.username[0]}
                          </div>
                          <span className="text-white text-xs font-medium">
                            vs {opponent.displayName || opponent.username}
                          </span>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          battle.status === 'active'
                            ? 'bg-green-500/20 text-green-400'
                            : battle.status === 'pending'
                            ? 'bg-amber-500/20 text-amber-400'
                            : isWin
                            ? 'bg-green-500/20 text-green-400'
                            : isDraw
                            ? 'bg-gray-500/20 text-gray-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {battle.status === 'completed' ? (isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSS') : battle.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-red-400 font-bold">{myScore}</span>
                        <span className="text-gray-600">vs</span>
                        <span className="text-blue-400 font-bold">{oppScore}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>

        {/* Recent Gifts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5 mt-6"
        >
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Gift className="w-5 h-5 text-red-400" />
            Recent Gifts
          </h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {data.recentGifts.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-4">No gifts yet</p>
            ) : (
              data.recentGifts.map((gift) => (
                <div
                  key={gift.id}
                  className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold">
                      {gift.sender.displayName?.[0] || gift.sender.username[0]}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">
                        {gift.sender.displayName || gift.sender.username}
                      </p>
                      <p className="text-gray-500 text-xs">
                        Sent a {gift.giftType}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-amber-400 text-sm font-bold">
                      +{(gift.amount * 0.8 / 100).toFixed(2)} TK
                    </p>
                    <p className="text-gray-600 text-xs">
                      {new Date(gift.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
