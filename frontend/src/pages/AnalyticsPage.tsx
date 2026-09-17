import React, { useState, useEffect } from 'react';
import { BarChart3, Clock, ShieldCheck, AlertTriangle, CheckCircle } from 'lucide-react';
import type { AnalyticsOverview, IncidentAnalytics, ReliabilityAnalytics } from '../types';
import { API_BASE } from '../types';

export const AnalyticsPage: React.FC = () => {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [incidentStats, setIncidentStats] = useState<IncidentAnalytics | null>(null);
  const [reliability, setReliability] = useState<ReliabilityAnalytics | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [ovRes, incRes, relRes] = await Promise.all([
          fetch(`${API_BASE}/api/analytics/overview`),
          fetch(`${API_BASE}/api/analytics/incidents`),
          fetch(`${API_BASE}/api/analytics/reliability`),
        ]);
        if (ovRes.ok) setOverview(await ovRes.json());
        if (incRes.ok) setIncidentStats(await incRes.json());
        if (relRes.ok) setReliability(await relRes.json());
      } catch (err) { console.error(err); }
    };
    fetchAll();
  }, []);

  const formatDuration = (seconds: number | null) => {
    if (seconds == null) return '—';
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    return `${(seconds / 60).toFixed(1)}m`;
  };

  const ProgressRing: React.FC<{ value: number; max: number; color: string; label: string }> = ({ value, max, color, label }) => {
    const pct = max > 0 ? Math.min(value / max, 1) : 0;
    const radius = 28;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - pct);
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="progress-ring">
          <svg width="64" height="64">
            <circle className="progress-ring-bg" cx="32" cy="32" r={radius} />
            <circle className="progress-ring-fill" cx="32" cy="32" r={radius}
                    stroke={color}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset} />
          </svg>
          <div className="progress-ring-text" style={{ color }}>{(pct * 100).toFixed(0)}%</div>
        </div>
        <span className="text-xs text-muted">{label}</span>
      </div>
    );
  };

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1>Analytics</h1>
          <p className="page-subtitle">Platform performance metrics and reliability insights</p>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6 stagger-children">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--info-bg)' }}>
            <BarChart3 size={20} style={{ color: 'var(--info)' }} />
          </div>
          <div className="stat-label">Total Incidents</div>
          <div className="stat-value" style={{ color: 'var(--info)' }}>{overview?.total_incidents ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--warning-bg)' }}>
            <AlertTriangle size={20} style={{ color: 'var(--warning)' }} />
          </div>
          <div className="stat-label">Active</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{overview?.active_incidents ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--success-bg)' }}>
            <CheckCircle size={20} style={{ color: 'var(--success)' }} />
          </div>
          <div className="stat-label">Resolved</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{overview?.resolved_incidents ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--destructive-bg)' }}>
            <AlertTriangle size={20} style={{ color: 'var(--destructive)' }} />
          </div>
          <div className="stat-label">Escalated</div>
          <div className="stat-value" style={{ color: 'var(--destructive)' }}>{overview?.escalated_incidents ?? '—'}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        {/* MTTR & Incident Analytics */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title flex items-center gap-2">
              <Clock size={16} style={{ color: 'var(--info)' }} /> Incident Performance
            </h3>
          </div>
          <div className="card-content">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-xs font-medium text-muted uppercase tracking-wide mb-1">Mean Time to Resolve</div>
                <div className="text-3xl font-bold" style={{ color: 'var(--primary)' }}>
                  {formatDuration(incidentStats?.mttr_seconds_avg ?? null)}
                </div>
                <div className="text-xs text-muted mt-1">
                  Based on {incidentStats?.sample_size ?? 0} resolved incidents
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted uppercase tracking-wide mb-1">Avg Diagnosis Confidence</div>
                <div className="text-3xl font-bold" style={{ color: 'var(--success)' }}>
                  {incidentStats?.diagnosis_confidence_avg != null ? `${(incidentStats.diagnosis_confidence_avg * 100).toFixed(0)}%` : '—'}
                </div>
                <div className="text-xs text-muted mt-1">AI root cause accuracy</div>
              </div>
            </div>

            {incidentStats?.resolved_by_severity && Object.keys(incidentStats.resolved_by_severity).length > 0 && (
              <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Resolved by Severity</div>
                <div className="grid gap-2">
                  {Object.entries(incidentStats.resolved_by_severity).map(([severity, count]) => {
                    const total = Object.values(incidentStats.resolved_by_severity).reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    const color = severity === 'CRITICAL' ? 'var(--destructive)' : severity === 'HIGH' ? '#f97316' : severity === 'MEDIUM' ? 'var(--warning)' : 'var(--success)';
                    return (
                      <div key={severity} className="flex items-center gap-3">
                        <span className="text-xs font-medium w-16">{severity}</span>
                        <div className="metric-bar flex-1">
                          <div className="metric-bar-fill" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <span className="text-xs font-mono w-8 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Reliability Analytics */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title flex items-center gap-2">
              <ShieldCheck size={16} style={{ color: 'var(--success)' }} /> Reliability Metrics
            </h3>
          </div>
          <div className="card-content">
            <div className="flex justify-around mb-6">
              <ProgressRing
                value={reliability ? (1 - reliability.tool_failure_rate) * 100 : 0}
                max={100}
                color="var(--success)"
                label="Tool Success"
              />
              <ProgressRing
                value={reliability ? reliability.automation_rate * 100 : 0}
                max={100}
                color="var(--primary)"
                label="Automation"
              />
              <ProgressRing
                value={reliability ? (1 - reliability.verification_failure_rate) * 100 : 0}
                max={100}
                color="var(--info)"
                label="Verification"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded border" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs text-muted mb-1">Total Tool Calls</div>
                <div className="text-xl font-bold">{reliability?.total_tool_calls ?? '—'}</div>
              </div>
              <div className="p-3 rounded border" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs text-muted mb-1">Total Verifications</div>
                <div className="text-xl font-bold">{reliability?.total_verifications ?? '—'}</div>
              </div>
              <div className="p-3 rounded border" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs text-muted mb-1">Tool Failure Rate</div>
                <div className="text-xl font-bold" style={{ color: (reliability?.tool_failure_rate ?? 0) > 0.1 ? 'var(--destructive)' : 'var(--success)' }}>
                  {reliability ? `${(reliability.tool_failure_rate * 100).toFixed(1)}%` : '—'}
                </div>
              </div>
              <div className="p-3 rounded border" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs text-muted mb-1">Automation Rate</div>
                <div className="text-xl font-bold" style={{ color: 'var(--primary)' }}>
                  {reliability ? `${(reliability.automation_rate * 100).toFixed(1)}%` : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
