import React, { useState, useEffect } from 'react';
import { Server } from 'lucide-react';
import type { Service } from '../types';

export const ServiceList: React.FC = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [failureType, setFailureType] = useState<string>('latency');
  const [severity, setSeverity] = useState<number>(0.8);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/services');
        const data = await res.json();
        setServices(Array.isArray(data) ? data : Object.values(data));
      } catch (err) {
        console.error('Error fetching services:', err);
      }
    };
    fetchServices();
    const interval = setInterval(fetchServices, 5000);
    return () => clearInterval(interval);
  }, []);

  const simulateFailure = async (serviceName: string) => {
    try {
      await fetch(`http://localhost:8000/api/simulation/failures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: serviceName,
          kind: failureType,
          severity: severity
        })
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="card h-full">
      <div className="card-header flex items-center justify-between">
        <h2 className="card-title flex items-center gap-2">
          <Server size={20} className="text-muted" />
          Active Services
        </h2>
      </div>
      <div className="card-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="mb-4 flex gap-2 items-center bg-slate-50 p-3 rounded border">
          <span className="text-sm font-medium">Chaos Toolkit:</span>
          <select 
            className="text-sm p-1 border rounded"
            value={failureType}
            onChange={(e) => setFailureType(e.target.value)}
          >
            <option value="latency">Latency Injection</option>
            <option value="database">Database Disconnect</option>
            <option value="service_down">Service Crash</option>
            <option value="queue">Queue Backup</option>
          </select>
          <input 
            type="range" 
            min="0.1" max="1.0" step="0.1" 
            value={severity}
            onChange={(e) => setSeverity(parseFloat(e.target.value))}
            className="w-24"
          />
          <span className="text-xs text-muted">Sev: {severity}</span>
        </div>

        <div className="grid gap-4 flex-1" style={{ overflowY: 'auto' }}>
          {services.map(svc => (
            <div key={svc.name} className="flex items-center justify-between p-4 border rounded bg-white shadow-sm" style={{ borderColor: 'var(--border)'}}>
              <div>
                <div className="font-medium">{svc.name}</div>
                <div className="text-sm text-muted">Tier: {svc.tier} | Owner: {svc.owner_team}</div>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  className="btn btn-outline"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: '#d97706', color: '#d97706' }}
                  onClick={() => simulateFailure(svc.name)}
                >
                  Inject Failure
                </button>
              </div>
            </div>
          ))}
          {services.length === 0 && <div className="text-muted">No services found.</div>}
        </div>
      </div>
    </div>
  );
};
