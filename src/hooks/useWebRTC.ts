'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { getSocketRef, socketEmitWithAck } from '@/lib/socket-ref';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamStats {
  bitrate: number;       // kbps
  fractionLost: number;  // 0-1
  rtt: number;           // ms
  codec: string;         // e.g. "video/VP8", "audio/opus"
}

export interface UseWebRTCReturn {
  // State
  isStreaming: boolean;
  isViewing: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  error: string | null;
  stats: StreamStats;
  connectionState: RTCPeerConnectionState | 'new';
  viewerCount: number;

  // Broadcaster actions
  startBroadcasting: (roomId: string) => Promise<void>;
  stopBroadcasting: () => Promise<void>;

  // Viewer actions
  startViewing: (roomId: string) => Promise<void>;
  stopViewing: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Production: Add TURN servers for NAT traversal
  // { urls: 'turn:your-turn-server:3478', username: 'user', credential: 'pass' },
];

const PC_CONFIG: RTCConfiguration = {
  iceServers: DEFAULT_ICE_SERVERS,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

// Broadcaster video constraints (720p @ 30fps, good quality/bandwidth balance)
const BROADCASTER_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 60 },
  aspectRatio: { ideal: 16 / 9 },
};

const BROADCASTER_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  sampleRate: { ideal: 48000 },
  channelCount: { ideal: 2 },
};

// ---------------------------------------------------------------------------
// Stats computation helper
// ---------------------------------------------------------------------------

function computeStats(
  prevBytesSent: number,
  prevBytesReceived: number,
  prevTimestamp: number,
  reports: RTCStatsReport,
): { stats: StreamStats; newBytesSent: number; newBytesReceived: number; newTimestamp: number } {
  let bytesSent = 0;
  let bytesReceived = 0;
  let fractionLost = 0;
  let rtt = 0;
  let codec = '';
  let lostCount = 0;

  for (const report of reports.values()) {
    if (report.type === 'outbound-rtp') {
      const rtp = report as RTCOutboundRtpStreamStats;
      bytesSent += rtp.bytesSent ?? 0;
      // Try to get codec from associated codec report
      if (rtp.codecId) {
        const codecReport = reports.get(rtp.codecId);
        if (codecReport && !codec) {
          codec = (codecReport as any).mimeType ?? '';
        }
      }
    }
    if (report.type === 'inbound-rtp') {
      const rtp = report as RTCInboundRtpStreamStats;
      bytesReceived += rtp.bytesReceived ?? 0;
      fractionLost += (rtp as any).fractionLost ?? 0;
      lostCount++;
      if (rtp.codecId) {
        const codecReport = reports.get(rtp.codecId);
        if (codecReport && !codec) {
          codec = (codecReport as any).mimeType ?? '';
        }
      }
    }
    if (report.type === 'candidate-pair' && (report as any).state === 'succeeded') {
      rtt = (report as any).currentRoundTripTime != null
        ? Math.round((report as any).currentRoundTripTime * 1000)
        : 0;
    }
  }

  const now = Date.now();
  const elapsed = (now - prevTimestamp) / 1000; // seconds
  const totalBytes = bytesSent || bytesReceived;
  const bitrate = elapsed > 0 ? Math.round(((totalBytes - (prevBytesSent || prevBytesReceived)) * 8) / (elapsed * 1000)) : 0;

  return {
    stats: {
      bitrate: bitrate > 0 ? bitrate : 0,
      fractionLost: lostCount > 0 ? fractionLost / lostCount : 0,
      rtt,
      codec: codec || 'unknown',
    },
    newBytesSent: bytesSent,
    newBytesReceived: bytesReceived,
    newTimestamp: now,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWebRTC(): UseWebRTCReturn {
  // ---- State exposed to consumers ----
  const [isStreaming, setIsStreaming] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StreamStats>({ bitrate: 0, fractionLost: 0, rtt: 0, codec: '' });
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | 'new'>('new');
  const [viewerCount, setViewerCount] = useState(0);

  // ---- Internal refs ----
  // Broadcaster: maps viewerSocketId -> RTCPeerConnection
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // Viewer: single PeerConnection
  const viewerPCRef = useRef<RTCPeerConnection | null>(null);
  // Current room
  const currentRoomRef = useRef<string | null>(null);
  // Local stream (broadcaster)
  const localStreamRef = useRef<MediaStream | null>(null);
  // Stats collection
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatsRef = useRef({ bytesSent: 0, bytesReceived: 0, timestamp: Date.now() });
  // Ice servers received from server
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE_SERVERS);
  // Socket event cleanup functions
  const socketCleanupsRef = useRef<Array<() => void>>([]);
  // Reconnection state
  const reconnectAttemptRef = useRef(0);
  const maxReconnectAttempts = 5;

  // ---- Cleanup helper ----
  const cleanup = useCallback(() => {
    // Close all broadcaster PeerConnections
    for (const [viewerSid, pc] of peerConnectionsRef.current) {
      try { pc.close(); } catch { /* ignore */ }
    }
    peerConnectionsRef.current.clear();

    // Close viewer PeerConnection
    if (viewerPCRef.current) {
      try { viewerPCRef.current.close(); } catch { /* ignore */ }
      viewerPCRef.current = null;
    }

    // Stop local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    // Stop stats interval
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    prevStatsRef.current = { bytesSent: 0, bytesReceived: 0, timestamp: Date.now() };

    // Remove all socket event listeners
    for (const cleanupFn of socketCleanupsRef.current) {
      cleanupFn();
    }
    socketCleanupsRef.current = [];

    currentRoomRef.current = null;
    reconnectAttemptRef.current = 0;
    setConnectionState('new');
    setViewerCount(0);
  }, []);

  // ---- Setup socket listener helper ----
  const addSocketListener = useCallback((event: string, handler: (...args: any[]) => void) => {
    const socket = getSocketRef();
    if (!socket) return;
    socket.on(event, handler);
    socketCleanupsRef.current.push(() => {
      socket.off(event, handler);
    });
  }, []);

  // ---- Start stats collection ----
  const startStatsCollection = useCallback((getPeerConnections: () => RTCPeerConnection[]) => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }
    prevStatsRef.current = { bytesSent: 0, bytesReceived: 0, timestamp: Date.now() };

    statsIntervalRef.current = setInterval(async () => {
      const pcs = getPeerConnections();
      let totalBytesSent = 0;
      let totalBytesReceived = 0;
      let totalFractionLost = 0;
      let totalRtt = 0;
      let codec = '';
      let lostCount = 0;
      let rttCount = 0;

      for (const pc of pcs) {
        try {
          if (pc.connectionState !== 'connected') continue;
          const reports = await pc.getStats();
          const result = computeStats(
            prevStatsRef.current.bytesSent,
            prevStatsRef.current.bytesReceived,
            prevStatsRef.current.timestamp,
            reports,
          );
          totalBytesSent += result.newBytesSent;
          totalBytesReceived += result.newBytesReceived;
          totalFractionLost += result.stats.fractionLost;
          if (result.stats.rtt > 0) {
            totalRtt += result.stats.rtt;
            rttCount++;
          }
          if (!codec && result.stats.codec) {
            codec = result.stats.codec;
          }
          lostCount++;
        } catch {
          // Stats might fail if connection is closed
        }
      }

      const now = Date.now();
      const elapsed = (now - prevStatsRef.current.timestamp) / 1000;
      const totalBytes = totalBytesSent || totalBytesReceived;
      const prevBytes = prevStatsRef.current.bytesSent || prevStatsRef.current.bytesReceived;
      const bitrate = elapsed > 0 ? Math.round(((totalBytes - prevBytes) * 8) / (elapsed * 1000)) : 0;

      prevStatsRef.current = {
        bytesSent: totalBytesSent,
        bytesReceived: totalBytesReceived,
        timestamp: now,
      };

      setStats({
        bitrate: bitrate > 0 ? bitrate : 0,
        fractionLost: lostCount > 0 ? totalFractionLost / lostCount : 0,
        rtt: rttCount > 0 ? Math.round(totalRtt / rttCount) : 0,
        codec: codec || 'unknown',
      });
    }, 2000);
  }, []);

  // ========================================================================
  // BROADCASTER FLOW
  // ========================================================================

  const startBroadcasting = useCallback(async (roomId: string) => {
    setError(null);
    currentRoomRef.current = roomId;
    let stream: MediaStream | null = null;

    try {
      const socket = getSocketRef();
      if (!socket || !socket.connected) {
        throw new Error('Socket not connected. Please refresh and try again.');
      }

      // 1. Get user media (camera + mic)
      stream = await navigator.mediaDevices.getUserMedia({
        video: BROADCASTER_VIDEO_CONSTRAINTS,
        audio: BROADCASTER_AUDIO_CONSTRAINTS,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      // 2. Signal broadcaster ready to the server
      socket.emit('webrtc:broadcaster-ready', { roomId });

      // 3. Listen for ICE server config from server
      addSocketListener('webrtc:ice-servers', (data: { iceServers: RTCIceServer[] }) => {
        iceServersRef.current = data.iceServers;
        console.log('[WebRTC] Received ICE servers from server:', data.iceServers.length);
      });

      // 4. Listen for new viewers joining
      addSocketListener('webrtc:viewer-joined', async (data: { viewerSocketId: string; roomId: string }) => {
        if (data.roomId !== currentRoomRef.current) return;

        console.log(`[WebRTC] New viewer joined: ${data.viewerSocketId}`);

        try {
          // Create a new PeerConnection for this viewer
          const pc = new RTCPeerConnection({
            ...PC_CONFIG,
            iceServers: iceServersRef.current,
          });

          // Add all local tracks to the connection
          for (const track of stream!.getTracks()) {
            pc.addTrack(track, stream!);
          }

          // Handle ICE candidates
          pc.onicecandidate = (event) => {
            if (event.candidate) {
              socket.emit('webrtc:ice-candidate', {
                roomId: data.roomId,
                targetSocketId: data.viewerSocketId,
                candidate: event.candidate.toJSON(),
              });
            }
          };

          // Handle connection state changes
          pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] PC state for ${data.viewerSocketId}: ${pc.connectionState}`);
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
              // Attempt ICE restart
              if (pc.connectionState === 'failed') {
                console.log(`[WebRTC] Connection failed for ${data.viewerSocketId}, attempting ICE restart`);
                pc.restartIce();
              }
            }
            if (pc.connectionState === 'connected') {
              reconnectAttemptRef.current = 0;
            }
            // Update overall connection state
            updateBroadcasterConnectionState();
          };

          pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed') {
              console.log(`[WebRTC] ICE failed for ${data.viewerSocketId}, restarting`);
              pc.restartIce();
            }
          };

          // Store the PeerConnection
          peerConnectionsRef.current.set(data.viewerSocketId, pc);

          // Create and send offer
          const offer = await pc.createOffer({
            offerToReceiveAudio: false,
            offerToReceiveVideo: false,
          });

          // Add simulcast/layered encoding for video tracks (quality adaptation)
          // This is done via RTP sender parameters after the offer is created
          await pc.setLocalDescription(offer);

          socket.emit('webrtc:offer', {
            roomId: data.roomId,
            targetSocketId: data.viewerSocketId,
            sdp: pc.localDescription,
          });

          // Update viewer count
          setViewerCount(peerConnectionsRef.current.size);
        } catch (err) {
          console.error(`[WebRTC] Error creating offer for viewer ${data.viewerSocketId}:`, err);
        }
      });

      // 5. Listen for answers from viewers
      addSocketListener('webrtc:answer', async (data: { fromSocketId: string; roomId: string; sdp: RTCSessionDescriptionInit }) => {
        if (data.roomId !== currentRoomRef.current) return;
        const pc = peerConnectionsRef.current.get(data.fromSocketId);
        if (!pc) {
          console.warn(`[WebRTC] No PeerConnection for viewer ${data.fromSocketId}`);
          return;
        }

        try {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            console.log(`[WebRTC] Set remote answer from viewer ${data.fromSocketId}`);
          }
        } catch (err) {
          console.error(`[WebRTC] Error setting remote answer:`, err);
        }
      });

      // 6. Listen for ICE candidates from viewers
      addSocketListener('webrtc:ice-candidate', (data: { fromSocketId: string; candidate: RTCIceCandidateInit }) => {
        // Find the PeerConnection for this viewer (if we're the broadcaster)
        const pc = peerConnectionsRef.current.get(data.fromSocketId);
        if (pc) {
          pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch((err) => {
            console.warn(`[WebRTC] Error adding ICE candidate from viewer:`, err);
          });
        }
      });

      // 7. Listen for viewer disconnections
      addSocketListener('webrtc:viewer-left', (data: { viewerSocketId: string; roomId: string }) => {
        if (data.roomId !== currentRoomRef.current) return;
        const pc = peerConnectionsRef.current.get(data.viewerSocketId);
        if (pc) {
          pc.close();
          peerConnectionsRef.current.delete(data.viewerSocketId);
          console.log(`[WebRTC] Viewer left: ${data.viewerSocketId}`);
          setViewerCount(peerConnectionsRef.current.size);
        }
      });

      // 8. Listen for ICE restart requests from viewers
      addSocketListener('webrtc:restart-ice', (data: { fromSocketId: string; roomId: string }) => {
        if (data.roomId !== currentRoomRef.current) return;
        const pc = peerConnectionsRef.current.get(data.fromSocketId);
        if (pc) {
          console.log(`[WebRTC] Restarting ICE for viewer ${data.fromSocketId}`);
          pc.restartIce();
        }
      });

      // 9. Start stats collection (aggregate across all PeerConnections)
      startStatsCollection(() => Array.from(peerConnectionsRef.current.values()));

      setIsStreaming(true);
      setConnectionState('connected');
      console.log(`[WebRTC] Broadcasting started in room ${roomId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start broadcasting';
      setError(message);

      // Stop any stream tracks we may have acquired
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      cleanup();
    }
  }, [cleanup, addSocketListener, startStatsCollection]);

  // Helper: compute aggregate broadcaster connection state
  const updateBroadcasterConnectionState = useCallback(() => {
    const pcs = Array.from(peerConnectionsRef.current.values());
    if (pcs.length === 0) {
      setConnectionState('new');
      return;
    }
    const states = pcs.map((pc) => pc.connectionState);
    if (states.every((s) => s === 'connected')) {
      setConnectionState('connected');
    } else if (states.some((s) => s === 'failed')) {
      setConnectionState('failed');
    } else if (states.some((s) => s === 'disconnected')) {
      setConnectionState('disconnected');
    } else if (states.some((s) => s === 'connecting')) {
      setConnectionState('connecting');
    } else {
      setConnectionState(states[0]);
    }
  }, []);

  const stopBroadcasting = useCallback(async () => {
    const roomId = currentRoomRef.current;
    const socket = getSocketRef();

    // Notify server
    if (socket && roomId) {
      socket.emit('webrtc:broadcaster-stop', { roomId });
    }

    // Close all PeerConnections
    for (const [viewerSid, pc] of peerConnectionsRef.current) {
      try { pc.close(); } catch { /* ignore */ }
    }
    peerConnectionsRef.current.clear();

    // Stop local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    cleanup();
    setIsStreaming(false);
    setLocalStream(null);
    setStats({ bitrate: 0, fractionLost: 0, rtt: 0, codec: '' });
    console.log('[WebRTC] Broadcasting stopped');
  }, [cleanup]);

  // ========================================================================
  // VIEWER FLOW
  // ========================================================================

  const startViewing = useCallback(async (roomId: string) => {
    setError(null);
    currentRoomRef.current = roomId;
    reconnectAttemptRef.current = 0;

    try {
      const socket = getSocketRef();
      if (!socket || !socket.connected) {
        throw new Error('Socket not connected. Please refresh and try again.');
      }

      // 1. Create PeerConnection
      const pc = new RTCPeerConnection({
        ...PC_CONFIG,
        iceServers: iceServersRef.current,
      });
      viewerPCRef.current = pc;

      // 2. Handle remote tracks
      const remote = new MediaStream();
      pc.ontrack = (event) => {
        console.log(`[WebRTC] Received remote ${event.track.kind} track`);
        remote.addTrack(event.track);

        // Update remote stream - create a new MediaStream to trigger React re-render
        const newRemote = new MediaStream();
        for (const track of remote.getTracks()) {
          newRemote.addTrack(track);
        }
        setRemoteStream(newRemote);
      };

      // 3. Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          // We'll send ICE candidates after we know the broadcaster's socket ID
          // (targetSocketId is set when we receive the offer)
          const broadcasterSid = currentBroadcasterSidRef.current;
          if (broadcasterSid) {
            socket.emit('webrtc:ice-candidate', {
              roomId,
              targetSocketId: broadcasterSid,
              candidate: event.candidate.toJSON(),
            });
          } else {
            // Queue the candidate until we know the broadcaster
            pendingIceCandidatesRef.current.push(event.candidate.toJSON());
          }
        }
      };

      // 4. Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Viewer PC state: ${pc.connectionState}`);
        setConnectionState(pc.connectionState);

        if (pc.connectionState === 'failed') {
          // Attempt ICE restart
          console.log('[WebRTC] Connection failed, attempting ICE restart');
          pc.restartIce();
          // If restart doesn't work after a few seconds, try full reconnect
          setTimeout(() => {
            if (pc.connectionState === 'failed' && currentRoomRef.current) {
              attemptReconnect(currentRoomRef.current);
            }
          }, 5000);
        }

        if (pc.connectionState === 'connected') {
          reconnectAttemptRef.current = 0;
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          console.log('[WebRTC] ICE connection failed, restarting');
          pc.restartIce();
        }
      };

      // 5. Listen for ICE server config
      addSocketListener('webrtc:ice-servers', (data: { iceServers: RTCIceServer[] }) => {
        iceServersRef.current = data.iceServers;
        // Update the PC config if not already connected
        if (pc.connectionState !== 'connected') {
          try {
            pc.setConfiguration({ ...PC_CONFIG, iceServers: data.iceServers });
          } catch {
            // Some browsers don't support setConfiguration after creation
          }
        }
      });

      // 6. Listen for offer from broadcaster
      addSocketListener('webrtc:offer', async (data: { fromSocketId: string; roomId: string; sdp: RTCSessionDescriptionInit }) => {
        if (data.roomId !== currentRoomRef.current) return;

        console.log(`[WebRTC] Received offer from broadcaster ${data.fromSocketId}`);
        currentBroadcasterSidRef.current = data.fromSocketId;

        try {
          if (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket.emit('webrtc:answer', {
              roomId: data.roomId,
              targetSocketId: data.fromSocketId,
              sdp: pc.localDescription,
            });

            // Send any queued ICE candidates
            for (const candidate of pendingIceCandidatesRef.current) {
              socket.emit('webrtc:ice-candidate', {
                roomId: data.roomId,
                targetSocketId: data.fromSocketId,
                candidate,
              });
            }
            pendingIceCandidatesRef.current = [];
          }
        } catch (err) {
          console.error('[WebRTC] Error handling offer:', err);
          setError('Failed to establish connection with broadcaster');
        }
      });

      // 7. Listen for ICE candidates from broadcaster
      addSocketListener('webrtc:ice-candidate', (data: { fromSocketId: string; candidate: RTCIceCandidateInit }) => {
        if (!viewerPCRef.current) return;
        viewerPCRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)).catch((err) => {
          console.warn('[WebRTC] Error adding ICE candidate:', err);
        });
      });

      // 8. Listen for broadcaster leaving
      addSocketListener('webrtc:broadcaster-left', (data: { roomId: string }) => {
        if (data.roomId !== currentRoomRef.current) return;
        console.log('[WebRTC] Broadcaster left the stream');
        setError('The streamer has ended the broadcast');
        cleanup();
        setIsViewing(false);
        setRemoteStream(null);
      });

      // 9. Listen for ICE restart requests
      addSocketListener('webrtc:restart-ice', (data: { fromSocketId: string; roomId: string }) => {
        if (data.roomId !== currentRoomRef.current) return;
        if (viewerPCRef.current) {
          console.log('[WebRTC] Restarting ICE as requested by broadcaster');
          viewerPCRef.current.restartIce();
        }
      });

      // 10. Request to join the room
      socket.emit('webrtc:viewer-join', { roomId });

      // 11. Start stats collection
      startStatsCollection(() => viewerPCRef.current ? [viewerPCRef.current] : []);

      setIsViewing(true);
      console.log(`[WebRTC] Viewing started in room ${roomId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start viewing';
      setError(message);
      cleanup();
    }
  }, [cleanup, addSocketListener, startStatsCollection]);

  // Track broadcaster socket ID for ICE candidate routing
  const currentBroadcasterSidRef = useRef<string | null>(null);
  // Pending ICE candidates (before we know the broadcaster's socket ID)
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Reconnection logic
  const attemptReconnect = useCallback(async (roomId: string) => {
    if (reconnectAttemptRef.current >= maxReconnectAttempts) {
      setError('Connection lost. Please try refreshing the page.');
      return;
    }

    reconnectAttemptRef.current++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 10000);
    console.log(`[WebRTC] Reconnect attempt ${reconnectAttemptRef.current}/${maxReconnectAttempts} in ${delay}ms`);

    await new Promise((resolve) => setTimeout(resolve, delay));

    // Clean up existing state but keep the room reference
    if (viewerPCRef.current) {
      try { viewerPCRef.current.close(); } catch { /* ignore */ }
      viewerPCRef.current = null;
    }

    // Remove all socket listeners
    for (const cleanupFn of socketCleanupsRef.current) {
      cleanupFn();
    }
    socketCleanupsRef.current = [];

    try {
      await startViewing(roomId);
    } catch {
      // Will retry via the connection state handler
    }
  }, [startViewing]);

  const stopViewing = useCallback(async () => {
    const roomId = currentRoomRef.current;
    const socket = getSocketRef();

    // Notify server
    if (socket && roomId) {
      socket.emit('webrtc:viewer-leave', { roomId });
    }

    cleanup();
    setIsViewing(false);
    setRemoteStream(null);
    setStats({ bitrate: 0, fractionLost: 0, rtt: 0, codec: '' });
    console.log('[WebRTC] Viewing stopped');
  }, [cleanup]);

  // ========================================================================
  // CLEANUP ON UNMOUNT
  // ========================================================================

  useEffect(() => {
    return () => {
      // Stop all tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      // Close all PeerConnections
      for (const [, pc] of peerConnectionsRef.current) {
        try { pc.close(); } catch { /* */ }
      }
      peerConnectionsRef.current.clear();
      if (viewerPCRef.current) {
        try { viewerPCRef.current.close(); } catch { /* */ }
      }
      // Stop stats interval
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
      // Remove socket listeners
      for (const cleanupFn of socketCleanupsRef.current) {
        cleanupFn();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isStreaming,
    isViewing,
    localStream,
    remoteStream,
    error,
    stats,
    connectionState,
    viewerCount,
    startBroadcasting,
    stopBroadcasting,
    startViewing,
    stopViewing,
  };
}
