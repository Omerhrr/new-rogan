'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Gift, Users, Share2, Flag } from 'lucide-react';
import { useStreamStore } from '@/stores/streamStore';
import { useChatStore } from '@/stores/chatStore';
import { useGiftStore, type GiftType, GIFT_TYPES } from '@/stores/giftStore';
import { useWalletStore } from '@/stores/walletStore';
import { useAuthStore } from '@/stores/authStore';
import { ChatPanel } from './ChatPanel';
import { GiftPicker } from './GiftPicker';
import { GiftOverlay } from './GiftOverlay';
import { LiveBadge } from '@/components/shared/LiveBadge';
import { ViewerCount } from '@/components/shared/ViewerCount';

interface LiveRoomProps {
  streamId: string;
  onBack: () => void;
  emitSocket: (event: string, data: unknown) => void;
}

const GRADIENTS = [
  'from-red-900 via-purple-900 to-black',
  'from-blue-900 via-indigo-900 to-black',
  'from-green-900 via-teal-900 to-black',
  'from-orange-900 via-red-900 to-black',
  'from-purple-900 via-pink-900 to-black',
  'from-cyan-900 via-blue-900 to-black',
  'from-amber-900 via-orange-900 to-black',
  'from-rose-900 via-red-900 to-black',
];

export function LiveRoom({ streamId, onBack, emitSocket }: LiveRoomProps) {
  const { streams, viewerCount, setViewerCount } = useStreamStore();
  const { addMessage, addSystemMessage } = useChatStore();
  const { addAnimation, setShowPicker, showPicker } = useGiftStore();
  const { tkBalance, fetchBalance } = useWalletStore();
  const { user } = useAuthStore();
  const [gradientIdx] = useState(Math.floor(Math.random() * GRADIENTS.length));

  const stream = streams.find((s) => s.id === streamId);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (user && streamId) {
      emitSocket('stream:join', { streamId, userId: user.id });
      addSystemMessage(streamId, `You joined the stream!`);
      return () => {
        emitSocket('stream:leave', { streamId, userId: user.id });
      };
    }
  }, [user, streamId, emitSocket, addSystemMessage]);

  const handleSendMessage = useCallback(
    (message: string) => {
      if (!user) return;
      const chatMsg = {
        id: `msg_${Date.now()}`,
        streamId,
        userId: user.id,
        username: user.username,
        message,
        type: 'chat' as const,
        timestamp: Date.now(),
      };
      addMessage(chatMsg);
      emitSocket('chat:message', {
        streamId,
        userId: user.id,
        username: user.username,
        message,
      });
    },
    [user, streamId, addMessage, emitSocket]
  );

  const handleSendGift = useCallback(
    (giftType: GiftType) => {
      if (!user || !stream) return;
      const giftInfo = GIFT_TYPES[giftType];
      const tkAmount = giftInfo.price * 100;

      fetch('/api/gifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamId,
          receiverId: stream.creatorId,
          giftType,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.gift) {
            addAnimation({
              id: `gift_${Date.now()}_${Math.random()}`,
              giftType,
              senderName: user.username,
              amount: tkAmount,
              timestamp: Date.now(),
            });

            addMessage({
              id: `gift_alert_${Date.now()}`,
              streamId,
              userId: user.id,
              username: user.username,
              message: `${user.username} sent a ${giftInfo.emoji} ${giftInfo.name}!`,
              type: 'gift_alert',
              timestamp: Date.now(),
            });

            emitSocket('gift:send', {
              streamId,
              senderId: user.id,
              senderName: user.username,
              receiverId: stream.creatorId,
              giftType,
              amount: tkAmount,
            });

            fetchBalance();
          }
        })
        .catch(console.error);
    },
    [user, stream, streamId, addAnimation, addMessage, emitSocket, fetchBalance]
  );

  if (!stream) {
    return (
      <div className="h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg">Stream not found</p>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0A0A0A] flex flex-col md:flex-row relative">
      {/* Stream video area */}
      <div className="relative flex-1 md:flex-[7] bg-black">
        {/* Gradient background as video placeholder */}
        <div className={`absolute inset-0 bg-gradient-to-br ${GRADIENTS[gradientIdx]}`}>
          {/* Animated particles */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(30)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 bg-white/10 rounded-full"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
                animate={{
                  y: [0, -50, 0],
                  opacity: [0.1, 0.4, 0.1],
                }}
                transition={{
                  duration: 3 + Math.random() * 4,
                  repeat: Infinity,
                  delay: Math.random() * 3,
                }}
              />
            ))}
          </div>
        </div>

        {/* Gift overlay */}
        <GiftOverlay />

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-20 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white hover:bg-black/60 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <LiveBadge />
            <ViewerCount count={viewerCount || stream.viewerCount} />
          </div>
        </div>

        {/* Creator info */}
        <div className="absolute top-16 left-4 z-20 flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white font-bold text-xl ring-2 ring-white/30">
              {stream.creator.displayName?.[0] || stream.creator.username[0]}
            </div>
            <div className="absolute -bottom-1 -right-1">
              <LiveBadge className="text-[7px] px-1 py-0" />
            </div>
          </div>
          <div className="bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1.5">
            <p className="text-white font-semibold text-sm">
              {stream.creator.displayName || stream.creator.username}
            </p>
            <p className="text-gray-300 text-xs">@{stream.creator.username}</p>
          </div>
        </div>

        {/* Stream title overlay */}
        <div className="absolute bottom-4 left-4 z-20 md:hidden">
          <h2 className="text-white font-bold text-lg drop-shadow-lg">{stream.title}</h2>
        </div>

        {/* Right side actions (mobile) */}
        <div className="absolute right-3 bottom-4 z-20 md:hidden flex flex-col items-center gap-3">
          <button
            onClick={() => setShowPicker(true)}
            className="w-12 h-12 rounded-full bg-red-500/80 backdrop-blur flex items-center justify-center text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/30"
          >
            <Gift className="w-6 h-6" />
          </button>
          <button className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-white/70 hover:text-white transition-all">
            <Share2 className="w-5 h-5" />
          </button>
          <button className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-white/70 hover:text-white transition-all">
            <Flag className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Chat panel (desktop: side panel, mobile: bottom sheet) */}
      <div className="hidden md:flex md:flex-[3] flex-col bg-[#111] border-l border-white/10 max-h-screen">
        <div className="p-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" />
            <span className="text-white text-sm font-medium">Live Chat</span>
          </div>
          <button
            onClick={() => setShowPicker(true)}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all"
          >
            <Gift className="w-3.5 h-3.5" />
            Gift
          </button>
        </div>
        <ChatPanel
          streamId={streamId}
          userId={user?.id || ''}
          username={user?.username || ''}
          onSendMessage={handleSendMessage}
        />
      </div>

      {/* Mobile chat - bottom half */}
      <div className="md:hidden h-44 bg-[#111] border-t border-white/10">
        <ChatPanel
          streamId={streamId}
          userId={user?.id || ''}
          username={user?.username || ''}
          onSendMessage={handleSendMessage}
          compact
        />
      </div>

      {/* Gift Picker Modal */}
      {showPicker && (
        <GiftPicker
          onSelect={handleSendGift}
          tkBalance={tkBalance}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
