'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStreamStore } from '@/stores/streamStore';
import { useAuthStore } from '@/stores/authStore';
import { useMediaSoup } from '@/hooks/useMediaSoup';
import {
  Radio,
  X,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Settings,
  ChevronDown,
  AlertCircle,
  Activity,
  Signal,
  Camera,
  MonitorUp,
} from 'lucide-react';
import { LiveBadge } from '@/components/shared/LiveBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoLiveViewProps {
  onStreamStarted: (streamId: string) => void;
  emitSocket: (event: string, data: unknown) => void;
}

interface MediaDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoLiveView({ onStreamStarted, emitSocket }: GoLiveViewProps) {
  const { createStream } = useStreamStore();
  const { user } = useAuthStore();
  const {
    isStreaming,
    localStream,
    error: msError,
    stats,
    startBroadcasting,
    stopBroadcasting,
  } = useMediaSoup();

  const videoRef = useRef<HTMLVideoElement>(null);

  // ---- Form state ----
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [currentStreamId, setCurrentStreamId] = useState<string | null>(null);

  // ---- Media state ----
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [devices, setDevices] = useState<MediaDevice[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const [showDeviceMenu, setShowDeviceMenu] = useState<'camera' | 'mic' | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // ---- Attach local stream to preview ----
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // ---- Enumerate devices ----
  const enumerateDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(
        allDevices.map((d) => ({
          deviceId: d.deviceId,
          label: d.label || (d.kind === 'videoinput' ? 'Camera' : d.kind === 'audioinput' ? 'Microphone' : d.kind),
          kind: d.kind,
        })),
      );
      // Set defaults if none selected
      const videoInput = allDevices.find((d) => d.kind === 'videoinput');
      const audioInput = allDevices.find((d) => d.kind === 'audioinput');
      if (videoInput && !selectedCamera) setSelectedCamera(videoInput.deviceId);
      if (audioInput && !selectedMic) setSelectedMic(audioInput.deviceId);
    } catch {
      // enumeration might fail pre-permission
    }
  }, [selectedCamera, selectedMic]);

  useEffect(() => {
    enumerateDevices();
    // Re-enumerate when permissions change
    navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices);
    };
  }, [enumerateDevices]);

  // ---- Toggle camera ----
  const toggleCamera = useCallback(() => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach((t) => (t.enabled = !t.enabled));
      setCameraEnabled(videoTracks[0]?.enabled ?? false);
    }
  }, [localStream]);

  // ---- Toggle mic ----
  const toggleMic = useCallback(() => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach((t) => (t.enabled = !t.enabled));
      setMicEnabled(audioTracks[0]?.enabled ?? false);
    }
  }, [localStream]);

  // ---- Start streaming ----
  const handleStartStream = async () => {
    if (!title.trim()) return;
    setIsStarting(true);
    setPermissionError(null);

    try {
      // 1. Create the DB record
      const stream = await createStream(title, description);
      if (!stream) {
        setPermissionError('Failed to create stream. Please try again.');
        setIsStarting(false);
        return;
      }

      // 2. Start WebRTC broadcasting (camera + mic + producer transport)
      try {
        await startBroadcasting(stream.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        // Check for permission errors
        if (msg.includes('Permission') || msg.includes('NotAllowedError') || msg.includes('denied')) {
          setPermissionError('Camera or microphone access was denied. Please allow permissions and try again.');
          // Clean up the stream record since we can't go live
          await useStreamStore.getState().endStream(stream.id);
          setIsStarting(false);
          return;
        }
        if (msg.includes('NotFoundError') || msg.includes('Requested device not found')) {
          setPermissionError('No camera or microphone found. Please connect a device and try again.');
          await useStreamStore.getState().endStream(stream.id);
          setIsStarting(false);
          return;
        }
        // Generic WebRTC error - still show the stream as live (audio-only, etc.)
        console.error('[GoLiveView] WebRTC error:', msg);
      }

      // 3. Mark as live
      setIsLive(true);
      setCurrentStreamId(stream.id);
      emitSocket('stream:start', {
        streamId: stream.id,
        creatorId: user?.id,
        creatorName: user?.username,
        title: stream.title,
      });
      onStreamStarted(stream.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start stream';
      setPermissionError(msg);
    } finally {
      setIsStarting(false);
    }
  };

  // ---- End streaming ----
  const handleEndStream = async () => {
    if (!currentStreamId) return;

    try {
      // 1. Stop WebRTC
      await stopBroadcasting();
    } catch {
      // Ignore cleanup errors
    }

    // 2. End DB stream record
    await useStreamStore.getState().endStream(currentStreamId);

    // 3. Notify via socket
    emitSocket('stream:end', { streamId: currentStreamId });

    // 4. Reset state
    setIsLive(false);
    setCurrentStreamId(null);
    setTitle('');
    setDescription('');
    setCameraEnabled(true);
    setMicEnabled(true);
    setPermissionError(null);
  };

  // ---- Format bitrate ----
  const formatBitrate = (bps: number): string => {
    if (bps >= 1000) return `${(bps / 1000).toFixed(1)} Mbps`;
    if (bps > 0) return `${bps} kbps`;
    return '-- kbps';
  };

  // ---- Stream health status ----
  const getHealthStatus = (): { color: string; label: string } => {
    if (stats.bitrate === 0) return { color: 'text-gray-500', label: 'Connecting...' };
    if (stats.bitrate >= 2000 && stats.fractionLost < 0.02) return { color: 'text-green-400', label: 'Excellent' };
    if (stats.bitrate >= 800 && stats.fractionLost < 0.05) return { color: 'text-yellow-400', label: 'Good' };
    return { color: 'text-red-400', label: 'Poor' };
  };

  const health = getHealthStatus();

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="min-h-screen bg-[#0A0A0A] p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
          <Radio className="w-6 h-6 text-red-500" />
          Go Live
        </h1>

        <AnimatePresence mode="wait">
          {isLive ? (
            /* ============================================================
               LIVE STATE
               ============================================================ */
            <motion.div
              key="live"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              {/* Camera preview */}
              <div className="relative bg-[#1A1A1A] rounded-2xl overflow-hidden border border-red-500/20" style={{ aspectRatio: '16 / 9' }}>
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />

                {/* Live badge overlay */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <LiveBadge className="text-sm px-3 py-1" />
                </div>

                {/* Duration / health overlay */}
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-xs font-medium ${health.color}`}>
                    <Activity className="w-3 h-3" />
                    {health.label}
                  </div>
                </div>

                {/* No camera fallback */}
                {!localStream && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#111]">
                    <div className="text-center">
                      <VideoOff className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">No camera feed</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Controls bar */}
              <div className="flex items-center justify-between bg-[#1A1A1A] rounded-xl p-3 border border-white/10">
                <div className="flex items-center gap-2">
                  {/* Toggle camera */}
                  <button
                    onClick={toggleCamera}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      cameraEnabled
                        ? 'bg-white/10 text-white hover:bg-white/20'
                        : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    }`}
                    title={cameraEnabled ? 'Disable Camera' : 'Enable Camera'}
                  >
                    {cameraEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                  </button>

                  {/* Toggle mic */}
                  <button
                    onClick={toggleMic}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      micEnabled
                        ? 'bg-white/10 text-white hover:bg-white/20'
                        : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    }`}
                    title={micEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
                  >
                    {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  </button>
                </div>

                {/* Stream title */}
                <div className="text-center min-w-0 flex-1 mx-2">
                  <p className="text-white text-sm font-semibold truncate">{title}</p>
                </div>

                {/* Device selector toggle */}
                <button
                  onClick={() => setShowDeviceMenu(showDeviceMenu ? null : 'camera')}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-all"
                  title="Device Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>

              {/* Device selection panel */}
              <AnimatePresence>
                {showDeviceMenu && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/10 space-y-3">
                      {/* Camera selector */}
                      <div>
                        <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5 font-medium">
                          <Camera className="w-3 h-3" />
                          Camera
                        </label>
                        <div className="relative">
                          <select
                            value={selectedCamera}
                            onChange={(e) => setSelectedCamera(e.target.value)}
                            className="w-full appearance-none px-3 py-2 bg-[#111] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/50 pr-8"
                          >
                            {devices
                              .filter((d) => d.kind === 'videoinput')
                              .map((d) => (
                                <option key={d.deviceId} value={d.deviceId}>
                                  {d.label}
                                </option>
                              ))}
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                        </div>
                      </div>

                      {/* Mic selector */}
                      <div>
                        <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5 font-medium">
                          <Mic className="w-3 h-3" />
                          Microphone
                        </label>
                        <div className="relative">
                          <select
                            value={selectedMic}
                            onChange={(e) => setSelectedMic(e.target.value)}
                            className="w-full appearance-none px-3 py-2 bg-[#111] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/50 pr-8"
                          >
                            {devices
                              .filter((d) => d.kind === 'audioinput')
                              .map((d) => (
                                <option key={d.deviceId} value={d.deviceId}>
                                  {d.label}
                                </option>
                              ))}
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Stream health stats */}
              <div className="bg-[#1A1A1A] rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-1.5 mb-3">
                  <Signal className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Stream Health</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#111] rounded-lg p-3 text-center">
                    <p className="text-gray-500 text-[10px] mb-1">Bitrate</p>
                    <p className="text-white text-sm font-bold">{formatBitrate(stats.bitrate)}</p>
                  </div>
                  <div className="bg-[#111] rounded-lg p-3 text-center">
                    <p className="text-gray-500 text-[10px] mb-1">Packet Loss</p>
                    <p className="text-white text-sm font-bold">{(stats.fractionLost * 100).toFixed(1)}%</p>
                  </div>
                  <div className="bg-[#111] rounded-lg p-3 text-center">
                    <p className="text-gray-500 text-[10px] mb-1">Status</p>
                    <p className={`text-sm font-bold ${health.color}`}>{health.label}</p>
                  </div>
                </div>
              </div>

              {/* End stream button */}
              <button
                onClick={handleEndStream}
                className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/20"
              >
                <X className="w-5 h-5" />
                End Stream
              </button>
            </motion.div>
          ) : (
            /* ============================================================
               PRE-LIVE STATE
               ============================================================ */
            <motion.div
              key="prelive"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-4"
            >
              {/* Camera preview (before going live) */}
              <div className="relative bg-[#1A1A1A] rounded-2xl overflow-hidden border border-white/10" style={{ aspectRatio: '16 / 9' }}>
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />

                {/* No camera fallback */}
                {!localStream && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#111]">
                    <div className="text-center">
                      <MonitorUp className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">Camera preview</p>
                      <p className="text-gray-600 text-xs mt-1">Preview will appear when you go live</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Stream details form */}
              <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-white/10">
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

                  {/* Device selection (pre-live) */}
                  <div className="space-y-3">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5 font-medium">
                        <Camera className="w-3 h-3" />
                        Camera
                      </label>
                      <div className="relative">
                        <select
                          value={selectedCamera}
                          onChange={(e) => setSelectedCamera(e.target.value)}
                          className="w-full appearance-none px-3 py-2.5 bg-[#111] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/50 pr-8"
                        >
                          {devices
                            .filter((d) => d.kind === 'videoinput')
                            .map((d) => (
                              <option key={d.deviceId} value={d.deviceId}>
                                {d.label}
                              </option>
                            ))}
                          {devices.filter((d) => d.kind === 'videoinput').length === 0 && (
                            <option value="">No camera detected</option>
                          )}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5 font-medium">
                        <Mic className="w-3 h-3" />
                        Microphone
                      </label>
                      <div className="relative">
                        <select
                          value={selectedMic}
                          onChange={(e) => setSelectedMic(e.target.value)}
                          className="w-full appearance-none px-3 py-2.5 bg-[#111] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/50 pr-8"
                        >
                          {devices
                            .filter((d) => d.kind === 'audioinput')
                            .map((d) => (
                              <option key={d.deviceId} value={d.deviceId}>
                                {d.label}
                              </option>
                            ))}
                          {devices.filter((d) => d.kind === 'audioinput').length === 0 && (
                            <option value="">No microphone detected</option>
                          )}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Permission error */}
                  <AnimatePresence>
                    {permissionError && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <p className="text-red-300 text-sm">{permissionError}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* MediaSoup error */}
                  <AnimatePresence>
                    {msError && !permissionError && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <p className="text-red-300 text-sm">{msError}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

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
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
