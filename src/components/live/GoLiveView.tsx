'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useStreamStore } from '@/stores/streamStore';
import { useAuthStore } from '@/stores/authStore';
import { Radio, X } from 'lucide-react';
import { LiveBadge } from '@/components/shared/LiveBadge';

interface GoLiveViewProps {
  onStreamStarted: (streamId: string) => void;
  emitSocket: (event: string, data: unknown) => void;
}

export function GoLiveView({ onStreamStarted, emitSocket }: GoLiveViewProps) {
  const { createStream } = useStreamStore();
  const { user } = useAuthStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [currentStreamId, setCurrentStreamId] = useState<string | null>(null);

  const handleStartStream = async () => {
    if (!title.trim()) return;
    setIsStarting(true);
    try {
      const stream = await createStream(title, description);
      if (stream) {
        setIsLive(true);
        setCurrentStreamId(stream.id);
        emitSocket('stream:start', {
          streamId: stream.id,
          creatorId: user?.id,
          creatorName: user?.username,
          title: stream.title,
        });
        onStreamStarted(stream.id);
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleEndStream = async () => {
    if (!currentStreamId) return;
    await useStreamStore.getState().endStream(currentStreamId);
    emitSocket('stream:end', { streamId: currentStreamId });
    setIsLive(false);
    setCurrentStreamId(null);
    setTitle('');
    setDescription('');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
          <Radio className="w-6 h-6 text-red-500" />
          Go Live
        </h1>

        {isLive ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#1A1A1A] rounded-2xl p-6 border border-red-500/20 text-center"
          >
            <div className="flex justify-center mb-4">
              <LiveBadge className="text-base px-4 py-1" />
            </div>
            <h2 className="text-white text-xl font-bold mb-2">You&apos;re Live!</h2>
            <p className="text-gray-400 text-sm mb-6">Your stream is being broadcast to viewers</p>

            <div className="bg-[#111] rounded-xl p-4 mb-4">
              <p className="text-gray-500 text-xs mb-1">Stream Title</p>
              <p className="text-white font-semibold">{title}</p>
            </div>

            <button
              onClick={handleEndStream}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all"
            >
              <X className="w-5 h-5" />
              End Stream
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#1A1A1A] rounded-2xl p-6 border border-white/10"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Stream Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What are you streaming today?"
                  className="w-full px-4 py-3 bg-[#111] border border-white/10 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell viewers what your stream is about..."
                  className="w-full px-4 py-3 bg-[#111] border border-white/10 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 resize-none h-24"
                  maxLength={500}
                />
              </div>

              <button
                onClick={handleStartStream}
                disabled={!title.trim() || isStarting}
                className="w-full py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-600/20 flex items-center justify-center gap-2"
              >
                {isStarting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Radio className="w-5 h-5" />
                    Start Streaming
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
