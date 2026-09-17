import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle, TrendingUp, Clock, Zap, ArrowUpRight } from 'lucide-react';
import { LiveTerminal } from '../components/LiveTerminal';
import type { AnalyticsOverview, SimulatedService, Incident, ReliabilityAnalytics } from '../types';
import { API_BASE } from '../types';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [reliability, setReliability] = useState<ReliabilityAnalytics | null>(null);
  const [services, setServices] = useState<Record<string, SimulatedService>>({});
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [ovRes, relRes, svcRes, incRes] = await Promise.all([
          fetch(`${API_BASE}/api/analytics/overview`),
          fetch(`${API_BASE}/api/analytics/reliability`),
          fetch(`${API_BASE}/api/simulation/services`),
          fetch(`${API_BASE}/api/incidents`),
        ]);
        if (ovRes.ok) setOverview(await ovRes.json());
        if (relRes.ok) setReliability(await relRes.json());
        if (svcRes.ok) setServices(await svcRes.json());
        if (incRes.ok) setIncidents(await incRes.json());
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      }
    };
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, []);

  const statCards = [
    { label: 'Total Incidents', value: overview?.total_incidents ?? '—', icon: Activity, color: 'var(--info)', bg: 'var(--info-bg)' },
    { label: 'Active', value: overview?.active_incidents ?? '—', icon: AlertTriangle, color: 'var(--warning)', bg: 'var(--warning-bg)' },
    { label: 'Resolved', value: overview?.resolved_incidents ?? '—', icon: CheckCircle, color: 'var(--success)', bg: 'var(--success-bg)' },
    { label: 'Automation Rate', value: reliability ? `${(reliability.automation_rate * 100).toFixed(0)}%` : '—', icon: TrendingUp, color: 'var(--primary)', bg: 'var(--primary-glow)' },
  ];

  const getHealthStatus = (svc: SimulatedService) => {
    if (!svc.healthy || svc.error_rate > 0.3) return 'red';
    if (svc.latency_ms > 400 || svc.error_rate > 0.05 || svc.cpu_percent > 80) return 'amber';
    return 'green';
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'RESOLVED': return 'badge-success';
      case 'ESCALATED': case 'FAILED': return 'badge-destructive';
      case 'AWAITING_APPROVAL': return 'badge-purple';
      default: return 'badge-warning';
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">Real-time system health and incident overview</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6 stagger-children">
        {statCards.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-icon" style={{ background: stat.bg }}>
              <stat.icon size={20} style={{ color: stat.color }} />
            </div>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value" style={{ color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Service Health Grid + Recent Incidents */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        {/* Service Health */}
        <div className="card lg:col-span-2">
          <div className="card-header flex items-center justify-between">
            <h3 className="card-title flex items-center gap-2">
              <Zap size={16} style={{ color: 'var(--info)' }} />
              Service Health
            </h3>
            <button className="btn btn-ghost btn-xs" onClick={() => navigate('/services')}>
              View All <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="card-content">
            <div className="grid grid-cols-5 gap-3">
              {Object.entries(services).map(([name, svc]) => {
                const status = getHealthStatus(svc);
                return (
                  <div key={name} className={`service-tile ${status === 'green' ? 'healthy' : status === 'amber' ? 'degraded' : 'unhealthy'}`}
                       onClick={() => navigate('/services')}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`health-dot ${status}`} />
                      <span className="text-xs font-semibold truncate">{name.replace('-service', '')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="metric-mini">
                        <span className="metric-mini-label">Latency</span>
                        <span className="metric-mini-value" style={{ color: svc.latency_ms > 400 ? 'var(--destructive)' : svc.latency_ms > 200 ? 'var(--warning)' : 'var(--success)', fontSize: '0.75rem' }}>
                          {svc.latency_ms.toFixed(0)}ms
                        </span>
                      </div>
                      <div className="metric-mini">
                        <span className="metric-mini-label">Error</span>
                        <span className="metric-mini-value" style={{ color: svc.error_rate > 0.1 ? 'var(--destructive)' : svc.error_rate > 0.03 ? 'var(--warning)' : 'var(--success)', fontSize: '0.75rem' }}>
                          {(svc.error_rate * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {Object.keys(services).length === 0 && (
                <div className="text-muted text-sm" style={{ gridColumn: 'span 5' }}>Loading services...</div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Incidents */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="card-title flex items-center gap-2">
              <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
              Recent Incidents
            </h3>
            <button className="btn btn-ghost btn-xs" onClick={() => navigate('/incidents')}>
              View All <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="card-content p-0">
            {incidents.slice(0, 8).map((inc) => (
              <div key={inc.id} className="flex items-center gap-3 px-4 py-3 border-b cursor-pointer"
                   style={{ borderColor: 'var(--border)' }}
                   onClick={() => navigate(`/incidents/${inc.id}`)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-sm font-medium truncate">{inc.title}</div>
                  <div className="text-xs text-muted mt-1 flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(inc.created_at).toLocaleTimeString()}
                  </div>
                  {inc.probable_root_cause && (
                    <div className="text-xs mt-2 text-muted truncate">
                      <span className="font-semibold text-primary">AI Diagnosis:</span> {inc.probable_root_cause}
                    </div>
                  )}
                </div>
                <span className={`badge ${statusColor(inc.status)}`} style={{ fontSize: '0.6rem' }}>
                  {inc.status}
                </span>
              </div>
            ))}
            {incidents.length === 0 && (
              <div className="empty-state p-4">
                <span className="text-sm">No incidents yet</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Event Stream */}
      <div className="card">
        <LiveTerminal maxHeight="300px" />
      </div>
    </div>
  );
};
