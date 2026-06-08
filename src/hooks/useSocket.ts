'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io('/?XTransformPort=3003', {
        transports: ['websocket', 'polling'],
        autoConnect: true,
      });

      socketRef.current.on('connect', () => {
        console.log('[Socket] Connected:', socketRef.current?.id);
      });

      socketRef.current.on('disconnect', () => {
        console.log('[Socket] Disconnected');
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

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
