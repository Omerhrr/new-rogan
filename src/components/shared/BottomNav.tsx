'use client';

import { Home, PlusCircle, MessageCircle, User, Wallet, Briefcase } from 'lucide-react';
import { motion } from 'framer-motion';

export type ViewType = 'feed' | 'golive' | 'messages' | 'wallet' | 'marketplace' | 'profile' | 'dashboard';

interface BottomNavProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  unreadDMs?: number;
}

export function BottomNav({ activeView, onViewChange, unreadDMs = 0 }: BottomNavProps) {
  const navItems: { view: ViewType; icon: typeof Home; label: string }[] = [
    { view: 'feed', icon: Home, label: 'Live' },
    { view: 'golive', icon: PlusCircle, label: 'Go Live' },
    { view: 'marketplace', icon: Briefcase, label: 'Services' },
    { view: 'messages', icon: MessageCircle, label: 'DMs' },
    { view: 'wallet', icon: Wallet, label: 'Wallet' },
    { view: 'profile', icon: User, label: 'Me' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-lg border-t border-white/10 md:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map(({ view, icon: Icon, label }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            className="relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-manipulation"
          >
            {activeView === view && (
              <motion.div
                layoutId="bottomNavIndicator"
                className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-red-500 rounded-full"
              />
            )}
            <Icon
              className={`w-[18px] h-[18px] ${
                activeView === view ? 'text-red-500' : 'text-gray-500'
              }`}
            />
            <span
              className={`text-[9px] leading-tight ${
                activeView === view ? 'text-red-500 font-semibold' : 'text-gray-500'
              }`}
            >
              {label}
            </span>
            {view === 'messages' && unreadDMs > 0 && (
              <span className="absolute top-1 right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                {unreadDMs > 9 ? '9+' : unreadDMs}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
