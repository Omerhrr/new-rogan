'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Timer, Trophy, Sparkles, Loader2, Crown, Zap, Clock, Check, Shield, Search } from 'lucide-react';
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

const DURATION_OPTIONS = [
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
  { value: 600, label: '10 min' },
];

export function PKBattleArena() {
  const { user } = useAuthStore();
  const { activeBattles, activeBattle, battleScores, timeRemaining, fetchActiveBattles, setActiveBattle, setScores, setTimeRemaining, endBattle, challenge, accept, isLoading } = usePKStore();
  const { emit, on, off } = useSocket();

  const [showWinner, setShowWinner] = useState(false);
  const [winnerName, setWinnerName] = useState('');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [confettiParticles, setConfettiParticles] = useState<Array<{ id: number; x: number; y: number; color: string; delay: number }>>([]);
  const [showChallengePanel, setShowChallengePanel] = useState(false);
  const [liveCreators, setLiveCreators] = useState<LiveCreator[]>([]);
  const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
  const [challengeDuration, setChallengeDuration] = useState(300);
  const [challengeSent, setChallengeSent] = useState(false);
  const [incomingChallenge, setIncomingChallenge] = useState<{
    fromCreatorId: string;
    fromCreatorName: string;
    streamId: string;
    battleId?: string;
  } | null>(null);
  const [pendingBattleId, setPendingBattleId] = useState<string | null>(null);

  useEffect(() => {
    fetchActiveBattles();
  }, [fetchActiveBattles]);

  // Fetch live creators for challenge
  useEffect(() => {
    if (showChallengePanel) {
      fetch('/api/users/search?role=creator')
        .then((res) => res.json())
        .then((data) => {
          if (data.users) {
            setLiveCreators(
              data.users.filter((u: LiveCreator) => u.id !== user?.id)
            );
          }
        })
        .catch(() => {});
    }
  }, [showChallengePanel, user?.id]);

  // Socket listeners for PK events
  useEffect(() => {
    const cleanupScoreUpdate = on('pk:scoreUpdate', (data: unknown) => {
      const d = data as { battleId: string; creator1Score: number; creator2Score: number };
      setScores(d.creator1Score, d.creator2Score);
    });

    const cleanupTimer = on('pk:timer', (data: unknown) => {
      const d = data as { timeRemaining: number };
      setTimeRemaining(d.timeRemaining);
    });

    const cleanupEnded = on('pk:ended', (data: unknown) => {
      const d = data as { winnerId: string | null; creator1Score: number; creator2Score: number };
      setScores(d.creator1Score, d.creator2Score);
      if (d.winnerId) {
        setWinnerId(d.winnerId);
        setShowWinner(true);
        const particles = Array.from({ length: 30 }, (_, i) => ({
          id: i,
          x: Math.random() * 100,
          y: Math.random() * 100,
          color: ['#DC2626', '#EAB308', '#8B5CF6', '#3B82F6', '#10B981'][Math.floor(Math.random() * 5)],
          delay: Math.random() * 0.5,
        }));
        setConfettiParticles(particles);
      }
    });

    const cleanupStarted = on('pk:started', (data: unknown) => {
      const d = data as { battleId: string; creator1Id: string; creator2Id: string; duration: number };
      fetchActiveBattles();
    });

    // Listen for incoming challenges
    let cleanupChallenge: (() => void) | undefined;
    if (user) {
      cleanupChallenge = on('pk:challenge', (data: unknown) => {
        const d = data as { fromCreatorId: string; fromCreatorName: string; streamId: string; battleId?: string };
        setIncomingChallenge(d);
      });
    }

    // Listen for battle acceptance
    let cleanupAccepted: (() => void) | undefined;
    if (user) {
      cleanupAccepted = on('pk:started', (data: unknown) => {
        const d = data as { battleId: string; streamId: string; opponentId: string };
        setChallengeSent(false);
        setShowChallengePanel(false);
        fetchActiveBattles();
      });
    }

    return () => {
      cleanupScoreUpdate?.();
      cleanupTimer?.();
      cleanupEnded?.();
      cleanupStarted?.();
      cleanupChallenge?.();
      cleanupAccepted?.();
    };
  }, [on, off, setScores, setTimeRemaining, fetchActiveBattles, user]);

  const handleEndBattle = useCallback(async (battleId: string) => {
    await endBattle(battleId);
    setShowWinner(false);
    fetchActiveBattles();
  }, [endBattle, fetchActiveBattles]);

  const handleSendChallenge = async () => {
    if (!selectedCreator) return;
    // Need a stream to challenge from - use first active stream or create one
    const streams = await fetch('/api/streams').then(r => r.json()).then(d => d.streams || []);
    const myStream = streams.find((s: { creatorId: string; isLive: boolean }) => s.creatorId === user?.id && s.isLive);

    if (!myStream) {
      alert('You need to be live to start a PK battle! Go Live first.');
      return;
    }

    const battleId = await challenge(selectedCreator, myStream.id, challengeDuration);
    if (battleId) {
      emit('pk:challenge', {
        fromCreatorId: user?.id,
        fromCreatorName: user?.displayName || user?.username,
        toCreatorId: selectedCreator,
        streamId: myStream.id,
      });
      setPendingBattleId(battleId);
      setChallengeSent(true);
    }
  };

  const handleAcceptChallenge = async () => {
    if (!incomingChallenge) return;
    // We need the battle ID from the pending battles
    const battles = await fetch('/api/pk/active').then(r => r.json()).then(d => d.battles || []);
    const pendingBattle = battles.find((b: { creator2Id: string; status: string }) =>
      b.creator2Id === user?.id && b.status === 'pending'
    );

    if (pendingBattle) {
      await accept(pendingBattle.id);
      emit('pk:start', {
        battleId: pendingBattle.id,
        streamId: pendingBattle.streamId,
        creator1Id: pendingBattle.creator1Id,
        creator2Id: pendingBattle.creator2Id,
        duration: pendingBattle.duration,
      });
      setActiveBattle(pendingBattle);
    }
    setIncomingChallenge(null);
  };

  const handleDeclineChallenge = () => {
    setIncomingChallenge(null);
  };

  // If we have an active battle, show the battle view
  const renderActiveBattle = () => {
    if (!activeBattle) return null;

    const c1 = activeBattle.creator1;
    const c2 = activeBattle.creator2;
    const c1Score = battleScores?.creator1Score ?? activeBattle.creator1Score;
    const c2Score = battleScores?.creator2Score ?? activeBattle.creator2Score;
    const totalScore = Math.max(c1Score + c2Score, 1);
    const c1Percent = (c1Score / totalScore) * 100;
    const c2Percent = (c2Score / totalScore) * 100;
    const timer = timeRemaining ?? activeBattle.duration;
    const minutes = Math.floor(timer / 60);
    const seconds = timer % 60;

    const isParticipant = user?.id === c1.id || user?.id === c2.id;
    const determinedWinnerName = winnerId === c1.id
      ? c1.displayName || c1.username
      : winnerId === c2.id
      ? c2.displayName || c2.username
      : '';

    return (
      <div className="relative min-h-[80vh] flex flex-col">
        {/* Confetti */}
        <AnimatePresence>
          {showWinner && confettiParticles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 1, y: -20, x: `${p.x}vw` }}
              animate={{ opacity: 0, y: '100vh', rotate: 720 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2, delay: p.delay }}
              className="fixed w-2 h-2 rounded-full z-50 pointer-events-none"
              style={{ backgroundColor: p.color, left: `${p.x}%` }}
            />
          ))}
        </AnimatePresence>

        {/* Winner overlay */}
        <AnimatePresence>
          {showWinner && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ y: 50 }}
                animate={{ y: 0 }}
                className="text-center"
              >
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                >
                  <Trophy className="w-20 h-20 text-amber-400 mx-auto mb-4 drop-shadow-lg" />
                </motion.div>
                <h2 className="text-3xl font-black text-white mb-2">WINNER!</h2>
                <p className="text-2xl font-bold text-amber-400">{determinedWinnerName}</p>
                <div className="flex items-center justify-center gap-4 mt-4 text-white/60 text-sm">
                  <span className="text-red-400 font-bold">{c1Score}</span>
                  <span>vs</span>
                  <span className="text-blue-400 font-bold">{c2Score}</span>
                </div>
                <button
                  onClick={() => handleEndBattle(activeBattle.id)}
                  className="mt-6 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all"
                >
                  Close
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Timer */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <Timer className="w-4 h-4 text-gray-400" />
          <span className={`text-lg font-mono font-bold ${timer <= 30 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
        </div>

        {/* VS Badge */}
        <div className="flex items-center justify-center mb-2">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="relative z-10 w-14 h-14 rounded-full bg-gradient-to-br from-red-600 to-amber-500 flex items-center justify-center shadow-lg shadow-red-500/30"
          >
            <span className="text-white font-black text-xs">VS</span>
          </motion.div>
        </div>

        {/* Battle split screen */}
        <div className="relative flex items-stretch gap-2 mb-6">
          {/* Creator 1 - Red Side */}
          <motion.div
            className="flex-1 bg-gradient-to-b from-red-950/40 to-[#1A1A1A] rounded-2xl border border-red-500/20 p-4 text-center"
            animate={{ boxShadow: c1Score > c2Score ? '0 0 30px rgba(220,38,38,0.3)' : '0 0 0px transparent' }}
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white font-bold text-xl mx-auto mb-3 ring-2 ring-red-500/50">
              {c1.displayName?.[0] || c1.username[0]}
            </div>
            <p className="text-white font-bold text-sm truncate">{c1.displayName || c1.username}</p>
            <motion.p
              key={c1Score}
              initial={{ scale: 1.5 }}
              animate={{ scale: 1 }}
              className="text-red-400 text-3xl font-black mt-2"
            >
              {c1Score}
            </motion.p>
            <p className="text-red-400/60 text-xs mt-1">points</p>
          </motion.div>

          {/* Creator 2 - Blue Side */}
          <motion.div
            className="flex-1 bg-gradient-to-b from-blue-950/40 to-[#1A1A1A] rounded-2xl border border-blue-500/20 p-4 text-center"
            animate={{ boxShadow: c2Score > c1Score ? '0 0 30px rgba(59,130,246,0.3)' : '0 0 0px transparent' }}
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xl mx-auto mb-3 ring-2 ring-blue-500/50">
              {c2.displayName?.[0] || c2.username[0]}
            </div>
            <p className="text-white font-bold text-sm truncate">{c2.displayName || c2.username}</p>
            <motion.p
              key={c2Score}
              initial={{ scale: 1.5 }}
              animate={{ scale: 1 }}
              className="text-blue-400 text-3xl font-black mt-2"
            >
              {c2Score}
            </motion.p>
            <p className="text-blue-400/60 text-xs mt-1">points</p>
          </motion.div>
        </div>

        {/* Score bar */}
        <div className="relative h-4 bg-white/5 rounded-full overflow-hidden mb-4">
          <motion.div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-red-500 to-red-400 rounded-l-full"
            animate={{ width: `${c1Percent}%` }}
            transition={{ duration: 0.5 }}
          />
          <motion.div
            className="absolute right-0 top-0 h-full bg-gradient-to-l from-blue-500 to-blue-400 rounded-r-full"
            animate={{ width: `${c2Percent}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        {/* End battle button (for participants) */}
        {isParticipant && activeBattle.status === 'active' && (
          <button
            onClick={() => handleEndBattle(activeBattle.id)}
            className="w-full py-3 bg-white/5 hover:bg-white/10 text-gray-400 font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Crown className="w-4 h-4" />
            End Battle
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-6">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Swords className="w-6 h-6 text-red-500" />
            <h1 className="text-2xl font-bold text-white">PK Battles</h1>
          </div>
          {user?.role === 'creator' && !activeBattle && (
            <button
              onClick={() => setShowChallengePanel(!showChallengePanel)}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-red-500/20"
            >
              <Swords className="w-4 h-4" />
              Start PK
            </button>
          )}
        </div>

        {/* Incoming Challenge */}
        <AnimatePresence>
          {incomingChallenge && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-[#1A1A1A] rounded-xl border border-amber-500/30 shadow-xl shadow-amber-500/10 p-4 mb-4"
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
                  disabled={isLoading}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-1"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
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

        {/* Challenge Panel */}
        <AnimatePresence>
          {showChallengePanel && !activeBattle && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-[#1A1A1A] rounded-xl border border-white/10 p-4 mb-6 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-bold text-sm flex items-center gap-2">
                  <Swords className="w-4 h-4 text-red-500" />
                  Challenge a Creator
                </h3>
              </div>

              {challengeSent ? (
                <div className="text-center py-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring' }}
                  >
                    <Zap className="w-12 h-12 text-amber-400 mx-auto mb-2" />
                  </motion.div>
                  <p className="text-white font-semibold">Challenge Sent!</p>
                  <p className="text-gray-500 text-sm mt-1">Waiting for response...</p>
                </div>
              ) : (
                <>
                  {/* Creator Selection */}
                  <div className="mb-3">
                    <label className="block text-gray-400 text-[10px] font-medium mb-1.5 uppercase tracking-wider">
                      Select Opponent
                    </label>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {liveCreators.length === 0 ? (
                        <p className="text-gray-600 text-xs text-center py-3">No creators available</p>
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
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {creator.displayName?.[0] || creator.username[0]}
                            </div>
                            <div className="text-left">
                              <span className="text-white text-xs font-medium block truncate">
                                {creator.displayName || creator.username}
                              </span>
                              {creator.isLive && (
                                <span className="text-red-400 text-[10px] flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                  LIVE
                                </span>
                              )}
                            </div>
                            {selectedCreator === creator.id && (
                              <Check className="w-4 h-4 text-red-400 ml-auto" />
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
                          onClick={() => setChallengeDuration(opt.value)}
                          className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all border ${
                            challengeDuration === opt.value
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
        </AnimatePresence>

        {/* Active Battle */}
        {activeBattle ? (
          renderActiveBattle()
        ) : (
          <>
            {/* Active Battles List */}
            <div className="mb-6">
              <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                Live Battles
              </h2>
              {activeBattles.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-[#1A1A1A] flex items-center justify-center mx-auto mb-3">
                    <Swords className="w-8 h-8 text-gray-600" />
                  </div>
                  <p className="text-gray-400 font-medium">No active PK battles</p>
                  <p className="text-gray-600 text-sm mt-1">
                    {user?.role === 'creator'
                      ? 'Start a battle by clicking the Start PK button!'
                      : 'Check back later for live PK battles!'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeBattles.map((battle) => (
                    <motion.button
                      key={battle.id}
                      onClick={() => setActiveBattle(battle)}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="w-full bg-[#1A1A1A] rounded-xl border border-white/10 p-4 text-left hover:border-white/20 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        {/* Creator 1 */}
                        <div className="flex items-center gap-2 flex-1">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white font-bold text-sm">
                            {battle.creator1.displayName?.[0] || battle.creator1.username[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white text-xs font-semibold truncate">{battle.creator1.displayName || battle.creator1.username}</p>
                            <p className="text-red-400 text-xs font-bold">{battle.creator1Score} pts</p>
                          </div>
                        </div>

                        {/* VS */}
                        <div className="flex items-center justify-center">
                          <span className="px-2 py-1 bg-gradient-to-r from-red-600 to-blue-600 rounded-lg text-white text-[10px] font-black">
                            VS
                          </span>
                        </div>

                        {/* Creator 2 */}
                        <div className="flex items-center gap-2 flex-1 justify-end">
                          <div className="min-w-0 text-right">
                            <p className="text-white text-xs font-semibold truncate">{battle.creator2.displayName || battle.creator2.username}</p>
                            <p className="text-blue-400 text-xs font-bold">{battle.creator2Score} pts</p>
                          </div>
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm">
                            {battle.creator2.displayName?.[0] || battle.creator2.username[0]}
                          </div>
                        </div>
                      </div>

                      {/* Status badge */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          battle.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {battle.status.toUpperCase()}
                        </span>
                        {battle.stream && (
                          <span className="text-gray-500 text-[10px] truncate">{battle.stream.title}</span>
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>

            {/* Info Card */}
            <div className="bg-[#1A1A1A] rounded-xl border border-white/10 p-4">
              <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                How PK Battles Work
              </h3>
              <ul className="space-y-2 text-gray-400 text-xs">
                <li className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">•</span>
                  Creators go head-to-head in a live battle
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5">•</span>
                  Viewers send gifts to support their favorite creator
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">•</span>
                  Each gift adds points to that creator&apos;s score
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">•</span>
                  The creator with the most points when time runs out wins!
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
