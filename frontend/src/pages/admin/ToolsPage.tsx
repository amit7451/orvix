import React, { useState, useEffect } from 'react';
import type { Tool } from '../../types';

export const ToolsPage: React.FC = () => {
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    fetch('http://localhost:8000/api/tools')
      .then(res => res.json())
      .then(setTools)
      .catch(console.error);
  }, []);

  return (
    <div>
      <h1 className="mb-6">Tool Registry</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {tools.map(tool => (
          <div key={tool.name} className="card">
            <div className="card-header pb-2">
              <h2 className="card-title text-lg">{tool.name}</h2>
              <span className={`badge ${tool.risk_level === 'high' ? 'badge-destructive' : 'badge-warning'}`}>
                {tool.risk_level} risk
              </span>
            </div>
            <div className="card-content">
              <p className="text-sm text-muted mb-4">{tool.description}</p>
              <div className="text-xs font-medium mb-1">Input Schema</div>
              <pre className="text-xs p-2 bg-slate-50 rounded border overflow-x-auto">
                {JSON.stringify(tool.input_schema, null, 2)}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
