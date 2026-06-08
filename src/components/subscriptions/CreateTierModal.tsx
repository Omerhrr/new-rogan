'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Trash2, Loader2, Heart, Star, Crown } from 'lucide-react';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

interface CreateTierModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TIER_OPTIONS = [
  { value: 'basic', label: 'Basic', icon: Heart, color: 'text-gray-400', bg: 'bg-gray-500/20' },
  { value: 'premium', label: 'Premium', icon: Star, color: 'text-amber-400', bg: 'bg-amber-500/20' },
  { value: 'vip', label: 'VIP', icon: Crown, color: 'text-purple-400', bg: 'bg-purple-500/20' },
];

export function CreateTierModal({ isOpen, onClose }: CreateTierModalProps) {
  const { createTier, isLoading } = useSubscriptionStore();

  const [name, setName] = useState('');
  const [tier, setTier] = useState('basic');
  const [price, setPrice] = useState('');
  const [benefits, setBenefits] = useState<string[]>([]);
  const [newBenefit, setNewBenefit] = useState('');

  const handleAddBenefit = () => {
    if (newBenefit.trim()) {
      setBenefits([...benefits, newBenefit.trim()]);
      setNewBenefit('');
    }
  };

  const handleRemoveBenefit = (index: number) => {
    setBenefits(benefits.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price) return;

    const success = await createTier({
      name: name.trim(),
      tier,
      price: Math.round(parseFloat(price) * 100), // Convert TK to units
      benefits,
    });

    if (success) {
      setName('');
      setTier('basic');
      setPrice('');
      setBenefits([]);
      setNewBenefit('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-md bg-[#1A1A1A] rounded-2xl border border-white/10 overflow-hidden max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-white font-bold text-lg">Create Subscription Tier</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Tier name */}
          <div>
            <label className="block text-gray-400 text-xs font-medium mb-1.5">Tier Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Premium Supporter"
              className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-red-500/50"
              required
            />
          </div>

          {/* Tier level */}
          <div>
            <label className="block text-gray-400 text-xs font-medium mb-1.5">Tier Level</label>
            <div className="flex gap-2">
              {TIER_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTier(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                      tier === opt.value
                        ? `${opt.bg} ${opt.color} border-white/20`
                        : 'bg-white/5 text-gray-500 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="block text-gray-400 text-xs font-medium mb-1.5">Monthly Price (TK)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 5"
              min="1"
              step="1"
              className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-red-500/50"
              required
            />
          </div>

          {/* Benefits */}
          <div>
            <label className="block text-gray-400 text-xs font-medium mb-1.5">Benefits</label>
            <div className="space-y-2 mb-2">
              {benefits.map((benefit, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-1.5 bg-white/5 rounded-lg text-gray-300 text-xs">
                    {benefit}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveBenefit(i)}
                    className="p-1.5 rounded-lg bg-white/5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newBenefit}
                onChange={(e) => setNewBenefit(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddBenefit())}
                placeholder="e.g. Private chat access"
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-xs placeholder-gray-600 focus:outline-none focus:border-red-500/50"
              />
              <button
                type="button"
                onClick={handleAddBenefit}
                className="px-3 py-2 bg-white/5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading || !name.trim() || !price}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Create Tier'
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
