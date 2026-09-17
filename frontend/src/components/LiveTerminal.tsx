import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Wifi, WifiOff } from 'lucide-react';
import { WS_BASE } from '../types';

interface LiveTerminalProps {
  maxHeight?: string;
}

const EVENT_STYLES: Record<string, { color: string; className: string; label: string }> = {
  'incident.created': { color: 'var(--destructive)', className: 'event-incident', label: 'INCIDENT' },
  'incident.updated': { color: 'var(--warning)', className: 'event-incident', label: 'INCIDENT' },
  'incident.resolved': { color: 'var(--success)', className: 'event-incident', label: 'RESOLVED' },
  'incident.escalated': { color: 'var(--destructive)', className: 'event-incident', label: 'ESCALATED' },
  'evidence.collected': { color: '#a78bfa', className: 'event-evidence', label: 'EVIDENCE' },
  'rag.retrieval_completed': { color: '#c084fc', className: 'event-rag', label: 'RAG' },
  'diagnosis.completed': { color: 'var(--warning)', className: 'event-diagnosis', label: 'DIAGNOSIS' },
  'approval.requested': { color: '#fbbf24', className: 'event-approval', label: 'APPROVAL' },
  'approval.resolved': { color: '#fbbf24', className: 'event-approval', label: 'APPROVAL' },
  'tool.started': { color: 'var(--success)', className: 'event-tool', label: 'TOOL' },
  'tool.completed': { color: 'var(--success)', className: 'event-tool', label: 'TOOL' },
  'verification.started': { color: '#34d399', className: 'event-verification', label: 'VERIFY' },
  'verification.completed': { color: '#34d399', className: 'event-verification', label: 'VERIFY' },
  'notification.sent': { color: '#60a5fa', className: 'event-notification', label: 'NOTIFY' },
  'watcher.anomaly': { color: 'var(--warning)', className: 'event-agent', label: 'WATCHER' },
  'agent.started': { color: 'var(--info)', className: 'event-agent', label: 'AGENT' },
  'agent.completed': { color: 'var(--info)', className: 'event-agent', label: 'AGENT' },
};

function formatPayload(payload: any): string {
  if (!payload || typeof payload !== 'object') return String(payload || '');
  const parts: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'type' || key === 'timestamp') continue;
    if (typeof value === 'object' && value !== null) {
      parts.push(`${key}=${JSON.stringify(value)}`);
    } else {
      parts.push(`${key}=${value}`);
    }
  }
  return parts.join('  ');
}

export const LiveTerminal: React.FC<LiveTerminalProps> = ({ maxHeight = '300px' }) => {
  const [events, setEvents] = useState<{ id: number; type: string; time: string; payload: any }[]>([]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    const connect = () => {
      ws = new WebSocket(`${WS_BASE}/ws/events`);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 3000);
      };
      ws.onerror = () => setConnected(false);
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          setEvents(prev => [...prev.slice(-100), {
            id: idCounter.current++,
            type: data.type || 'unknown',
            time: new Date(data.timestamp || Date.now()).toLocaleTimeString(),
            payload: data.payload || data,
          }]);
        } catch {}
      };
    };
    connect();
    return () => { ws?.close(); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <>
      <div className="card-header flex items-center justify-between">
        <h3 className="card-title flex items-center gap-2">
          <Terminal size={16} style={{ color: 'var(--info)' }} />
          Live Event Stream
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{events.length} events</span>
          <div className="connection-indicator">
            {connected ? (
              <><div className="connection-dot" /><Wifi size={12} /></>
            ) : (
              <><div className="connection-dot offline" /><WifiOff size={12} /></>
            )}
          </div>
        </div>
      </div>
      <div className="terminal-stream" style={{ maxHeight, minHeight: '120px' }}>
        {events.length === 0 && (
          <div className="text-muted text-sm" style={{ padding: '1rem', textAlign: 'center' }}>
            Waiting for events... Inject a failure in the Simulation page to get started.
          </div>
        )}
        {events.map(evt => {
          const style = EVENT_STYLES[evt.type] || { color: 'var(--muted-foreground)', className: '', label: evt.type.split('.').pop()?.toUpperCase() || 'EVENT' };
          return (
            <div key={evt.id} className="terminal-line">
              <span className="terminal-time">{evt.time}</span>
              <span className={`terminal-source ${style.className}`} style={{ color: style.color }}>
                [{style.label}]
              </span>
              <span>{formatPayload(evt.payload)}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </>
  );
};
