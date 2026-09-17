import React, { useState, useEffect } from 'react';
import { Wrench, ShieldAlert } from 'lucide-react';
import type { Tool } from '../types';
import { API_BASE } from '../types';

export const ToolsPage: React.FC = () => {
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/tools`)
      .then(res => res.json())
      .then(setTools)
      .catch(console.error);
  }, []);

  const riskColor = (risk: string) => {
    switch (risk.toUpperCase()) {
      case 'HIGH': return 'badge-destructive';
      case 'MEDIUM': return 'badge-warning';
      default: return 'badge-success';
    }
  };

  const riskBorder = (risk: string) => {
    switch (risk.toUpperCase()) {
      case 'HIGH': return 'var(--destructive)';
      case 'MEDIUM': return 'var(--warning)';
      default: return 'var(--success)';
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1>Tool Registry</h1>
          <p className="page-subtitle">All available remediation and observability tools the AI agent can invoke</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
        {tools.map(tool => (
          <div key={tool.name} className="card" style={{ borderLeft: `3px solid ${riskBorder(tool.risk_level)}` }}>
            <div className="card-content">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Wrench size={16} style={{ color: 'var(--muted-foreground)' }} />
                  <span className="font-semibold font-mono text-sm">{tool.name}</span>
                </div>
                <span className={`badge ${riskColor(tool.risk_level)}`}>
                  <ShieldAlert size={10} className="mr-1" />{tool.risk_level}
                </span>
              </div>
              <p className="text-sm text-muted mb-3">{tool.description}</p>
              <div>
                <div className="text-xs font-medium text-muted mb-1 uppercase tracking-wide">Input Schema</div>
                <pre style={{ maxHeight: '120px', fontSize: '0.72rem' }}>
                  {JSON.stringify(tool.input_schema, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        ))}
      </div>

      {tools.length === 0 && (
        <div className="empty-state">
          <Wrench size={40} className="empty-icon" />
          <div>No tools loaded</div>
        </div>
      )}
    </div>
  );
};
