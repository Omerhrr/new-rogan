'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/authStore';
import { setSocketRef, clearSocketRef } from '@/lib/socket-ref';

export function useSocket(userId?: string) {
  const socketRef = useRef<Socket | null>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    // SECURITY: Only connect if user is authenticated
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    if (!socketRef.current) {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

      // Fetch a WS token from the API (needed because the auth cookie is httpOnly)
      fetch('/api/auth/ws-token')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.token) {
            console.error('[Socket] Failed to get WS auth token');
            return;
          }

          // Debug: log secret hash to verify it matches WS server
          if (data._debug?.secretHash) {
            console.log('[Socket] Next.js secret hash:', data._debug.secretHash, '(must match WS server)');
          }

          socketRef.current = io(wsUrl, {
            transports: ['websocket', 'polling'],
            autoConnect: true,
            auth: {
              token: data.token,
            },
          });

          // Store socket ref for ack-based signaling (mediasoup)
          setSocketRef(socketRef.current);

          socketRef.current.on('connect', () => {
            console.log('[Socket] Connected:', socketRef.current?.id);
            // Auto-identify user for room-based delivery
            if (userId) {
              socketRef.current?.emit('user:identify', { userId });
            }
          });

          socketRef.current.on('disconnect', () => {
            console.log('[Socket] Disconnected');
          });

          socketRef.current.on('connect_error', (err) => {
            console.error('[Socket] Connection error:', err.message);
          });
        })
        .catch((err) => {
          console.error('[Socket] Token fetch failed:', err.message);
        });
    }

    // Auto-identify user for room-based delivery (if already connected)
    if (userId && socketRef.current?.connected) {
      socketRef.current.emit('user:identify', { userId });
    }

    return () => {
      if (socketRef.current) {
        clearSocketRef();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user, userId]);

  const emit = useCallback((event: string, data: unknown) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  const on = useCallback((event: string, callback: (...args: unknown[]) => void) => {
    socketRef.current?.on(event, callback);
    return () => {
      socketRef.current?.off(event, callback);
    };
  }, []);

  const off = useCallback((event: string, callback?: (...args: unknown[]) => void) => {
    socketRef.current?.off(event, callback);
  }, []);

  return { emit, on, off };
}
