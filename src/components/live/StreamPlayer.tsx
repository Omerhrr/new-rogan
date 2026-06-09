'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  Settings,
  AlertCircle,
  Loader2,
  Eye,
  Radio,
} from 'lucide-react';
import { useMediaSoup } from '@/hooks/useMediaSoup';
import { LiveBadge } from '@/components/shared/LiveBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StreamPlayerProps {
  streamId: string;
  title: string;
  creatorName: string;
  creatorAvatar?: string | null;
  viewerCount: number;
  isLive: boolean;
}

type QualityLevel = 'low' | 'med' | 'high';

const QUALITY_MAP: Record<QualityLevel, { spatial: number; temporal: number; label: string }> = {
  low: { spatial: 0, temporal: 0, label: '480p' },
  med: { spatial: 1, temporal: 1, label: '720p' },
  high: { spatial: 2, temporal: 2, label: '1080p' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StreamPlayer({
  streamId,
  title,
  creatorName,
  creatorAvatar,
  viewerCount,
  isLive,
}: StreamPlayerProps) {
  const {
    isViewing,
    remoteStream,
    error: msError,
    stats,
    startViewing,
    stopViewing,
    setQuality,
  } = useMediaSoup();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasClicked, setHasClicked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [quality, setQualityLevel] = useState<QualityLevel>('med');
  const [showControls, setShowControls] = useState(true);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Attach remote stream to video element ----
  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // ---- Volume sync ----
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // ---- Click to watch ----
  const handleWatchClick = useCallback(async () => {
    setHasClicked(true);
    try {
      await startViewing(streamId);
    } catch {
      // Error handled by hook state
    }
  }, [startViewing, streamId]);

  // ---- Quality change ----
  const handleQualityChange = useCallback(
    (level: QualityLevel) => {
      setQualityLevel(level);
      const { spatial, temporal } = QUALITY_MAP[level];
      setQuality(spatial, temporal);
      setShowQualityMenu(false);
    },
    [setQuality],
  );

  // ---- Fullscreen ----
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen not supported or denied
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // ---- Auto-hide controls ----
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isViewing && !showQualityMenu) {
        setShowControls(false);
      }
    }, 3000);
  }, [isViewing, showQualityMenu]);

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  // ---- Reconnection logic ----
  useEffect(() => {
    if (hasClicked && !isViewing && !msError && !isReconnecting) {
      // Stream may have dropped, attempt reconnect after a delay
      const timer = setTimeout(async () => {
        setIsReconnecting(true);
        try {
          await startViewing(streamId);
        } catch {
          // Will retry or show error
        }
        setIsReconnecting(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [hasClicked, isViewing, msError, isReconnecting, startViewing, streamId]);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => {
      if (isViewing) {
        stopViewing();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Format viewer count ----
  const formatCount = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  // ---- Format bitrate ----
  const formatBitrate = (bps: number): string => {
    if (bps >= 1000) return `${(bps / 1000).toFixed(1)} Mbps`;
    return `${bps} kbps`;
  };

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black rounded-xl overflow-hidden select-none"
      style={{ aspectRatio: '16 / 9' }}
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => isViewing && setShowControls(false)}
      onTouchStart={resetControlsTimeout}
    >
      {/* ---- Video element ---- */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        className="absolute inset-0 w-full h-full object-contain bg-black"
      />

      {/* ---- "Click to Watch" overlay ---- */}
      <AnimatePresence>
        {!hasClicked && (
          <motion.div
            key="click-to-watch"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0A0A0A]/90 cursor-pointer"
            onClick={handleWatchClick}
          >
            {/* Gradient backdrop */}
            <div className="absolute inset-0 bg-gradient-to-br from-red-900/20 via-purple-900/10 to-black" />

            {/* Play button */}
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="relative z-10 w-20 h-20 rounded-full bg-red-600/90 flex items-center justify-center shadow-2xl shadow-red-600/40 mb-4"
            >
              <Play className="w-8 h-8 text-white ml-1" fill="white" />
            </motion.div>

            <p className="relative z-10 text-white text-lg font-bold mb-1">Click to Watch</p>
            <p className="relative z-10 text-gray-400 text-sm">{title}</p>

            {/* Creator info */}
            <div className="relative z-10 flex items-center gap-2 mt-4">
              {creatorAvatar ? (
                <img
                  src={creatorAvatar}
                  alt={creatorName}
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-white/20"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white font-bold text-sm ring-2 ring-white/20">
                  {creatorName[0]}
                </div>
              )}
              <span className="text-gray-300 text-sm font-medium">{creatorName}</span>
            </div>

            {isLive && (
              <div className="relative z-10 mt-3">
                <LiveBadge />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Loading overlay ---- */}
      <AnimatePresence>
        {hasClicked && !isViewing && !msError && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/60"
          >
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-red-500 animate-spin mx-auto mb-3" />
              <p className="text-white text-sm font-medium">
                {isReconnecting ? 'Reconnecting...' : 'Connecting to stream...'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Error overlay ---- */}
      <AnimatePresence>
        {msError && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/80"
          >
            <div className="text-center px-6">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <p className="text-white text-sm font-medium mb-1">Connection Error</p>
              <p className="text-gray-400 text-xs mb-4">{msError}</p>
              <button
                onClick={() => {
                  setHasClicked(false);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Top overlay: live badge, title, viewer count ---- */}
      <AnimatePresence>
        {showControls && isViewing && (
          <motion.div
            key="top-controls"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-0 left-0 right-0 z-10 p-3 md:p-4 bg-gradient-to-b from-black/70 to-transparent"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {isLive && <LiveBadge />}
                <span className="text-white text-sm font-semibold truncate max-w-[200px] md:max-w-none">
                  {title}
                </span>
              </div>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs shrink-0">
                <Eye className="w-3 h-3" />
                {formatCount(viewerCount)}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Bottom overlay: controls ---- */}
      <AnimatePresence>
        {showControls && isViewing && (
          <motion.div
            key="bottom-controls"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-0 left-0 right-0 z-10 p-3 md:p-4 bg-gradient-to-t from-black/70 to-transparent"
          >
            {/* Progress bar / quality indicator */}
            <div className="flex items-center gap-3 mb-2">
              {/* Live indicator dot */}
              <div className="flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-red-500" />
                <span className="text-red-400 text-[10px] font-bold uppercase tracking-wider">Live</span>
              </div>

              {/* Bitrate */}
              {stats.bitrate > 0 && (
                <span className="text-gray-400 text-[10px] font-mono">
                  {formatBitrate(stats.bitrate)}
                </span>
              )}

              {/* Quality badge */}
              <span className="text-gray-400 text-[10px] font-medium bg-white/10 px-1.5 py-0.5 rounded">
                {QUALITY_MAP[quality].label}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Volume */}
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                {/* Volume slider (desktop) */}
                <div className="hidden md:flex items-center group relative">
                  <div className="w-0 group-hover:w-20 overflow-hidden transition-all duration-200">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        setVolume(parseFloat(e.target.value));
                        if (isMuted) setIsMuted(false);
                      }}
                      className="w-20 h-1 accent-red-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Creator name */}
                <span className="text-gray-300 text-xs hidden md:inline ml-1">{creatorName}</span>
              </div>

              <div className="flex items-center gap-1">
                {/* Quality selector */}
                <div className="relative">
                  <button
                    onClick={() => setShowQualityMenu(!showQualityMenu)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                  </button>

                  <AnimatePresence>
                    {showQualityMenu && (
                      <motion.div
                        key="quality-menu"
                        initial={{ opacity: 0, scale: 0.9, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full right-0 mb-2 bg-[#1A1A1A] border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[140px]"
                      >
                        <div className="px-3 py-2 border-b border-white/5">
                          <span className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Quality</span>
                        </div>
                        {(['low', 'med', 'high'] as QualityLevel[]).map((level) => (
                          <button
                            key={level}
                            onClick={() => handleQualityChange(level)}
                            className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center justify-between ${
                              quality === level
                                ? 'text-red-400 bg-red-500/10'
                                : 'text-gray-300 hover:bg-white/5'
                            }`}
                          >
                            <span className="capitalize">{level}</span>
                            <span className="text-[10px] text-gray-500">{QUALITY_MAP[level].label}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Fullscreen toggle */}
                <button
                  onClick={toggleFullscreen}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                >
                  {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Offline overlay (not live) ---- */}
      <AnimatePresence>
        {!isLive && !hasClicked && (
          <motion.div
            key="offline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-[#0A0A0A]"
          >
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[#1A1A1A] flex items-center justify-center mx-auto mb-3">
                <Radio className="w-8 h-8 text-gray-600" />
              </div>
              <p className="text-gray-400 font-medium">Stream is offline</p>
              <p className="text-gray-600 text-sm mt-1">Check back later</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
