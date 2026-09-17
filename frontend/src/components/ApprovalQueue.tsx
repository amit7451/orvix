import React, { useState, useEffect } from 'react';
import { ShieldCheck, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import type { Approval } from '../types';
import { API_BASE } from '../types';
import { useToast } from './Toast';

export const ApprovalQueue: React.FC = () => {
  const { addToast } = useToast();
  const [approvals, setApprovals] = useState<Approval[]>([]);

  useEffect(() => {
    const fetchApprovals = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/approvals?decision=PENDING`);
        if (res.ok) setApprovals(await res.json());
      } catch (err) { console.error(err); }
    };
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 3000);
    return () => clearInterval(interval);
  }, []);

  const decide = async (id: string, approved: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/api/approvals/${id}/${approved ? 'approve' : 'reject'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver: 'admin', reason: approved ? 'Approved by operator' : 'Rejected by operator' }),
      });
      if (res.ok) {
        addToast(approved ? 'success' : 'warning', `Action ${approved ? 'approved' : 'rejected'}`);
        setApprovals(prev => prev.filter(a => a.id !== id));
      }
    } catch {
      addToast('error', 'Failed to process decision');
    }
  };

  const riskColor = (risk: string) => {
    switch (risk?.toUpperCase()) {
      case 'HIGH': return 'badge-destructive';
      case 'MEDIUM': return 'badge-warning';
      default: return 'badge-success';
    }
  };

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h3 className="card-title flex items-center gap-2">
          <ShieldCheck size={16} style={{ color: 'var(--purple)' }} />
          Approval Queue
        </h3>
        {approvals.length > 0 && (
          <span className="badge badge-purple">{approvals.length} pending</span>
        )}
      </div>
      <div className="card-content p-0">
        {approvals.length > 0 ? approvals.map(approval => (
          <div key={approval.id} className="p-4 border-b" style={{ borderColor: 'var(--border)', animation: 'slideUp 0.3s ease' }}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
              <span className="font-semibold text-sm">
                {approval.requested_action?.tool || approval.action_id}
              </span>
              <span className={`badge ${riskColor(approval.risk_level)}`} style={{ fontSize: '0.6rem' }}>
                {approval.risk_level} risk
              </span>
            </div>

            <div className="text-xs text-muted mb-1">
              Target: <span className="text-primary">{approval.requested_action?.target || '—'}</span>
            </div>

            {approval.requested_action?.reason && (
              <div className="text-xs text-muted mb-2">
                {approval.requested_action.reason}
              </div>
            )}

            <div className="text-xs text-muted flex items-center gap-1 mb-3">
              <Clock size={10} />
              {approval.expires_at && `Expires: ${new Date(approval.expires_at).toLocaleTimeString()}`}
            </div>

            <div className="flex gap-2">
              <button className="btn btn-success btn-sm flex-1" onClick={() => decide(approval.id, true)}>
                <CheckCircle size={12} /> Approve
              </button>
              <button className="btn btn-destructive btn-sm flex-1" onClick={() => decide(approval.id, false)}>
                <XCircle size={12} /> Reject
              </button>
            </div>
          </div>
        )) : (
          <div className="empty-state p-6">
            <ShieldCheck size={28} className="empty-icon" />
            <div className="text-sm">No pending approvals</div>
            <div className="text-xs text-muted">Actions requiring human authorization will appear here</div>
          </div>
        )}
      </div>
    </div>
  );
};
