'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDMStore } from '@/stores/dmStore';
import { useAuthStore } from '@/stores/authStore';
import { useSocket } from '@/hooks/useSocket';
import { ArrowLeft, Send, Lock, MessageCircle, Search, X, CheckCheck, Sparkles } from 'lucide-react';

// Typing indicator dots animation
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gray-400"
          animate={{ y: [0, -4, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  );
}

export function DMView() {
  const { conversations, activeConversation, messages, fetchConversations, openConversation, sendMessage, closeConversation } = useDMStore();
  const { user } = useAuthStore();
  const { emit, on, off } = useSocket();
  const [input, setInput] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState('5');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; username: string; displayName: string | null; avatar: string | null }>>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [messageRequests, setMessageRequests] = useState<Array<{ id: string; senderId: string; senderName: string; message: string; timestamp: number }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isTyping]);

  // Socket listeners for typing and DM requests
  useEffect(() => {
    if (!user) return;

    const cleanupTyping = on(`dm:typing:${user.id}`, () => {
      setIsTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
    });

    const cleanupDmRequest = on(`dm:request:${user.id}`, (data: unknown) => {
      const req = data as { id: string; senderId: string; senderName: string; message: string; timestamp: number };
      setMessageRequests((prev) => [...prev, req]);
    });

    const cleanupDmSent = on('dm:sent', () => {
      // Refresh conversations when a DM is sent via socket
      fetchConversations();
    });

    return () => {
      cleanupTyping?.();
      cleanupDmRequest?.();
      cleanupDmSent?.();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [user, on, off, fetchConversations]);

  const handleInputChange = (value: string) => {
    setInput(value);
    // Emit typing indicator
    if (activeConversation && user) {
      emit('dm:typing', { senderId: user.id, receiverId: activeConversation.id });
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.users || []);
      }
    } catch {
      // ignore
    }
  };

  const handleStartConversation = (u: { id: string; username: string; displayName: string | null; avatar: string | null }) => {
    openConversation(u);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeConversation) return;
    const success = await sendMessage(
      activeConversation.id,
      input.trim(),
      isPaid,
      isPaid ? parseInt(price) * 100 : 0
    );
    if (success) {
      setInput('');
      // Mark messages as read when sending
      try {
        await fetch('/api/dm/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: activeConversation.id }),
        });
      } catch {
        // ignore
      }
    }
  };

  // Conversation list view
  if (!activeConversation) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] p-4 md:p-6 pb-20 md:pb-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-white">Messages</h1>
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all"
            >
              {showSearch ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            </button>
          </div>

          {/* Search users */}
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 overflow-hidden"
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search users to message..."
                    className="w-full pl-10 pr-4 py-2.5 bg-[#1A1A1A] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-red-500/50"
                    autoFocus
                  />
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {searchResults.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleStartConversation(u)}
                        className="w-full flex items-center gap-3 p-2.5 bg-[#1A1A1A] rounded-lg border border-white/5 hover:border-red-500/30 transition-all"
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white font-bold text-sm">
                          {u.displayName?.[0] || u.username[0]}
                        </div>
                        <div className="text-left">
                          <p className="text-white text-sm font-medium">{u.displayName || u.username}</p>
                          <p className="text-gray-500 text-xs">@{u.username}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Message Requests Section */}
          {messageRequests.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h2 className="text-amber-400 text-sm font-semibold">Message Requests</h2>
                <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-full">
                  {messageRequests.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {messageRequests.map((req) => (
                  <motion.button
                    key={req.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => {
                      openConversation({ id: req.senderId, username: req.senderName, displayName: req.senderName, avatar: null });
                      setMessageRequests((prev) => prev.filter((r) => r.id !== req.id));
                    }}
                    className="w-full flex items-center gap-3 p-3 bg-amber-500/5 rounded-xl border border-amber-500/20 hover:border-amber-500/40 transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                      {req.senderName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-amber-300 text-sm font-semibold">{req.senderName}</p>
                      <p className="text-gray-400 text-xs truncate">{req.message}</p>
                    </div>
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {conversations.length === 0 && !showSearch && messageRequests.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-[#1A1A1A] flex items-center justify-center mx-auto mb-3">
                <MessageCircle className="w-8 h-8 text-gray-600" />
              </div>
              <p className="text-gray-500">No conversations yet</p>
              <p className="text-gray-600 text-sm mt-1">Tap the search icon to find users!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <motion.button
                  key={conv.user.id}
                  onClick={() => openConversation(conv.user)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full flex items-center gap-3 p-3 bg-[#1A1A1A] rounded-xl border border-white/5 hover:border-white/10 transition-all"
                >
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white font-bold">
                      {conv.user.displayName?.[0] || conv.user.username[0]}
                    </div>
                    {/* Online status indicator - shown if the user has isLive property (creators streaming) */}
                    {'isLive' in conv.user && (conv.user as Record<string, unknown>).isLive && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-[#1A1A1A]" />
                    )}
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-1.5">
                      <p className="text-white text-sm font-semibold">
                        {conv.user.displayName || conv.user.username}
                      </p>
                      {/* Priority/paid message indicator */}
                      {conv.lastMessage.isPaid && (
                        <Sparkles className="w-3 h-3 text-amber-400" />
                      )}
                    </div>
                    <p className="text-gray-500 text-xs truncate">
                      {conv.lastMessage.isPaid && '🔒 '}{conv.lastMessage.message}
                    </p>
                  </div>
                  <span className="text-gray-600 text-[10px]">
                    {new Date(conv.lastMessage.createdAt).toLocaleDateString()}
                  </span>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Chat view
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col pb-20 md:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/10 bg-[#0A0A0A]">
        <button
          onClick={closeConversation}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white font-bold text-sm">
            {activeConversation.displayName?.[0] || activeConversation.username[0]}
          </div>
        </div>
        <div>
          <p className="text-white font-semibold text-sm">
            {activeConversation.displayName || activeConversation.username}
          </p>
          <p className="text-gray-500 text-xs">@{activeConversation.username}</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isOwn = msg.senderId === user?.id;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  isOwn
                    ? 'bg-red-600 text-white rounded-br-md'
                    : 'bg-[#1A1A1A] text-white rounded-bl-md border border-white/10'
                }`}>
                  {msg.isPaid && (
                    <div className="flex items-center gap-1 mb-1 text-amber-400 text-xs">
                      <Lock className="w-3 h-3" />
                      Paid message • {(msg.price / 100).toFixed(0)} TK
                      <Sparkles className="w-3 h-3 ml-1" />
                    </div>
                  )}
                  <p className="text-sm">{msg.message}</p>
                  <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : ''}`}>
                    <p className={`text-[10px] ${isOwn ? 'text-red-200' : 'text-gray-500'}`}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {/* Read receipts for own messages */}
                    {isOwn && (
                      <CheckCheck className={`w-3.5 h-3.5 ${msg.isRead ? 'text-blue-400' : 'text-red-200/50'}`} />
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="flex justify-start"
            >
              <div className="bg-[#1A1A1A] rounded-2xl rounded-bl-md border border-white/10 overflow-hidden">
                <TypingDots />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input area */}
      <form onSubmit={handleSend} className="p-3 border-t border-white/10 bg-[#0A0A0A]">
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setIsPaid(!isPaid)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
              isPaid ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-gray-500'
            }`}
          >
            {isPaid ? <Sparkles className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            Paid DM
          </button>
          {isPaid && (
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-16 px-2 py-1 bg-[#111] border border-white/10 rounded-lg text-amber-400 text-xs focus:outline-none"
              min="1"
            />
          )}
          {isPaid && <span className="text-gray-500 text-xs">TK</span>}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-red-500/50"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="w-10 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all disabled:opacity-30"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
