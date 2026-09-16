import React, { useState, useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import type { EventData } from '../types';

export const LiveTerminal: React.FC = () => {
  const [events, setEvents] = useState<EventData[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/events');
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setEvents(prev => {
          const newEvents = [...prev, data];
          return newEvents.slice(-50);
        });
      } catch (err) {
        console.error('Failed to parse websocket message', err);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <div className="card h-full">
      <div className="card-header flex items-center justify-between">
        <h2 className="card-title flex items-center gap-2">
          <Terminal size={20} className="text-muted" />
          Live Agent Telemetry
        </h2>
        <button 
          className="btn btn-outline text-xs" 
          style={{ padding: '0.2rem 0.5rem', height: 'auto' }}
          onClick={() => setEvents([])}
        >
          Clear Logs
        </button>
      </div>
      <div className="card-content" style={{ padding: '0' }}>
        <div className="terminal-stream" style={{ height: 'calc(100vh - 250px)', maxHeight: 'none' }}>
          {events.map((ev, i) => (
            <div key={i} className="terminal-line">
              <span className="terminal-time">
                {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : ''}
              </span>
              <span className="terminal-source">[{ev.type}]</span>
              
              {ev.payload && (
                <div style={{ color: '#94a3b8', paddingLeft: '1rem', marginTop: '0.25rem', whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                  {JSON.stringify(ev.payload, null, 2)}
                </div>
              )}
            </div>
          ))}
          {events.length === 0 && <div className="text-muted p-4">Waiting for events...</div>}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
};
