import React, { useState, useEffect } from 'react';
import { Zap, RotateCcw, Server } from 'lucide-react';
import { LiveTerminal } from '../components/LiveTerminal';
import type { SimulatedService } from '../types';
import { API_BASE } from '../types';
import { useToast } from '../components/Toast';

const FAILURE_TYPES = [
  { value: 'latency', label: 'Latency Spike', desc: 'Increases response time by up to 900ms' },
  { value: 'database', label: 'Database Pool Exhaustion', desc: 'Saturates DB connection pool' },
  { value: 'service_down', label: 'Service Crash', desc: 'Takes the service completely offline' },
  { value: 'queue', label: 'Queue Backlog', desc: 'Causes message queue to back up' },
  { value: 'error_rate', label: 'Error Rate Spike', desc: 'Increases HTTP 5xx error rate' },
  { value: 'cpu', label: 'CPU Pressure', desc: 'Simulates CPU saturation' },
  { value: 'memory', label: 'Memory Pressure', desc: 'Simulates memory leak / OOM risk' },
];

export const SimulationPage: React.FC = () => {
  const { addToast } = useToast();
  const [services, setServices] = useState<Record<string, SimulatedService>>({});
  const [selectedService, setSelectedService] = useState('payment-service');
  const [failureType, setFailureType] = useState('latency');
  const [severity, setSeverity] = useState(0.7);
  const [injecting, setInjecting] = useState(false);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/simulation/services`);
        if (res.ok) setServices(await res.json());
      } catch (err) { console.error(err); }
    };
    fetchServices();
    const interval = setInterval(fetchServices, 2000);
    return () => clearInterval(interval);
  }, []);

  const injectFailure = async () => {
    setInjecting(true);
    try {
      const res = await fetch(`${API_BASE}/api/simulation/failures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: selectedService, kind: failureType, severity }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.incident_id) {
          addToast('warning', `⚡ Injected ${failureType} on ${selectedService} — Incident #${data.incident_id.slice(0, 8)} created!`);
        } else {
          addToast('warning', `Injected ${failureType} failure on ${selectedService} (severity: ${severity})`);
        }
      } else {
        addToast('error', 'Failed to inject failure');
      }
    } catch {
      addToast('error', 'Failed to inject failure');
    }
    setInjecting(false);
  };

  const resetSimulation = async (service?: string) => {
    try {
      await fetch(`${API_BASE}/api/simulation/reset${service ? `?service=${service}` : ''}`, { method: 'POST' });
      addToast('success', service ? `Reset ${service}` : 'All failures cleared');
    } catch {
      addToast('error', 'Failed to reset simulation');
    }
  };

  const getHealthColor = (svc: SimulatedService) => {
    if (!svc.healthy || svc.error_rate > 0.3) return 'red';
    if (svc.latency_ms > 400 || svc.error_rate > 0.05 || svc.cpu_percent > 80) return 'amber';
    return 'green';
  };

  const selectedFailure = FAILURE_TYPES.find(f => f.value === failureType);

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1>Chaos Simulation</h1>
          <p className="page-subtitle">Inject failures into the simulated backend and watch ORVIX detect and respond autonomously</p>
        </div>
        <button className="btn btn-outline" style={{ borderColor: 'var(--destructive)', color: 'var(--destructive)' }} onClick={() => resetSimulation()}>
          <RotateCcw size={14} /> Reset All
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        {/* Chaos Injection Panel */}
        <div className="chaos-panel">
          <div className="chaos-title">
            <Zap size={16} /> Failure Injection
          </div>

          <div className="mb-4">
            <label className="text-xs font-medium text-muted mb-1 block uppercase tracking-wide">Target Service</label>
            <select value={selectedService} onChange={(e) => setSelectedService(e.target.value)}>
              {Object.keys(services).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="text-xs font-medium text-muted mb-1 block uppercase tracking-wide">Failure Type</label>
            <select value={failureType} onChange={(e) => setFailureType(e.target.value)}>
              {FAILURE_TYPES.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            {selectedFailure && (
              <div className="text-xs text-muted mt-1">{selectedFailure.desc}</div>
            )}
          </div>

          <div className="mb-4">
            <label className="text-xs font-medium text-muted mb-1 block uppercase tracking-wide">
              Severity: <span className="font-mono text-foreground">{severity.toFixed(1)}</span>
            </label>
            <input type="range" min="0.1" max="1.0" step="0.1" value={severity}
                   onChange={(e) => setSeverity(parseFloat(e.target.value))} />
            <div className="flex justify-between text-xs text-muted mt-1">
              <span>Low</span><span>High</span>
            </div>
          </div>

          <button className="btn btn-warning w-full" onClick={injectFailure} disabled={injecting}>
            <Zap size={14} /> {injecting ? 'Injecting...' : 'Inject Failure'}
          </button>
        </div>

        {/* Service Status Grid */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(services).map(([name, svc]) => {
              const health = getHealthColor(svc);
              return (
                <div key={name} className={`service-tile ${health === 'green' ? 'healthy' : health === 'amber' ? 'degraded' : 'unhealthy'}`}
                     onClick={() => setSelectedService(name)}
                     style={{ cursor: 'pointer', outline: selectedService === name ? '2px solid var(--primary)' : 'none', outlineOffset: '-2px' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Server size={16} style={{ color: 'var(--muted-foreground)' }} />
                      <span className="font-semibold text-sm">{name}</span>
                    </div>
                    <div className={`health-dot ${health}`} />
                  </div>

                  {svc.active_failures.length > 0 && (
                    <div className="flex gap-1 mb-2 flex-wrap">
                      {svc.active_failures.map((f, i) => (
                        <span key={i} className="badge badge-destructive" style={{ fontSize: '0.55rem' }}>⚡{f}</span>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted">Latency</div>
                      <div className="font-mono font-semibold" style={{ color: svc.latency_ms > 400 ? 'var(--destructive)' : svc.latency_ms > 200 ? 'var(--warning)' : 'var(--success)' }}>
                        {svc.latency_ms.toFixed(0)}ms
                      </div>
                    </div>
                    <div>
                      <div className="text-muted">Error</div>
                      <div className="font-mono font-semibold" style={{ color: svc.error_rate > 0.1 ? 'var(--destructive)' : svc.error_rate > 0.03 ? 'var(--warning)' : 'var(--success)' }}>
                        {(svc.error_rate * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-muted">CPU</div>
                      <div className="font-mono font-semibold" style={{ color: svc.cpu_percent > 85 ? 'var(--destructive)' : svc.cpu_percent > 60 ? 'var(--warning)' : 'var(--success)' }}>
                        {svc.cpu_percent.toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  {svc.active_failures.length > 0 && (
                    <button className="btn btn-ghost btn-xs mt-2 w-full" onClick={(e) => { e.stopPropagation(); resetSimulation(name); }}>
                      <RotateCcw size={10} /> Clear
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live Event Stream */}
      <div className="card">
        <LiveTerminal maxHeight="350px" />
      </div>
    </div>
  );
};
