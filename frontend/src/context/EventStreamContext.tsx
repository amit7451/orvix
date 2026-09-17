import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { WS_BASE } from '../types';

export interface StreamEvent {
  id: string;
  type: string;
  time: string;
  timestamp: string;
  payload: any;
  raw: any;
}

interface EventStreamContextType {
  events: StreamEvent[];
  connected: boolean;
  clearEvents: () => void;
  reconnect: () => void;
}

const EventStreamContext = createContext<EventStreamContextType>({
  events: [],
  connected: false,
  clearEvents: () => {},
  reconnect: () => {},
});

export const useEventStream = () => useContext(EventStreamContext);

export const EventStreamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);

  // Set of seen event keys to strictly guarantee no duplicate entries
  const seenIds = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const isUnmountedRef = useRef(false);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;

    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const ws = new WebSocket(`${WS_BASE}/ws/events`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmountedRef.current) {
          ws.close();
          return;
        }
        setConnected(true);
      };

      ws.onclose = () => {
        if (isUnmountedRef.current) return;
        setConnected(false);
        // Clean reconnect with timer reference tracked
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = () => {
        if (isUnmountedRef.current) return;
        setConnected(false);
      };

      ws.onmessage = (evt) => {
        if (isUnmountedRef.current) return;
        try {
          const data = JSON.parse(evt.data);
          
          // Compute unique deduplication key
          const dedupeKey = data.id 
            ? data.id 
            : `${data.timestamp || ''}_${data.type || ''}_${JSON.stringify(data.payload || {})}`;

          // If already seen, drop silently to prevent duplicates
          if (seenIds.current.has(dedupeKey)) {
            return;
          }

          seenIds.current.add(dedupeKey);
          if (seenIds.current.size > 1000) {
            // Trim old IDs to prevent unbounded memory usage
            const idArray = Array.from(seenIds.current);
            seenIds.current = new Set(idArray.slice(-500));
          }

          const newEvent: StreamEvent = {
            id: dedupeKey,
            type: data.type || 'unknown',
            timestamp: data.timestamp || new Date().toISOString(),
            time: new Date(data.timestamp || Date.now()).toLocaleTimeString(),
            payload: data.payload || data,
            raw: data,
          };

          setEvents((prev) => [...prev.slice(-199), newEvent]);
        } catch (err) {
          console.error('[EventStream] Failed to parse event frame:', err);
        }
      };
    } catch (err) {
      console.error('[EventStream] Connection initialization error:', err);
      reconnectTimeoutRef.current = setTimeout(connect, 4000);
    }
  }, []);

  const reconnect = useCallback(() => {
    connect();
  }, [connect]);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return (
    <EventStreamContext.Provider value={{ events, connected, clearEvents, reconnect }}>
      {children}
    </EventStreamContext.Provider>
  );
};
