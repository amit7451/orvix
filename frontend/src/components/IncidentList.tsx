import React, { useState, useEffect } from 'react';
import { Activity, ChevronDown, ChevronUp, Clock, PlayCircle } from 'lucide-react';
import type { Incident, IncidentEvent } from '../types';

export const IncidentList: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<Record<string, IncidentEvent[]>>({});

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/incidents');
        const data = await res.json();
        setIncidents(data);
      } catch (err) {
        console.error('Error fetching incidents:', err);
      }
    };
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!timelines[id]) {
      try {
        const res = await fetch(`http://localhost:8000/api/incidents/${id}/events`);
        if (res.ok) {
          const data = await res.json();
          setTimelines(prev => ({...prev, [id]: data}));
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const invokeAgent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`http://localhost:8000/api/agent/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: id })
      });
      alert('AI Agent invoked to investigate this incident.');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="card h-full">
      <div className="card-header flex items-center justify-between">
        <h2 className="card-title flex items-center gap-2">
          <Activity size={20} className="text-muted" />
          Recent Incidents
        </h2>
      </div>
      <div className="card-content" style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
        <div className="grid gap-4">
          {incidents.map(inc => (
            <div key={inc.id} className="p-4 border rounded bg-white shadow-sm" style={{ borderColor: 'var(--border)'}}>
              <div 
                className="flex justify-between items-center cursor-pointer"
                onClick={() => handleExpand(inc.id)}
              >
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {inc.title || 'Untitled Incident'}
                    {inc.status !== 'RESOLVED' && (
                      <button 
                        className="btn btn-outline" 
                        style={{ padding: '0.1rem 0.3rem', fontSize: '0.7rem', borderColor: 'var(--primary)', color: 'var(--primary)' }}
                        onClick={(e) => invokeAgent(inc.id, e)}
                        title="Manually Invoke AI Agent"
                      >
                        <PlayCircle size={12} className="inline mr-1" /> Invoke Agent
                      </button>
                    )}
                  </div>
                  <div className="text-sm text-muted">ID: {inc.id.split('-')[0]}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`badge ${inc.status === 'RESOLVED' ? 'badge-success' : inc.status === 'AWAITING_APPROVAL' ? 'badge-destructive' : 'badge-warning'}`}>
                    {inc.status}
                  </span>
                  {expandedId === inc.id ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
                </div>
              </div>
              
              {expandedId === inc.id && (
                <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  {inc.probable_root_cause && (
                    <div className="mb-4">
                      <div className="font-medium text-sm mb-1">Probable Root Cause</div>
                      <div className="text-sm text-muted p-3 rounded" style={{ backgroundColor: 'var(--muted)' }}>
                        {inc.probable_root_cause}
                      </div>
                    </div>
                  )}
                  {inc.remediation_plan && (
                    <div className="mb-4">
                      <div className="font-medium text-sm mb-1">Suggested Fixes</div>
                      <pre className="text-xs p-3 rounded overflow-x-auto border" style={{ backgroundColor: '#f8fafc', borderColor: 'var(--border)' }}>
                        {JSON.stringify(inc.remediation_plan, null, 2)}
                      </pre>
                    </div>
                  )}
                  {inc.evidence && Object.keys(inc.evidence).length > 0 && (
                    <div className="mb-4">
                      <div className="font-medium text-sm mb-1">Retrieval Context & Evidence</div>
                      <pre className="text-xs p-3 rounded overflow-x-auto border" style={{ backgroundColor: '#f8fafc', borderColor: 'var(--border)' }}>
                        {JSON.stringify(inc.evidence, null, 2)}
                      </pre>
                    </div>
                  )}

                  {timelines[inc.id] && (
                    <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                      <div className="font-medium text-sm mb-2 flex items-center gap-1"><Clock size={14}/> Investigation Timeline</div>
                      <div className="pl-2 border-l-2" style={{ borderColor: 'var(--border)' }}>
                        {timelines[inc.id].map((evt, i) => (
                          <div key={i} className="mb-3 relative pl-4">
                            <div className="absolute w-2 h-2 rounded-full bg-slate-300" style={{ left: '-5px', top: '5px' }}></div>
                            <div className="text-xs text-muted mb-1">{new Date(evt.created_at).toLocaleTimeString()} - <span className="font-medium uppercase">{evt.stage}</span></div>
                            <div className="text-sm">{evt.message}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {incidents.length === 0 && <div className="text-muted">No incidents found.</div>}
        </div>
      </div>
    </div>
  );
};
