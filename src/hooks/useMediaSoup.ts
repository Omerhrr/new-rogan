'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Device } from 'mediasoup-client';
import type {
  Transport,
  Producer,
  Consumer,
  RtpCapabilities,
  DtlsParameters,
  IceParameters,
  IceCandidate,
  RtpParameters,
} from 'mediasoup-client/types';
import { socketEmitWithAck, getSocketRef } from '@/lib/socket-ref';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransportRemoteParams {
  id: string;
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: DtlsParameters;
}

interface ConsumerRemoteParams {
  id: string;
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: RtpParameters;
}

export interface StreamStats {
  bitrate: number;
  fractionLost: number;
}

export interface UseMediaSoupReturn {
  // State
  isStreaming: boolean;
  isViewing: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteVideoTrack: MediaStreamTrack | null;
  remoteAudioTrack: MediaStreamTrack | null;
  error: string | null;
  stats: StreamStats;

  // Broadcaster actions
  startBroadcasting: (roomId: string) => Promise<void>;
  stopBroadcasting: () => Promise<void>;

  // Viewer actions
  startViewing: (roomId: string) => Promise<void>;
  stopViewing: () => Promise<void>;

  // Quality control
  setQuality: (spatialLayer: number, temporalLayer: number) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMediaSoup(): UseMediaSoupReturn {
  // ---- State exposed to consumers ----
  const [isStreaming, setIsStreaming] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [remoteAudioTrack, setRemoteAudioTrack] = useState<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StreamStats>({ bitrate: 0, fractionLost: 0 });

  // ---- Internal refs (survive re-renders, not trigger them) ----
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);
  const producersRef = useRef<Producer[]>([]);
  const consumersRef = useRef<Consumer[]>([]);
  const currentRoomRef = useRef<string | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevBytesRef = useRef<number>(0);

  // ---- Cleanup helper ----
  const cleanup = useCallback(() => {
    // Close producers
    producersRef.current.forEach((p) => {
      try { p.close(); } catch { /* ignore */ }
    });
    producersRef.current = [];

    // Close consumers
    consumersRef.current.forEach((c) => {
      try { c.close(); } catch { /* ignore */ }
    });
    consumersRef.current = [];

    // Close transports
    if (sendTransportRef.current) {
      try { sendTransportRef.current.close(); } catch { /* ignore */ }
      sendTransportRef.current = null;
    }
    if (recvTransportRef.current) {
      try { recvTransportRef.current.close(); } catch { /* ignore */ }
      recvTransportRef.current = null;
    }

    // Stop local stream tracks
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }

    // Stop stats interval
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    prevBytesRef.current = 0;

    deviceRef.current = null;
    currentRoomRef.current = null;

    // Remove socket listener for newProducer
    const socket = getSocketRef();
    if (socket) {
      socket.off('webrtc:newProducer');
    }
  }, [localStream]);

  // ---- Stats collection ----
  const startStatsCollection = useCallback((transport: Transport) => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }
    prevBytesRef.current = 0;

    statsIntervalRef.current = setInterval(async () => {
      try {
        const transportStats = await transport.getStats();
        let bytesSent = 0;
        let bytesReceived = 0;
        let fractionLost = 0;
        let count = 0;

        for (const report of transportStats.values()) {
          if (report.type === 'outbound-rtp') {
            bytesSent += (report as RTCOutboundRtpStreamStats).bytesSent ?? 0;
          }
          if (report.type === 'inbound-rtp') {
            const inbound = report as RTCInboundRtpStreamStats;
            bytesReceived += inbound.bytesReceived ?? 0;
            const fLost = (inbound as any).fractionLost ?? 0;
            fractionLost += fLost;
            count++;
          }
        }

        const totalBytes = bytesSent || bytesReceived;
        const bitrate = Math.round(((totalBytes - prevBytesRef.current) * 8) / 2000); // kbps (2s interval)
        prevBytesRef.current = totalBytes;

        setStats({
          bitrate: bitrate > 0 ? bitrate : 0,
          fractionLost: count > 0 ? fractionLost / count : 0,
        });
      } catch {
        // Stats might fail if transport is closed
      }
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
      // 1. Get user media
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      setLocalStream(stream);

      // 2. Get router RTP capabilities
      const { rtpCapabilities } = await socketEmitWithAck('webrtc:getRouterRtpCapabilities', { roomId });
      if (!rtpCapabilities) {
        throw new Error('Failed to get router RTP capabilities');
      }

      // 3. Create device and load
      const device = new Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities as RtpCapabilities });
      deviceRef.current = device;

      // 4. Create producer transport on server
      const transportParams = await socketEmitWithAck('webrtc:createProducerTransport', { roomId }) as TransportRemoteParams;
      if (!transportParams?.id) {
        throw new Error('Failed to create producer transport');
      }

      // 5. Create send transport on device
      const sendTransport = device.createSendTransport({
        id: transportParams.id,
        iceParameters: transportParams.iceParameters,
        iceCandidates: transportParams.iceCandidates,
        dtlsParameters: transportParams.dtlsParameters,
      });

      sendTransportRef.current = sendTransport;

      // 6. Handle 'connect' event
      sendTransport.on('connect', async ({ dtlsParameters: dtls }, callback, errback) => {
        try {
          await socketEmitWithAck('webrtc:connectTransport', {
            roomId,
            transportId: sendTransport.id,
            dtlsParameters: dtls,
          });
          callback();
        } catch (err) {
          errback(err as Error);
        }
      });

      // 7. Handle 'produce' event
      sendTransport.on('produce', async ({ kind, rtpParameters: rtp }, callback, errback) => {
        try {
          const { id } = await socketEmitWithAck('webrtc:produce', {
            roomId,
            transportId: sendTransport.id,
            kind,
            rtpParameters: rtp,
          });
          callback({ id });
        } catch (err) {
          errback(err as Error);
        }
      });

      // 8. Produce each track
      const producers: Producer[] = [];
      for (const track of stream.getTracks()) {
        const producer = await sendTransport.produce({ track });
        producers.push(producer);
      }
      producersRef.current = producers;

      // Start stats
      startStatsCollection(sendTransport);

      setIsStreaming(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start broadcasting';
      setError(message);

      // Stop any stream tracks we may have acquired
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      cleanup();
    }
  }, [cleanup, startStatsCollection]);

  const stopBroadcasting = useCallback(async () => {
    const roomId = currentRoomRef.current;
    try {
      if (roomId) {
        await socketEmitWithAck('webrtc:closeProducer', { roomId });
      }
    } catch {
      // Ignore signaling errors on close
    }

    // Stop local tracks
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }

    cleanup();
    setIsStreaming(false);
    setLocalStream(null);
    setStats({ bitrate: 0, fractionLost: 0 });
  }, [cleanup, localStream]);

  // ========================================================================
  // VIEWER FLOW
  // ========================================================================

  const startViewing = useCallback(async (roomId: string) => {
    setError(null);
    currentRoomRef.current = roomId;

    try {
      // 1. Get router RTP capabilities
      const { rtpCapabilities } = await socketEmitWithAck('webrtc:getRouterRtpCapabilities', { roomId });
      if (!rtpCapabilities) {
        throw new Error('Failed to get router RTP capabilities');
      }

      // 2. Create device and load
      const device = new Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities as RtpCapabilities });
      deviceRef.current = device;

      // 3. Create consumer transport on server
      const transportParams = await socketEmitWithAck('webrtc:createConsumerTransport', { roomId }) as TransportRemoteParams;
      if (!transportParams?.id) {
        throw new Error('Failed to create consumer transport');
      }

      // 4. Create recv transport on device
      const recvTransport = device.createRecvTransport({
        id: transportParams.id,
        iceParameters: transportParams.iceParameters,
        iceCandidates: transportParams.iceCandidates,
        dtlsParameters: transportParams.dtlsParameters,
      });

      recvTransportRef.current = recvTransport;

      // 5. Handle 'connect' event
      recvTransport.on('connect', async ({ dtlsParameters: dtls }, callback, errback) => {
        try {
          await socketEmitWithAck('webrtc:connectTransport', {
            roomId,
            transportId: recvTransport.id,
            dtlsParameters: dtls,
          });
          callback();
        } catch (err) {
          errback(err as Error);
        }
      });

      // Create remote MediaStream for playback
      const remote = new MediaStream();
      setRemoteStream(remote);

      // 6. Listen for new producers
      const socket = getSocketRef();
      if (!socket) {
        throw new Error('Socket not connected');
      }

      const handleNewProducer = async ({ producerId, kind }: { producerId: string; kind: 'audio' | 'video' }) => {
        try {
          // 7. Consume the producer
          const consumerParams = await socketEmitWithAck('webrtc:consume', {
            roomId,
            consumerTransportId: recvTransport.id,
            producerId,
            rtpCapabilities: device.rtpCapabilities,
          }) as ConsumerRemoteParams;

          if (!consumerParams?.id) {
            console.error('[MediaSoup] Failed to consume producer:', producerId);
            return;
          }

          // 8. Create consumer on device
          const consumer = await recvTransport.consume({
            id: consumerParams.id,
            producerId: consumerParams.producerId,
            kind: consumerParams.kind,
            rtpParameters: consumerParams.rtpParameters,
          });

          // 9. Resume consumer
          await socketEmitWithAck('webrtc:resumeConsumer', {
            roomId,
            consumerId: consumer.id,
          });

          // 10. Add track to remote stream
          remote.addTrack(consumer.track);
          if (consumer.kind === 'video') {
            setRemoteVideoTrack(consumer.track);
          } else if (consumer.kind === 'audio') {
            setRemoteAudioTrack(consumer.track);
          }

          consumersRef.current.push(consumer);
        } catch (err) {
          console.error('[MediaSoup] Error consuming producer:', err);
        }
      };

      socket.on('webrtc:newProducer', handleNewProducer);

      // Start stats
      startStatsCollection(recvTransport);

      setIsViewing(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start viewing';
      setError(message);
      cleanup();
    }
  }, [cleanup, startStatsCollection]);

  const stopViewing = useCallback(async () => {
    const roomId = currentRoomRef.current;

    // Close each consumer via signaling
    for (const consumer of consumersRef.current) {
      try {
        if (roomId) {
          await socketEmitWithAck('webrtc:closeConsumer', {
            roomId,
            consumerId: consumer.id,
          });
        }
      } catch {
        // Ignore
      }
    }

    cleanup();
    setIsViewing(false);
    setRemoteStream(null);
    setRemoteVideoTrack(null);
    setRemoteAudioTrack(null);
    setStats({ bitrate: 0, fractionLost: 0 });
  }, [cleanup]);

  // ========================================================================
  // QUALITY CONTROL
  // ========================================================================

  const setQuality = useCallback((spatialLayer: number, temporalLayer: number) => {
    const roomId = currentRoomRef.current;
    if (!roomId) return;

    for (const consumer of consumersRef.current) {
      if (consumer.kind === 'video') {
        // Notify server to set preferred layers on the server-side consumer
        socketEmitWithAck('webrtc:setPreferredLayers', {
          roomId,
          consumerId: consumer.id,
          spatialLayer,
          temporalLayer,
        }).catch(() => {
          // Ignore
        });
      }
    }
  }, []);

  // ========================================================================
  // CLEANUP ON UNMOUNT
  // ========================================================================

  useEffect(() => {
    return () => {
      // Stop all tracks
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
      if (remoteStream) {
        remoteStream.getTracks().forEach((t) => t.stop());
      }
      // Close everything
      producersRef.current.forEach((p) => { try { p.close(); } catch { /* */ } });
      consumersRef.current.forEach((c) => { try { c.close(); } catch { /* */ } });
      if (sendTransportRef.current) { try { sendTransportRef.current.close(); } catch { /* */ } }
      if (recvTransportRef.current) { try { recvTransportRef.current.close(); } catch { /* */ } }
      if (statsIntervalRef.current) { clearInterval(statsIntervalRef.current); }
      const socket = getSocketRef();
      if (socket) { socket.off('webrtc:newProducer'); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isStreaming,
    isViewing,
    localStream,
    remoteStream,
    remoteVideoTrack,
    remoteAudioTrack,
    error,
    stats,
    startBroadcasting,
    stopBroadcasting,
    startViewing,
    stopViewing,
    setQuality,
  };
}
