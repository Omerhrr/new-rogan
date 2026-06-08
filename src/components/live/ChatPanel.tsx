'use client';

import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Send } from 'lucide-react';
import { useState } from 'react';

interface ChatPanelProps {
  streamId: string;
  userId: string;
  username: string;
  onSendMessage: (message: string) => void;
  compact?: boolean;
}

export function ChatPanel({ streamId, userId, username, onSendMessage, compact = false }: ChatPanelProps) {
  const { messages } = useChatStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const streamMessages = messages.filter((m) => m.streamId === streamId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamMessages.length]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className={`flex flex-col ${compact ? 'h-full' : 'h-full'}`}>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 scrollbar-thin"
        style={{ maxHeight: compact ? '300px' : 'none' }}
      >
        <AnimatePresence initial={false}>
          {streamMessages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex items-start gap-2 text-sm ${
                msg.type === 'system' ? 'justify-center' : ''
              }`}
            >
              {msg.type === 'system' ? (
                <span className="text-gray-500 text-xs italic">{msg.message}</span>
              ) : msg.type === 'gift_alert' ? (
                <span className="text-amber-400 text-xs font-medium">
                  🎁 {msg.message}
                </span>
              ) : (
                <>
                  <span className="text-red-400 font-semibold text-xs shrink-0">
                    {msg.username}
                  </span>
                  <span className="text-gray-200 text-xs">{msg.message}</span>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 p-2 border-t border-white/10">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Say something..."
          className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-red-500/50"
          maxLength={200}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="w-9 h-9 rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
