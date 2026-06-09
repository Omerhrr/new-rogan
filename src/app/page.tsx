'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useStreamStore } from '@/stores/streamStore';
import { useChatStore } from '@/stores/chatStore';
import { useDMStore } from '@/stores/dmStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useSocket } from '@/hooks/useSocket';
import { AuthView } from '@/components/auth/AuthView';
import { LiveFeed } from '@/components/live/LiveFeed';
import { LiveRoom } from '@/components/live/LiveRoom';
import { GoLiveView } from '@/components/live/GoLiveView';
import { CreatorDashboard } from '@/components/dashboard/CreatorDashboard';
import { WalletView } from '@/components/wallet/WalletView';
import { DMView } from '@/components/dm/DMView';
import { ProfileView } from '@/components/profile/ProfileView';
import { MarketplaceView } from '@/components/marketplace/MarketplaceView';
import { PKBattleArena } from '@/components/pk/PKBattleArena';
import { SubscriptionsView } from '@/components/subscriptions/SubscriptionsView';
import { BottomNav, type ViewType } from '@/components/shared/BottomNav';
import { Sidebar } from '@/components/shared/Sidebar';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

export default function HomePage() {
  const { user, isAuthenticated, isLoading: authLoading, checkAuth } = useAuthStore();
  const { fetchStreams } = useStreamStore();
  const { addMessage } = useChatStore();
  const { fetchConversations } = useDMStore();
  const { fetchNotifications } = useNotificationStore();
  const { emit, on, off } = useSocket(user?.id);

  const [activeView, setActiveView] = useState<ViewType>('feed');
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [isInLiveRoom, setIsInLiveRoom] = useState(false);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Load data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchStreams();
      fetchConversations();
      fetchNotifications();
    }
  }, [isAuthenticated, fetchStreams, fetchConversations, fetchNotifications]);

  // Socket event listeners
  useEffect(() => {
    if (!isAuthenticated) return;

    const cleanupChatMessage = on('chat:message', (msg: unknown) => {
      const chatMsg = msg as { id: string; streamId: string; userId: string; username: string; message: string; type: string; timestamp: number };
      addMessage({
        id: chatMsg.id,
        streamId: chatMsg.streamId,
        userId: chatMsg.userId,
        username: chatMsg.username,
        message: chatMsg.message,
        type: (chatMsg.type as 'chat' | 'system' | 'gift_alert') || 'chat',
        timestamp: chatMsg.timestamp,
      });
    });

    const cleanupGiftReceived = on('gift:received', (gift: unknown) => {
      const g = gift as { streamId: string; senderName: string; giftType: string; amount: number };
      addMessage({
        id: `gift_alert_${Date.now()}`,
        streamId: g.streamId,
        userId: 'system',
        username: g.senderName,
        message: `${g.senderName} sent a ${g.giftType}! 🎁`,
        type: 'gift_alert',
        timestamp: Date.now(),
      });
    });

    const cleanupLiveList = on('stream:liveList', () => {
      fetchStreams();
    });

    return () => {
      cleanupChatMessage?.();
      cleanupGiftReceived?.();
      cleanupLiveList?.();
    };
  }, [isAuthenticated, on, off, addMessage, fetchStreams]);

  const handleEnterStream = useCallback((streamId: string) => {
    setActiveStreamId(streamId);
    setIsInLiveRoom(true);
  }, []);

  const handleLeaveStream = useCallback(() => {
    setActiveStreamId(null);
    setIsInLiveRoom(false);
  }, []);

  const handleViewChange = useCallback((view: ViewType) => {
    setActiveView(view);
    if (view !== 'feed') {
      setIsInLiveRoom(false);
      setActiveStreamId(null);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await useAuthStore.getState().logout();
  }, []);

  // Show auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading Rogan Live...</p>
        </div>
      </div>
    );
  }

  // Show auth view if not authenticated
  if (!isAuthenticated) {
    return <AuthView />;
  }

  // If in live room, show it full screen
  if (isInLiveRoom && activeStreamId) {
    return <LiveRoom streamId={activeStreamId} onBack={handleLeaveStream} emitSocket={emit} />;
  }

  // Main app layout
  const renderView = () => {
    switch (activeView) {
      case 'feed':
        return <LiveFeed onEnterStream={handleEnterStream} />;
      case 'golive':
        return <GoLiveView onStreamStarted={handleEnterStream} emitSocket={emit} />;
      case 'dashboard':
        return <CreatorDashboard />;
      case 'pk':
        return <PKBattleArena />;
      case 'subscriptions':
        return <SubscriptionsView />;
      case 'messages':
        return <DMView />;
      case 'marketplace':
        return <MarketplaceView />;
      case 'wallet':
        return <WalletView />;
      case 'profile':
        return <ProfileView />;
      default:
        return <LiveFeed onEnterStream={handleEnterStream} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#0A0A0A]">
      {/* Desktop Sidebar */}
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        onLogout={handleLogout}
        username={user?.username}
        isCreator={user?.role === 'creator'}
      />

      {/* Main content */}
      <main className="flex-1 min-h-screen relative">
        <ErrorBoundary>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
        </ErrorBoundary>
      </main>

      {/* Mobile Bottom Nav */}
      <BottomNav
        activeView={activeView}
        onViewChange={handleViewChange}
      />
    </div>
  );
}
