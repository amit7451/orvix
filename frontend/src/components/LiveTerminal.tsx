import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Terminal,
  Wifi,
  WifiOff,
  Trash2,
  Pause,
  Play,
  Search,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useEventStream } from '../context/EventStreamContext';

interface LiveTerminalProps {
  maxHeight?: string;
}

type EventFilter = 'all' | 'incident' | 'agent' | 'approval' | 'watcher';

interface EventStyle {
  color: string;
  className: string;
  label: string;
}

const EVENT_STYLES: Record<string, EventStyle> = {
  'incident.created': { color: 'var(--destructive)', className: 'event-incident', label: 'INCIDENT' },
  'incident.updated': { color: 'var(--warning)', className: 'event-incident', label: 'INCIDENT' },
  'incident.resolved': { color: 'var(--success)', className: 'event-incident', label: 'RESOLVED' },
  'incident.escalated': { color: 'var(--destructive)', className: 'event-incident', label: 'ESCALATED' },
  'evidence.collected': { color: '#a78bfa', className: 'event-evidence', label: 'EVIDENCE' },
  'rag.retrieval_completed': { color: '#c084fc', className: 'event-rag', label: 'RAG' },
  'diagnosis.completed': { color: 'var(--warning)', className: 'event-diagnosis', label: 'DIAGNOSIS' },
  'approval.requested': { color: '#fbbf24', className: 'event-approval', label: 'APPROVAL' },
  'approval.approved': { color: 'var(--success)', className: 'event-approval', label: 'APPROVED' },
  'approval.rejected': { color: 'var(--destructive)', className: 'event-approval', label: 'REJECTED' },
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

function formatEventMessage(type: string, payload: any): { title: string; subtitle?: string } {
  if (!payload || typeof payload !== 'object') {
    return { title: String(payload || '') };
  }

  switch (type) {
    case 'incident.created':
      return {
        title: `Incident detected: "${payload.title || 'Untitled'}" [${payload.severity || 'UNKNOWN'}]`,
        subtitle: payload.incident_id ? `ID: ${payload.incident_id.slice(0, 8)}` : undefined,
      };

    case 'incident.updated':
      if (payload.status) {
        return {
          title: `Status changed → ${payload.status}`,
          subtitle: payload.note ? payload.note : undefined,
        };
      }
      if (payload.fields && Array.isArray(payload.fields)) {
        return {
          title: `Updated fields: ${payload.fields.join(', ')}`,
        };
      }
      return { title: 'Incident updated' };

    case 'incident.resolved':
      return {
        title: 'Incident resolved successfully',
        subtitle: payload.note || 'All health metrics restored to baseline.',
      };

    case 'incident.escalated':
      return {
        title: 'Incident escalated to on-call engineering team',
        subtitle: payload.note || 'Automated remediation could not resolve the incident.',
      };

    case 'agent.started':
      return {
        title: 'Autonomous reliability agent started investigation',
        subtitle: payload.incident_id ? `Incident: ${payload.incident_id.slice(0, 8)}` : undefined,
      };

    case 'agent.completed':
      return {
        title: `Autonomous agent finished pipeline: ${payload.status || 'COMPLETED'}`,
        subtitle: payload.final_stage ? `Final stage: ${payload.final_stage}` : undefined,
      };

    case 'watcher.anomaly':
      return {
        title: `Watcher detected anomalous ${payload.metric} on ${payload.service}`,
        subtitle: `Value: ${payload.value} (score: ${payload.anomaly_score})`,
      };

    case 'evidence.collected':
      return {
        title: `Telemetry collected for ${(payload.services || []).join(', ') || 'services'}`,
        subtitle: `${payload.anomaly_count || 0} anomalous telemetry signal(s) evaluated`,
      };

    case 'rag.retrieval_completed':
      return {
        title: `Knowledge search: ${payload.documents_retrieved || 0} runbook(s) + ${payload.similar_incidents || 0} past incident(s)`,
      };

    case 'diagnosis.completed':
      return {
        title: `Root Cause: "${payload.root_cause || 'Identified'}"`,
        subtitle: payload.confidence ? `Confidence: ${(payload.confidence * 100).toFixed(0)}%` : undefined,
      };

    case 'approval.requested':
      return {
        title: `Human approval requested: "${payload.tool}" [${payload.risk_level || 'HIGH'} risk]`,
        subtitle: `Tool execution requires engineer authorization`,
      };

    case 'approval.approved':
      return {
        title: `Action APPROVED for execution`,
        subtitle: payload.approver ? `Authorized by: ${payload.approver}` : undefined,
      };

    case 'approval.rejected':
      return {
        title: `Action REJECTED`,
        subtitle: payload.approver ? `Rejected by: ${payload.approver}` : undefined,
      };

    case 'tool.started':
      return {
        title: `Executing remediation tool: ${payload.tool}`,
        subtitle: payload.target ? `Target: ${payload.target}` : undefined,
      };

    case 'tool.completed':
      return {
        title: `Tool ${payload.tool} completed: ${payload.status || 'SUCCESS'}`,
      };

    case 'verification.started':
      return {
        title: `Verifying recovery on ${(payload.services || []).join(', ') || 'services'}`,
      };

    case 'verification.completed':
      return {
        title: `Recovery verification: ${payload.passed ? 'PASSED (Healthy)' : 'FAILED (Degraded)'}`,
        subtitle: payload.duration_ms ? `Duration: ${payload.duration_ms}ms` : undefined,
      };

    case 'notification.sent':
      return {
        title: `Notification sent via [${payload.channel || 'console'}]`,
        subtitle: payload.subject ? `Subject: ${payload.subject}` : undefined,
      };

    default: {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(payload)) {
        if (k === 'type' || k === 'timestamp' || k === 'id') continue;
        if (typeof v === 'object') parts.push(`${k}=${JSON.stringify(v)}`);
        else parts.push(`${k}=${v}`);
      }
      return { title: parts.join('  ') || type };
    }
  }
}

export const LiveTerminal: React.FC<LiveTerminalProps> = ({ maxHeight = '300px' }) => {
  const { events, connected, clearEvents } = useEventStream();
  const [filter, setFilter] = useState<EventFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const streamContainerRef = useRef<HTMLDivElement>(null);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      // Category filter
      if (filter === 'incident' && !evt.type.startsWith('incident.')) return false;
      if (
        filter === 'agent' &&
        !evt.type.startsWith('agent.') &&
        !evt.type.startsWith('tool.') &&
        !evt.type.startsWith('evidence.') &&
        !evt.type.startsWith('rag.') &&
        !evt.type.startsWith('diagnosis.') &&
        !evt.type.startsWith('verification.')
      ) {
        return false;
      }
      if (filter === 'approval' && !evt.type.startsWith('approval.')) return false;
      if (filter === 'watcher' && !evt.type.startsWith('watcher.')) return false;

      // Text search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const payloadStr = JSON.stringify(evt.payload || '').toLowerCase();
        const typeStr = evt.type.toLowerCase();
        return typeStr.includes(query) || payloadStr.includes(query);
      }

      return true;
    });
  }, [events, filter, searchQuery]);

  // Scroll to bottom on new event if autoScroll is enabled
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredEvents.length, autoScroll]);

  return (
    <>
      <div className="card-header flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="card-title flex items-center gap-2 mb-0">
            <Terminal size={16} style={{ color: 'var(--info)' }} />
            Live Event Stream
          </h3>
          <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>
            {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search bar */}
          <div className="relative flex items-center" style={{ width: '140px' }}>
            <Search size={12} className="absolute left-2 text-muted" style={{ pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs"
              style={{
                paddingLeft: '1.6rem',
                paddingTop: '0.2rem',
                paddingBottom: '0.2rem',
                height: '26px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: '4px',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          {/* Auto-scroll toggle */}
          <button
            className={`btn btn-xs ${autoScroll ? 'btn-ghost' : 'btn-outline'}`}
            title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
            onClick={() => setAutoScroll((prev) => !prev)}
          >
            {autoScroll ? <Pause size={12} /> : <Play size={12} />}
          </button>

          {/* Clear stream */}
          <button
            className="btn btn-ghost btn-xs text-muted"
            title="Clear event log"
            onClick={clearEvents}
            disabled={events.length === 0}
          >
            <Trash2 size={12} />
          </button>

          {/* Connection status indicator */}
          <div className="connection-indicator flex items-center gap-1.5 ml-1">
            {connected ? (
              <>
                <div className="connection-dot" />
                <span className="text-xs text-muted" style={{ fontSize: '0.7rem' }}>Live</span>
                <Wifi size={13} style={{ color: 'var(--success)' }} />
              </>
            ) : (
              <>
                <div className="connection-dot offline" />
                <span className="text-xs text-muted" style={{ fontSize: '0.7rem' }}>Offline</span>
                <WifiOff size={13} style={{ color: 'var(--destructive)' }} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b" style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.2)' }}>
        <button
          className={`btn btn-xs ${filter === 'all' ? 'btn-primary' : 'btn-ghost text-muted'}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={`btn btn-xs ${filter === 'incident' ? 'btn-primary' : 'btn-ghost text-muted'}`}
          onClick={() => setFilter('incident')}
        >
          Incidents
        </button>
        <button
          className={`btn btn-xs ${filter === 'agent' ? 'btn-primary' : 'btn-ghost text-muted'}`}
          onClick={() => setFilter('agent')}
        >
          Agent & Tools
        </button>
        <button
          className={`btn btn-xs ${filter === 'approval' ? 'btn-primary' : 'btn-ghost text-muted'}`}
          onClick={() => setFilter('approval')}
        >
          Approvals
        </button>
        <button
          className={`btn btn-xs ${filter === 'watcher' ? 'btn-primary' : 'btn-ghost text-muted'}`}
          onClick={() => setFilter('watcher')}
        >
          Watcher
        </button>
      </div>

      {/* Event Stream Body */}
      <div
        ref={streamContainerRef}
        className="terminal-stream"
        style={{ maxHeight, minHeight: '140px', padding: '0.6rem 0.8rem' }}
      >
        {filteredEvents.length === 0 && (
          <div className="text-muted text-sm" style={{ padding: '1.5rem', textAlign: 'center' }}>
            {searchQuery || filter !== 'all'
              ? 'No matching events found for current filters.'
              : 'Waiting for events... Inject a failure in the Simulation page to watch ORVIX respond live.'}
          </div>
        )}

        {filteredEvents.map((evt) => {
          const style = EVENT_STYLES[evt.type] || {
            color: 'var(--muted-foreground)',
            className: '',
            label: evt.type.split('.').pop()?.toUpperCase() || 'EVENT',
          };
          const { title, subtitle } = formatEventMessage(evt.type, evt.payload);
          const isExpanded = expandedId === evt.id;

          return (
            <div
              key={evt.id}
              className="terminal-line"
              style={{ cursor: 'pointer' }}
              onClick={() => setExpandedId(isExpanded ? null : evt.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-1.5 flex-1 min-w-0">
                  <span className="terminal-time flex-shrink-0" style={{ marginTop: '1px' }}>
                    {evt.time}
                  </span>
                  <span
                    className={`terminal-source ${style.className} flex-shrink-0`}
                    style={{ color: style.color, minWidth: '72px', display: 'inline-block' }}
                  >
                    [{style.label}]
                  </span>
                  <div className="flex-1 min-w-0" style={{ wordBreak: 'break-word' }}>
                    <span className="text-foreground font-medium">{title}</span>
                    {subtitle && (
                      <span className="text-muted text-xs ml-2" style={{ opacity: 0.85 }}>
                        — {subtitle}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-muted flex-shrink-0" style={{ opacity: 0.5 }}>
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </div>
              </div>

              {isExpanded && (
                <div
                  className="mt-2 p-2 rounded text-xs font-mono"
                  style={{
                    background: 'rgba(0, 0, 0, 0.45)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    maxHeight: '160px',
                    overflowY: 'auto',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-muted mb-1 text-xs" style={{ fontSize: '0.68rem' }}>
                    Event ID: {evt.id} • Type: {evt.type} • Timestamp: {evt.timestamp}
                  </div>
                  <pre style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>
                    {JSON.stringify(evt.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </>
  );
};
