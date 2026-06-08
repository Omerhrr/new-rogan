'use client';

import { Home, PlusCircle, MessageCircle, User, Wallet, Briefcase, LayoutDashboard, LogOut, Swords, Heart } from 'lucide-react';
import type { ViewType } from './BottomNav';

interface SidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  onLogout: () => void;
  username?: string;
  isCreator?: boolean;
  unreadDMs?: number;
}

export function Sidebar({ activeView, onViewChange, onLogout, username, isCreator, unreadDMs = 0 }: SidebarProps) {
  const navItems: { view: ViewType; icon: typeof Home; label: string }[] = [
    { view: 'feed', icon: Home, label: 'Live Feed' },
    { view: 'golive', icon: PlusCircle, label: 'Go Live' },
    ...(isCreator ? [{ view: 'dashboard' as ViewType, icon: LayoutDashboard, label: 'Dashboard' }] : []),
    { view: 'pk', icon: Swords, label: 'PK Battles' },
    { view: 'messages', icon: MessageCircle, label: 'Messages' },
    { view: 'marketplace', icon: Briefcase, label: 'Marketplace' },
    { view: 'subscriptions', icon: Heart, label: 'Subscriptions' },
    { view: 'wallet', icon: Wallet, label: 'Wallet' },
    { view: 'profile', icon: User, label: 'Profile' },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 bg-[#0A0A0A] border-r border-white/10 h-screen sticky top-0">
      <div className="p-6 border-b border-white/10">
        <h1 className="text-2xl font-black text-white tracking-tight">
          ROGAN<span className="text-red-500">LIVE</span>
        </h1>
        <p className="text-xs text-gray-500 mt-1">Live Streaming Platform</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ view, icon: Icon, label }) => {
          const isActive = activeView === view;
          return (
            <button
              key={view}
              onClick={() => onViewChange(view)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive
                  ? 'bg-red-500/10 text-red-500'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-medium">{label}</span>
              {view === 'messages' && unreadDMs > 0 && (
                <span className="ml-auto w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                  {unreadDMs > 9 ? '9+' : unreadDMs}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        {username && (
          <div className="flex items-center gap-3 px-4 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold">
              {username[0].toUpperCase()}
            </div>
            <span className="text-sm text-gray-300 truncate">{username}</span>
          </div>
        )}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-500 hover:bg-white/5 hover:text-red-400 transition-all"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm">Log Out</span>
        </button>
      </div>
    </aside>
  );
}
