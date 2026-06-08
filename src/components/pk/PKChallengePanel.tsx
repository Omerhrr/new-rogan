'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, X, Clock, Loader2, Zap, Check, Shield } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { usePKStore } from '@/stores/pkStore';
import { useSocket } from '@/hooks/useSocket';

interface LiveCreator {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  isLive: boolean;
}

interface PKChallengePanelProps {
  streamId: string;
  onClose?: () => void;
}

const DURATION_OPTIONS = [
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
  { value: 600, label: '10 min' },
];

export function PKChallengePanel({ streamId, onClose }: PKChallengePanelProps) {
  const { user } = useAuthStore();
  const { challenge, accept, isLoading } = usePKStore();
  const { emit, on, off } = useSocket();

  const [isExpanded, setIsExpanded] = useState(false);
  const [liveCreators, setLiveCreators] = useState<LiveCreator[]>([]);
  const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
  const [duration, setDuration] = useState(300);
  const [incomingChallenge, setIncomingChallenge] = useState<{
    fromCreatorId: string;
    fromCreatorName: string;
    streamId: string;
    battleId?: string;
  } | null>(null);
  const [challengeSent, setChallengeSent] = useState(false);

  // Fetch live creators
  useEffect(() => {
    fetch('/api/users/search?role=creator')
      .then((res) => res.json())
      .then((data) => {
        if (data.users) {
          setLiveCreators(
            data.users.filter((u: LiveCreator) => u.id !== user?.id && u.isLive)
          );
        }
      })
      .catch(() => {});
  }, [user?.id]);

  // Listen for incoming challenges
  useEffect(() => {
    if (!user) return;

    const cleanup = on(`pk:challenge:${user.id}`, (data: unknown) => {
      const d = data as { fromCreatorId: string; fromCreatorName: string; streamId: string };
      setIncomingChallenge(d);
    });

    return () => {
      cleanup?.();
    };
  }, [user, on, off]);

  const handleSendChallenge = async () => {
    if (!selectedCreator || !streamId) return;

    const battleId = await challenge(selectedCreator, streamId, duration);
    if (battleId) {
      // Emit challenge via WebSocket
      emit('pk:challenge', {
        fromCreatorId: user?.id,
        fromCreatorName: user?.displayName || user?.username,
        toCreatorId: selectedCreator,
        streamId,
      });
      setChallengeSent(true);
      setTimeout(() => {
        setChallengeSent(false);
        setSelectedCreator(null);
        setIsExpanded(false);
      }, 3000);
    }
  };

  const handleAcceptChallenge = async () => {
    // For now, we need to create a new stream for creator2 or use existing
    // In a real app, the challenged creator would have their own stream
    if (incomingChallenge) {
      // The accept is handled via API where we need a streamId for creator2
      // For MVP, we'll accept and use the same stream concept
      setIncomingChallenge(null);
    }
  };

  const handleDeclineChallenge = () => {
    setIncomingChallenge(null);
  };

  if (user?.role !== 'creator') return null;

  return (
    <>
      {/* Incoming Challenge Modal */}
      <AnimatePresence>
        {incomingChallenge && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:w-80 z-50 bg-[#1A1A1A] rounded-2xl border border-amber-500/30 shadow-xl shadow-amber-500/10 p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <motion.div
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              >
                <Swords className="w-5 h-5 text-amber-400" />
              </motion.div>
              <h3 className="text-white font-bold text-sm">PK Challenge!</h3>
            </div>
            <p className="text-gray-400 text-xs mb-3">
              <span className="text-amber-400 font-semibold">{incomingChallenge.fromCreatorName}</span> challenges you to a PK battle!
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleAcceptChallenge}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-1"
              >
                <Check className="w-4 h-4" />
                Accept
              </button>
              <button
                onClick={handleDeclineChallenge}
                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-gray-400 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-1"
              >
                <Shield className="w-4 h-4" />
                Decline
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PK Button (collapsed) */}
      {!isExpanded ? (
        <motion.button
          onClick={() => setIsExpanded(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-red-500/20"
        >
          <Swords className="w-4 h-4" />
          Start PK
        </motion.button>
      ) : (
        /* Expanded Panel */
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-[#1A1A1A] rounded-xl border border-white/10 p-4 w-full max-w-sm"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-bold text-sm flex items-center gap-2">
              <Swords className="w-4 h-4 text-red-500" />
              Challenge a Creator
            </h3>
            <button
              onClick={() => { setIsExpanded(false); setSelectedCreator(null); }}
              className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {challengeSent ? (
            <div className="text-center py-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring' }}
              >
                <Zap className="w-10 h-10 text-amber-400 mx-auto mb-2" />
              </motion.div>
              <p className="text-white font-semibold text-sm">Challenge Sent!</p>
              <p className="text-gray-500 text-xs mt-1">Waiting for response...</p>
            </div>
          ) : (
            <>
              {/* Creator Selection */}
              <div className="mb-3">
                <label className="block text-gray-400 text-[10px] font-medium mb-1.5 uppercase tracking-wider">
                  Select Opponent
                </label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {liveCreators.length === 0 ? (
                    <p className="text-gray-600 text-xs text-center py-3">No live creators available</p>
                  ) : (
                    liveCreators.map((creator) => (
                      <button
                        key={creator.id}
                        onClick={() => setSelectedCreator(creator.id)}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg transition-all ${
                          selectedCreator === creator.id
                            ? 'bg-red-500/10 border border-red-500/30'
                            : 'bg-white/5 border border-transparent hover:border-white/10'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {creator.displayName?.[0] || creator.username[0]}
                        </div>
                        <span className="text-white text-xs font-medium truncate">
                          {creator.displayName || creator.username}
                        </span>
                        {selectedCreator === creator.id && (
                          <Check className="w-3.5 h-3.5 text-red-400 ml-auto" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Duration */}
              <div className="mb-4">
                <label className="block text-gray-400 text-[10px] font-medium mb-1.5 uppercase tracking-wider">
                  Battle Duration
                </label>
                <div className="flex gap-2">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDuration(opt.value)}
                      className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all border ${
                        duration === opt.value
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-white/5 text-gray-400 border-transparent hover:border-white/10'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Send Challenge */}
              <button
                onClick={handleSendChallenge}
                disabled={!selectedCreator || isLoading}
                className="w-full py-2.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Swords className="w-4 h-4" />
                    Send Challenge
                  </>
                )}
              </button>
            </>
          )}
        </motion.div>
      )}
    </>
  );
}
