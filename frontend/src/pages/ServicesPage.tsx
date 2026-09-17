import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, Activity, Gauge, ArrowRight, Search, ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react';
import type { SimulatedService, Service } from '../types';
import { API_BASE } from '../types';

export const ServicesPage: React.FC = () => {
  const navigate = useNavigate();
  const [simServices, setSimServices] = useState<Record<string, SimulatedService>>({});
  const [dbServices, setDbServices] = useState<Service[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [simRes, dbRes] = await Promise.all([
          fetch(`${API_BASE}/api/simulation/services`),
          fetch(`${API_BASE}/api/services`),
        ]);
        if (simRes.ok) setSimServices(await simRes.json());
        if (dbRes.ok) setDbServices(await dbRes.json());
      } catch (err) { console.error(err); }
    };
    fetchAll();
    const interval = setInterval(fetchAll, 3000);
    return () => clearInterval(interval);
  }, []);

  const getHealthStatus = (svc: SimulatedService) => {
    if (!svc.healthy || svc.error_rate > 0.3) return 'unhealthy';
    if (svc.latency_ms > 400 || svc.error_rate > 0.05 || svc.cpu_percent > 80) return 'degraded';
    return 'healthy';
  };

  const MetricBar: React.FC<{ value: number; max: number; label: string; unit?: string; thresholds?: [number, number] }> = 
    ({ value, max, label, unit = '', thresholds = [60, 85] }) => {
    const pct = Math.min((value / max) * 100, 100);
    const level = pct > thresholds[1] ? 'critical' : pct > thresholds[0] ? 'warn' : 'good';
    return (
      <div className="metric-mini">
        <div className="flex items-center justify-between">
          <span className="metric-mini-label">{label}</span>
          <span className="metric-mini-value" style={{ fontSize: '0.8rem' }}>{typeof value === 'number' ? value.toFixed(value < 1 ? 2 : 0) : value}{unit}</span>
        </div>
        <div className="metric-bar">
          <div className={`metric-bar-fill ${level}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  const serviceEntries = Object.entries(simServices);
  const healthyCount = serviceEntries.filter(([, s]) => getHealthStatus(s) === 'healthy').length;
  const degradedCount = serviceEntries.filter(([, s]) => getHealthStatus(s) === 'degraded').length;
  const unhealthyCount = serviceEntries.filter(([, s]) => getHealthStatus(s) === 'unhealthy').length;

  const filteredServices = serviceEntries.filter(([name]) => 
    name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-fadeIn">
      <div className="page-header flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1>Services</h1>
          <p className="page-subtitle">Live infrastructure telemetry for all monitored microservices • Click any service for detailed stats, graphs & failure reports</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search services..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg border text-sm bg-card"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>
        </div>
      </div>

      {/* Quick Summary Chips */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="px-3 py-1.5 rounded-lg border bg-card flex items-center gap-2 text-xs font-medium" style={{ borderColor: 'var(--border)' }}>
          <Server size={14} style={{ color: 'var(--primary)' }} />
          <span>Total: <strong>{serviceEntries.length}</strong></span>
        </div>
        <div className="px-3 py-1.5 rounded-lg border bg-card flex items-center gap-2 text-xs font-medium" style={{ borderColor: 'rgba(34, 197, 94, 0.3)', color: 'var(--success)' }}>
          <CheckCircle size={14} />
          <span>Healthy: <strong>{healthyCount}</strong></span>
        </div>
        {degradedCount > 0 && (
          <div className="px-3 py-1.5 rounded-lg border bg-card flex items-center gap-2 text-xs font-medium" style={{ borderColor: 'rgba(245, 158, 11, 0.3)', color: 'var(--warning)' }}>
            <AlertTriangle size={14} />
            <span>Degraded: <strong>{degradedCount}</strong></span>
          </div>
        )}
        {unhealthyCount > 0 && (
          <div className="px-3 py-1.5 rounded-lg border bg-card flex items-center gap-2 text-xs font-medium" style={{ borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--destructive)' }}>
            <ShieldAlert size={14} />
            <span>Unhealthy: <strong>{unhealthyCount}</strong></span>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
        {filteredServices.map(([name, svc]) => {
          const status = getHealthStatus(svc);
          const dbSvc = dbServices.find(s => s.name === name);
          return (
            <div
              key={name}
              className={`card service-tile ${status} group cursor-pointer transition-all hover:scale-[1.01] hover:shadow-lg`}
              style={{ position: 'relative' }}
              onClick={() => navigate(`/services/${name}`)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && navigate(`/services/${name}`)}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Server size={18} style={{ color: 'var(--primary)' }} />
                  <div>
                    <div className="font-semibold text-base group-hover:text-primary transition-colors flex items-center gap-1.5">
                      {name}
                      <span className="text-xs text-muted opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                    </div>
                    <div className="text-xs text-muted">
                      {dbSvc?.tier?.toUpperCase() || (name.includes('payment') || name.includes('auth') ? 'TIER-1' : 'STANDARD')} • {dbSvc?.owner_team || 'platform'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`health-dot ${status === 'healthy' ? 'green' : status === 'degraded' ? 'amber' : 'red'}`} />
                  <span className={`badge ${status === 'healthy' ? 'badge-success' : status === 'degraded' ? 'badge-warning' : 'badge-destructive'}`}>
                    {status === 'healthy' ? 'Healthy' : status === 'degraded' ? 'Degraded' : 'Unhealthy'}
                  </span>
                </div>
              </div>

              {svc.active_failures.length > 0 && (
                <div className="flex gap-1 mb-3 flex-wrap">
                  {svc.active_failures.map((f, i) => (
                    <span key={i} className="badge badge-destructive flex items-center gap-1" style={{ fontSize: '0.65rem' }}>
                      ⚡ Active Failure: {f}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <MetricBar value={svc.latency_ms} max={2000} label="Latency" unit="ms" thresholds={[300, 800]} />
                <MetricBar value={svc.error_rate * 100} max={100} label="Error Rate" unit="%" thresholds={[3, 10]} />
                <MetricBar value={svc.cpu_percent} max={100} label="CPU" unit="%" />
                <MetricBar value={svc.memory_percent} max={100} label="Memory" unit="%" />
                <MetricBar value={svc.queue_depth} max={500} label="Queue" thresholds={[100, 300]} />
                <MetricBar value={svc.db_connections_used} max={svc.db_connections_max} label="DB Conns" unit={`/${svc.db_connections_max}`} thresholds={[70, 90]} />
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs text-muted flex items-center gap-1">
                  <Gauge size={12} /> {svc.throughput_rps.toFixed(0)} rps
                </div>
                <div className="text-xs font-semibold flex items-center gap-1 text-primary group-hover:translate-x-0.5 transition-transform" style={{ color: 'var(--primary)' }}>
                  View Detail & Graphs <ArrowRight size={13} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {serviceEntries.length === 0 && (
        <div className="empty-state">
          <Activity size={40} className="empty-icon" />
          <div>No services found. Start the backend to see live data.</div>
        </div>
      )}

      {serviceEntries.length > 0 && filteredServices.length === 0 && (
        <div className="empty-state">
          <Search size={32} className="empty-icon text-muted" />
          <div>No services matching &quot;{searchTerm}&quot;</div>
        </div>
      )}
    </div>
  );
};
