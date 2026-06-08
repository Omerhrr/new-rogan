'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, User, Send, Loader2, CheckCircle2 } from 'lucide-react';

interface PrivateStreamAccessProps {
  streamId: string;
  creatorName: string;
  streamTitle: string;
  onAccessGranted: () => void;
}

export function PrivateStreamAccess({ streamId, creatorName, streamTitle, onAccessGranted }: PrivateStreamAccessProps) {
  const [hasAccess, setHasAccess] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const res = await fetch(`/api/streams/${streamId}/access`);
        if (res.ok) {
          const data = await res.json();
          if (data.hasAccess) {
            setHasAccess(true);
            onAccessGranted();
          }
        }
      } catch {
        // ignore
      } finally {
        setIsChecking(false);
      }
    };

    checkAccess();
  }, [streamId, onAccessGranted]);

  const handleRequestAccess = async () => {
    setIsRequesting(true);
    try {
      // This would typically send a notification to the creator
      // For now, we simulate a request
      setRequestSent(true);
    } finally {
      setIsRequesting(false);
    }
  };

  if (isChecking) {
    return (
      <div className="h-full bg-[#0A0A0A] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (hasAccess) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-[#0A0A0A] flex items-center justify-center p-6"
    >
      <div className="max-w-sm w-full text-center">
        {/* Lock icon */}
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="w-20 h-20 rounded-full bg-[#1A1A1A] border border-white/10 flex items-center justify-center mx-auto mb-6"
        >
          <Lock className="w-10 h-10 text-gray-500" />
        </motion.div>

        <h2 className="text-white font-bold text-xl mb-2">Private Stream</h2>
        <p className="text-gray-400 text-sm mb-1">This stream is invite-only</p>

        {/* Creator info */}
        <div className="flex items-center justify-center gap-2 my-4 p-3 bg-white/5 rounded-xl">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold">
            {creatorName[0]}
          </div>
          <div className="text-left">
            <p className="text-white text-sm font-semibold">{creatorName}</p>
            <p className="text-gray-500 text-xs">{streamTitle}</p>
          </div>
        </div>

        {requestSent ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl"
          >
            <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-green-400 text-sm font-semibold">Request Sent!</p>
            <p className="text-gray-400 text-xs mt-1">
              Waiting for {creatorName} to grant you access
            </p>
          </motion.div>
        ) : (
          <button
            onClick={handleRequestAccess}
            disabled={isRequesting}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {isRequesting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Request Access
          </button>
        )}
      </div>
    </motion.div>
  );
}
