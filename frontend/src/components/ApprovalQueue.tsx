import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { Approval, Incident } from '../types';

export const ApprovalQueue: React.FC = () => {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [incidentContexts, setIncidentContexts] = useState<Record<string, Incident>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchApprovals = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/approvals');
        const data = await res.json();
        const pending = data.filter((a: Approval) => a.decision === 'PENDING');
        setApprovals(pending);
        
        // Fetch incident context for any new approvals
        pending.forEach((app: Approval) => {
          if (!incidentContexts[app.incident_id]) {
            fetchIncident(app.incident_id);
          }
        });
      } catch (err) {
        console.error('Error fetching approvals', err);
      }
    };
    
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 3000);
    return () => clearInterval(interval);
  }, [incidentContexts]);

  const fetchIncident = async (incidentId: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/incidents/${incidentId}`);
      if (res.ok) {
        const data = await res.json();
        setIncidentContexts(prev => ({...prev, [incidentId]: data}));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleApproval = async (id: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`http://localhost:8000/api/approvals/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver: 'admin-user', reason: 'Approved via UI' })
      });
      if (res.ok) {
        setApprovals(prev => prev.filter(a => a.id !== id));
      } else {
        console.error('Failed to update approval:', await res.text());
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="card h-full">
      <div className="card-header flex items-center justify-between">
        <h2 className="card-title flex items-center gap-2">
          <ShieldAlert size={20} className="text-destructive" />
          Action Approvals
        </h2>
        {approvals.length > 0 && (
          <span className="badge badge-destructive">{approvals.length} pending</span>
        )}
      </div>
      <div className="card-content" style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
        <div className="grid gap-4">
          {approvals.map(approval => {
            const incident = incidentContexts[approval.incident_id];
            
            return (
              <div key={approval.id} className="p-4 border rounded bg-white shadow-sm" style={{ borderColor: 'var(--border)'}}>
                <div className="flex justify-between items-center mb-2">
                  <div className="font-medium">
                    Tool: {approval.requested_action?.tool || 'Unknown'}
                  </div>
                  <button 
                    className="btn btn-outline"
                    style={{ padding: '0.25rem' }}
                    onClick={() => setExpandedId(expandedId === approval.id ? null : approval.id)}
                  >
                    {expandedId === approval.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
                
                <div className="text-sm mb-4" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  Args: {JSON.stringify(approval.requested_action?.arguments || {})}
                </div>
                
                {expandedId === approval.id && incident && (
                  <div className="mt-4 mb-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <div className="font-medium text-sm mb-2 text-primary">Incident Context: {incident.title}</div>
                    
                    {incident.remediation_plan && (
                      <div className="mb-3">
                        <div className="text-xs text-muted mb-1">Suggested Fix Reasoning</div>
                        <pre className="text-xs p-2 bg-slate-50 rounded border overflow-x-auto" style={{ borderColor: 'var(--border)'}}>
                          {JSON.stringify(incident.remediation_plan, null, 2)}
                        </pre>
                      </div>
                    )}
                    
                    {incident.evidence && (
                      <div className="mb-3">
                        <div className="text-xs text-muted mb-1">Retrieval Context (RAG Evidence)</div>
                        <pre className="text-xs p-2 bg-slate-50 rounded border overflow-x-auto" style={{ borderColor: 'var(--border)'}}>
                          {JSON.stringify(incident.evidence, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <button 
                    className="btn btn-success flex-1"
                    onClick={() => handleApproval(approval.id, 'approve')}
                  >
                    <CheckCircle size={16} /> Approve
                  </button>
                  <button 
                    className="btn btn-destructive flex-1"
                    onClick={() => handleApproval(approval.id, 'reject')}
                  >
                    <XCircle size={16} /> Reject
                  </button>
                </div>
              </div>
            );
          })}
          {approvals.length === 0 && (
            <div className="text-center p-6 text-muted border border-dashed rounded" style={{ borderColor: 'var(--border)'}}>
              No pending actions requiring authorization.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
