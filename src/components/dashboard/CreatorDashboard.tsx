'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { Coins, TrendingUp, Users, Eye, Gift, ArrowUpRight, ArrowDownRight } from 'lucide-react';
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
}

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

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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

        {/* Earnings Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
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

        {/* Recent Gifts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5"
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
