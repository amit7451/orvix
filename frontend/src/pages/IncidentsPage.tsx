import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Search, Clock, PlayCircle } from 'lucide-react';
import { ApprovalQueue } from '../components/ApprovalQueue';
import type { Incident } from '../types';
import { API_BASE, AGENT_STAGES } from '../types';
import { useToast } from '../components/Toast';

function getIncidentCurrentStep(inc: Incident): { step: number; stage: string; summary: string } {
  if (inc.status === 'RESOLVED') {
    return { step: 9, stage: 'LEARN', summary: 'Incident resolved; post-mortem archived to long-term memory.' };
  }
  if (inc.status === 'ESCALATED') {
    return { step: 8, stage: 'VERIFY', summary: 'Verification failed; escalated to on-call engineering team.' };
  }
  if (inc.verification && Object.keys(inc.verification).length > 0) {
    return { step: 8, stage: 'VERIFY', summary: 'Independently verifying service recovery criteria.' };
  }
  if (inc.status === 'REMEDIATING') {
    return { step: 7, stage: 'ACT', summary: 'Executing automated remediation actions on target services.' };
  }
  if (inc.status === 'AWAITING_APPROVAL') {
    return { step: 6, stage: 'AUTHORIZE', summary: 'Safety policy gate: awaiting human engineer approval.' };
  }
  if (inc.remediation_plan && Object.keys(inc.remediation_plan).length > 0) {
    return { step: 5, stage: 'PLAN', summary: 'Formulated multi-step remediation plan with rollback contingencies.' };
  }
  if (inc.probable_root_cause) {
    return { step: 4, stage: 'REASON', summary: `Diagnosed: ${inc.probable_root_cause.slice(0, 80)}...` };
  }
  if (inc.symptoms?.length > 0) {
    return { step: 2, stage: 'UNDERSTAND', summary: 'Symptoms normalized; querying knowledge runbooks.' };
  }
  if (inc.evidence && Object.keys(inc.evidence).length > 0) {
    return { step: 1, stage: 'OBSERVE', summary: 'Telemetry anomalies collected from affected infrastructure.' };
  }
  return { step: 1, stage: 'OBSERVE', summary: 'Anomaly detected; awaiting agent investigation.' };
}

export const IncidentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/incidents`);
        if (res.ok) setIncidents(await res.json());
      } catch (err) { console.error(err); }
    };
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 3000);
    return () => clearInterval(interval);
  }, []);

  const invokeAgent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE}/api/agent/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: id })
      });
      addToast('success', 'AI Agent invoked — investigation started');
    } catch {
      addToast('error', 'Failed to invoke agent');
    }
  };

  const filtered = incidents.filter(inc => {
    const matchesSearch = !filter || inc.title.toLowerCase().includes(filter.toLowerCase()) || inc.id.includes(filter);
    const matchesStatus = statusFilter === 'ALL' || inc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColor = (status: string) => {
    switch (status) {
      case 'RESOLVED': return 'badge-success';
      case 'ESCALATED': case 'FAILED': return 'badge-destructive';
      case 'AWAITING_APPROVAL': return 'badge-purple';
      case 'DETECTED': return 'badge-info';
      default: return 'badge-warning';
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'badge-destructive';
      case 'HIGH': return 'badge-warning';
      case 'MEDIUM': return 'badge-info';
      default: return 'badge-muted';
    }
  };

  const statuses = ['ALL', 'DETECTED', 'INVESTIGATING', 'DIAGNOSED', 'AWAITING_APPROVAL', 'REMEDIATING', 'VERIFYING', 'RESOLVED', 'ESCALATED'];

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1>Incidents</h1>
          <p className="page-subtitle">All detected incidents and their investigation status</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Incidents List */}
        <div className="lg:col-span-2">
          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <div className="flex items-center gap-2 flex-1" style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--muted-foreground)' }} />
              <input
                type="text"
                placeholder="Search incidents..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ paddingLeft: '36px' }}
              />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 'auto', minWidth: '160px' }}>
              {statuses.map(s => (
                <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s}</option>
              ))}
            </select>
          </div>

          {/* Incident Cards */}
          <div className="grid gap-3">
            {filtered.map(inc => {
              const curStep = getIncidentCurrentStep(inc);
              return (
                <div key={inc.id} className="card cursor-pointer" onClick={() => navigate(`/incidents/${inc.id}`)}
                     style={{ transition: 'all 0.2s', borderLeft: `3px solid ${inc.status === 'RESOLVED' ? 'var(--success)' : inc.status === 'ESCALATED' ? 'var(--destructive)' : 'var(--warning)'}` }}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="font-medium mb-1">{inc.title}</div>
                        <div className="text-xs text-muted flex items-center gap-3">
                          <span className="font-mono">{inc.id.slice(0, 8)}</span>
                          <span className="flex items-center gap-1"><Clock size={10} />{new Date(inc.created_at).toLocaleString()}</span>
                          {inc.affected_services?.length > 0 && (
                            <span>{inc.affected_services.join(', ')}</span>
                          )}
                        </div>
                        {inc.probable_root_cause && (
                          <div className="text-xs mt-2 text-muted" style={{ maxWidth: '600px' }}>
                            🔍 {inc.probable_root_cause.slice(0, 120)}{inc.probable_root_cause.length > 120 ? '...' : ''}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`badge ${severityColor(inc.severity)}`}>{inc.severity}</span>
                        <span className={`badge ${statusColor(inc.status)}`}>{inc.status}</span>
                        {!['RESOLVED', 'ESCALATED', 'FAILED'].includes(inc.status) && (
                          <button className="btn btn-outline btn-xs" onClick={(e) => invokeAgent(inc.id, e)}
                                  style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>
                            <PlayCircle size={12} /> Investigate
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sequential Progress Bar & AI Step Summary */}
                    <div className="mt-3 pt-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="badge badge-info flex-shrink-0" style={{ fontSize: '0.62rem', fontWeight: 700 }}>
                            Step {curStep.step}/9 • {curStep.stage}
                          </span>
                          <span className="text-xs text-muted truncate" style={{ maxWidth: '460px' }}>
                            {curStep.summary}
                          </span>
                        </div>
                        <span className="text-xs text-muted font-mono flex-shrink-0" style={{ fontSize: '0.68rem' }}>
                          {Math.round((curStep.step / 9) * 100)}% Complete
                        </span>
                      </div>

                      {/* 9-segment sequential step progress bar */}
                      <div className="flex items-center gap-1">
                        {AGENT_STAGES.map((s, idx) => {
                          const isPast = idx < curStep.step - 1 || inc.status === 'RESOLVED';
                          const isCur = idx === curStep.step - 1 && inc.status !== 'RESOLVED' && inc.status !== 'ESCALATED';
                          return (
                            <div
                              key={s}
                              className="flex-1 rounded-sm transition-all"
                              style={{
                                height: '4px',
                                background: isPast
                                  ? 'var(--success)'
                                  : isCur
                                  ? 'var(--primary)'
                                  : 'rgba(255, 255, 255, 0.12)',
                                boxShadow: isCur ? '0 0 6px rgba(59, 130, 246, 0.6)' : 'none',
                              }}
                              title={`Step ${idx + 1}: ${s}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="empty-state">
                <AlertTriangle size={40} className="empty-icon" />
                <div>{incidents.length === 0 ? 'No incidents detected yet' : 'No matching incidents'}</div>
                <div className="text-xs text-muted">Inject a failure in the Simulation page to trigger an incident</div>
              </div>
            )}
          </div>
        </div>

        {/* Approval Queue */}
        <div>
          <ApprovalQueue />
        </div>
      </div>
    </div>
  );
};
