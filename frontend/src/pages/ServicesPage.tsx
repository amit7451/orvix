import React, { useState, useEffect } from 'react';
import { Server, Activity, Gauge } from 'lucide-react';
import type { SimulatedService, Service } from '../types';
import { API_BASE } from '../types';

export const ServicesPage: React.FC = () => {
  const [simServices, setSimServices] = useState<Record<string, SimulatedService>>({});
  const [dbServices, setDbServices] = useState<Service[]>([]);

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

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1>Services</h1>
          <p className="page-subtitle">Live infrastructure telemetry for all monitored services</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
        {Object.entries(simServices).map(([name, svc]) => {
          const status = getHealthStatus(svc);
          const dbSvc = dbServices.find(s => s.name === name);
          return (
            <div key={name} className={`card service-tile ${status}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Server size={18} style={{ color: 'var(--muted-foreground)' }} />
                  <div>
                    <div className="font-semibold">{name}</div>
                    <div className="text-xs text-muted">
                      {dbSvc?.tier?.toUpperCase() || 'STANDARD'} • {dbSvc?.owner_team || 'platform'}
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
                    <span key={i} className="badge badge-destructive" style={{ fontSize: '0.6rem' }}>⚡ {f}</span>
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
              </div>
            </div>
          );
        })}
      </div>

      {Object.keys(simServices).length === 0 && (
        <div className="empty-state">
          <Activity size={40} className="empty-icon" />
          <div>No services found. Start the backend to see live data.</div>
        </div>
      )}
    </div>
  );
};
