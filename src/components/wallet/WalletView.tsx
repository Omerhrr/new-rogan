'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useWalletStore } from '@/stores/walletStore';
import { Coins, ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';

export function WalletView() {
  const { tkBalance, roganEquivalent, isLoading, fetchBalance, deposit, withdraw } = useWalletStore();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [transactions, setTransactions] = useState<Array<{
    id: string;
    type: string;
    amount: number;
    createdAt: string;
    fromUser: { username: string; displayName: string | null };
    toUser: { username: string; displayName: string | null };
  }>>([]);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchBalance();
    fetch('/api/economy/transactions')
      .then((res) => res.json())
      .then((data) => setTransactions(data.transactions || []))
      .catch(console.error);
  }, [fetchBalance]);

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) return;
    const success = await deposit(amount);
    if (success) {
      setStatusMessage(`Deposited ${amount} ROGAN successfully!`);
      setDepositAmount('');
      // Refresh transactions
      const res = await fetch('/api/economy/transactions');
      const data = await res.json();
      setTransactions(data.transactions || []);
    } else {
      setStatusMessage('Deposit failed');
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    const tkUnits = Math.floor(amount * 100);
    if (isNaN(tkUnits) || tkUnits <= 0) return;
    const success = await withdraw(tkUnits);
    if (success) {
      setStatusMessage(`Withdrawn ${amount} TK successfully!`);
      setWithdrawAmount('');
      const res = await fetch('/api/economy/transactions');
      const data = await res.json();
      setTransactions(data.transactions || []);
    } else {
      setStatusMessage('Withdrawal failed - insufficient balance');
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Wallet</h1>

        {/* Balance card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-[#1A1A1A] to-[#111] rounded-2xl p-6 border border-white/10 mb-6"
        >
          <div className="flex items-center gap-2 mb-1">
            <Coins className="w-5 h-5 text-amber-400" />
            <span className="text-gray-500 text-sm">Your Balance</span>
          </div>
          <p className="text-4xl font-black text-white mb-1">
            {(tkBalance / 100).toFixed(2)} <span className="text-amber-400 text-xl">TK</span>
          </p>
          <p className="text-gray-500 text-sm">
            ≈ {roganEquivalent.toFixed(2)} ROGAN
          </p>
        </motion.div>

        {/* Deposit/Withdraw tabs */}
        <div className="bg-[#1A1A1A] rounded-xl border border-white/10 mb-6">
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveTab('deposit')}
              className={`flex-1 py-3 text-sm font-semibold transition-all ${
                activeTab === 'deposit'
                  ? 'text-green-400 border-b-2 border-green-400'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              <ArrowDownRight className="w-4 h-4 inline mr-1" />
              Deposit
            </button>
            <button
              onClick={() => setActiveTab('withdraw')}
              className={`flex-1 py-3 text-sm font-semibold transition-all ${
                activeTab === 'withdraw'
                  ? 'text-red-400 border-b-2 border-red-400'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              <ArrowUpRight className="w-4 h-4 inline mr-1" />
              Withdraw
            </button>
          </div>

          <div className="p-4">
            {activeTab === 'deposit' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Amount (ROGAN)</label>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-3 bg-[#111] border border-white/10 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                    min="0"
                    step="0.01"
                  />
                </div>
                <p className="text-xs text-gray-600">
                  You&apos;ll receive: {depositAmount ? (parseFloat(depositAmount) * 100).toFixed(0) : '0'} TK
                </p>
                <button
                  onClick={handleDeposit}
                  disabled={!depositAmount || parseFloat(depositAmount) <= 0}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
                >
                  Deposit ROGAN
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Amount (TK)</label>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0"
                    className="w-full px-4 py-3 bg-[#111] border border-white/10 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
                    min="0"
                  />
                </div>
                <p className="text-xs text-gray-600">
                  You&apos;ll receive: {withdrawAmount ? (parseFloat(withdrawAmount) / 100).toFixed(2) : '0.00'} ROGAN
                </p>
                <button
                  onClick={handleWithdraw}
                  disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
                >
                  Withdraw to ROGAN
                </button>
              </div>
            )}

            {statusMessage && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3 text-sm text-center text-amber-400"
              >
                {statusMessage}
              </motion.p>
            )}
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-[#1A1A1A] rounded-xl border border-white/10 p-4">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-500" />
            Transaction History
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {transactions.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-4">No transactions yet</p>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div>
                    <p className="text-white text-sm font-medium capitalize">
                      {tx.type.replace('_', ' ')}
                    </p>
                    <p className="text-gray-500 text-xs">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <p className={`text-sm font-bold ${
                    ['deposit', 'gift_receive'].includes(tx.type) ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {['deposit', 'gift_receive'].includes(tx.type) ? '+' : '-'}
                    {(tx.amount / 100).toFixed(2)} TK
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
