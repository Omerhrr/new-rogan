'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/authStore';

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
      // SECURITY: Pass auth token for WebSocket authentication
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
      socketRef.current = io(wsUrl, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        auth: {
          token: getCookieToken(),
        },
      });

      socketRef.current.on('connect', () => {
        console.log('[Socket] Connected:', socketRef.current?.id);
      });

      socketRef.current.on('disconnect', () => {
        console.log('[Socket] Disconnected');
      });

      socketRef.current.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message);
      });
    }

    // Auto-identify user for room-based delivery
    if (userId && socketRef.current?.connected) {
      socketRef.current.emit('user:identify', { userId });
    }

    return () => {
      if (socketRef.current) {
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

// Helper to get the auth token from cookies for WebSocket auth
function getCookieToken(): string {
  if (typeof document === 'undefined') return '';
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'rogan_live_token') {
      return value;
    }
  }
  return '';
}
