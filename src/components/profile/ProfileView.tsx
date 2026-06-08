'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useWalletStore } from '@/stores/walletStore';
import { User, Edit3, Link2, LogOut, Save, X, Coins, Users, Calendar } from 'lucide-react';

export function ProfileView() {
  const { user, logout } = useAuthStore();
  const { tkBalance } = useWalletStore();
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [walletAddress, setWalletAddress] = useState('');
  const [linkedWallet, setLinkedWallet] = useState<string | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isCreator, setIsCreator] = useState(false);

  useEffect(() => {
    fetch('/api/users/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setFollowerCount(data.user.followerCount || 0);
          setFollowingCount(data.user.followingCount || 0);
          setLinkedWallet(data.user.wallet?.walletAddress || null);
          setIsCreator(data.user.role === 'creator');
        }
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, bio }),
    });
    if (res.ok) {
      setIsEditing(false);
      // Refresh auth state
      const authRes = await fetch('/api/auth/me');
      if (authRes.ok) {
        const authData = await authRes.json();
        useAuthStore.setState({ user: authData.user });
      }
    }
  };

  const handleLinkWallet = async () => {
    if (!walletAddress) return;
    const res = await fetch('/api/wallet/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    });
    if (res.ok) {
      setLinkedWallet(walletAddress);
      setWalletAddress('');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-lg mx-auto">
        {/* Profile header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white font-black text-4xl mx-auto mb-4 ring-4 ring-white/10">
            {user?.displayName?.[0] || user?.username?.[0] || '?'}
          </div>
          <h2 className="text-2xl font-bold text-white">
            {user?.displayName || user?.username}
          </h2>
          <p className="text-gray-500 text-sm">@{user?.username}</p>
          <div className="flex items-center justify-center gap-1 mt-1">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isCreator ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'
            }`}>
              {user?.role?.toUpperCase()}
            </span>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[#1A1A1A] rounded-xl p-3 text-center border border-white/5">
            <Users className="w-4 h-4 text-gray-500 mx-auto mb-1" />
            <p className="text-white font-bold text-lg">{followerCount}</p>
            <p className="text-gray-500 text-[10px]">Followers</p>
          </div>
          <div className="bg-[#1A1A1A] rounded-xl p-3 text-center border border-white/5">
            <Coins className="w-4 h-4 text-amber-400 mx-auto mb-1" />
            <p className="text-amber-400 font-bold text-lg">{(tkBalance / 100).toFixed(0)}</p>
            <p className="text-gray-500 text-[10px]">TK Balance</p>
          </div>
          <div className="bg-[#1A1A1A] rounded-xl p-3 text-center border border-white/5">
            <Calendar className="w-4 h-4 text-gray-500 mx-auto mb-1" />
            <p className="text-white font-bold text-lg">{followingCount}</p>
            <p className="text-gray-500 text-[10px]">Following</p>
          </div>
        </div>

        {/* Bio */}
        <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-semibold text-sm">About</h3>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="text-gray-500 hover:text-white transition-all"
            >
              {isEditing ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
            </button>
          </div>
          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/50 resize-none h-20"
                />
              </div>
              <button
                onClick={handleSave}
                className="w-full py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all"
              >
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">
              {user?.bio || 'No bio yet. Click edit to add one!'}
            </p>
          )}
        </div>

        {/* Wallet Link */}
        <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/5 mb-4">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-gray-500" />
            Linked Wallet
          </h3>
          {linkedWallet ? (
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-sm">✓ Connected</span>
              <span className="text-gray-500 text-xs font-mono truncate">
                {linkedWallet}
              </span>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="Enter wallet address"
                className="flex-1 px-3 py-2 bg-[#111] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50"
              />
              <button
                onClick={handleLinkWallet}
                disabled={!walletAddress}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50"
              >
                Link
              </button>
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-full py-3 bg-[#1A1A1A] border border-white/10 rounded-xl text-red-400 font-semibold flex items-center justify-center gap-2 hover:bg-red-500/10 transition-all"
        >
          <LogOut className="w-5 h-5" />
          Log Out
        </button>
      </div>
    </div>
  );
}
