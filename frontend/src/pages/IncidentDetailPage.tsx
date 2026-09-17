import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, AlertTriangle, CheckCircle, XCircle, Search, FileText, Wrench, Shield, Eye, Brain, BookOpen, Target, GraduationCap } from 'lucide-react';
import type { Incident, IncidentEvent } from '../types';
import { API_BASE, AGENT_STAGES } from '../types';

const stageIcons: Record<string, React.ReactNode> = {
  OBSERVE: <Eye size={14} />,
  UNDERSTAND: <Brain size={14} />,
  RETRIEVE: <BookOpen size={14} />,
  REASON: <Search size={14} />,
  PLAN: <FileText size={14} />,
  AUTHORIZE: <Shield size={14} />,
  ACT: <Wrench size={14} />,
  VERIFY: <CheckCircle size={14} />,
  LEARN: <GraduationCap size={14} />,
};

export const IncidentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [timeline, setTimeline] = useState<IncidentEvent[]>([]);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        const [incRes, tlRes] = await Promise.all([
          fetch(`${API_BASE}/api/incidents/${id}`),
          fetch(`${API_BASE}/api/incidents/${id}/timeline`),
        ]);
        if (incRes.ok) setIncident(await incRes.json());
        if (tlRes.ok) setTimeline(await tlRes.json());
      } catch (err) { console.error(err); }
    };
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [id]);

  if (!incident) {
    return <div className="empty-state"><div>Loading incident...</div></div>;
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'RESOLVED': return 'badge-success';
      case 'ESCALATED': case 'FAILED': return 'badge-destructive';
      case 'AWAITING_APPROVAL': return 'badge-purple';
      default: return 'badge-warning';
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'badge-destructive';
      case 'HIGH': return 'badge-warning';
      case 'MEDIUM': return 'badge-info';
      default: return 'badge-muted';
    }
  };

  // Determine pipeline state from timeline events
  const completedStages = new Set(timeline.map(e => e.stage.toUpperCase()));
  const currentStage = incident.status === 'RESOLVED' ? 'DONE' : 
                       incident.status === 'ESCALATED' ? 'DONE' :
                       timeline.length > 0 ? timeline[timeline.length - 1].stage.toUpperCase() : 'DETECTED';

  const remPlan = incident.remediation_plan;
  const evidence = incident.evidence;

  return (
    <div className="animate-fadeIn">
      {/* Back Button + Header */}
      <div className="flex items-center gap-3 mb-4">
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/incidents')}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-3 mb-1">
            <h1 style={{ marginBottom: 0 }}>{incident.title}</h1>
            <span className={`badge ${severityColor(incident.severity)}`}>{incident.severity}</span>
            <span className={`badge ${statusColor(incident.status)}`}>{incident.status}</span>
          </div>
          <div className="text-xs text-muted flex items-center gap-4">
            <span className="font-mono">{incident.id.slice(0, 8)}</span>
            <span className="flex items-center gap-1"><Clock size={10} /> Detected: {new Date(incident.detected_at).toLocaleString()}</span>
            {incident.resolved_at && (
              <span className="flex items-center gap-1"><CheckCircle size={10} /> Resolved: {new Date(incident.resolved_at).toLocaleString()}</span>
            )}
            {incident.affected_services?.length > 0 && (
              <span>Services: {incident.affected_services.join(', ')}</span>
            )}
          </div>
        </div>
      </div>

      {/* Agent Pipeline Visualization */}
      <div className="card mb-4">
        <div className="pipeline-container">
          {AGENT_STAGES.map((stage, i) => {
            const isCompleted = completedStages.has(stage) || 
              (incident.status === 'RESOLVED' || incident.status === 'ESCALATED');
            const isActive = currentStage === stage && incident.status !== 'RESOLVED' && incident.status !== 'ESCALATED';
            
            return (
              <React.Fragment key={stage}>
                {i > 0 && (
                  <div className={`pipeline-connector ${isCompleted ? 'completed' : isActive ? 'active' : ''}`} />
                )}
                <div className="pipeline-step">
                  <div className={`pipeline-node ${isCompleted && !isActive ? 'completed' : isActive ? 'active' : ''}`}>
                    {isCompleted && !isActive ? <CheckCircle size={16} /> : stageIcons[stage] || <Target size={14} />}
                  </div>
                  <span className={`pipeline-label ${isCompleted && !isActive ? 'completed' : isActive ? 'active' : ''}`}>
                    {stage}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left Column: Root Cause + Evidence + Remediation */}
        <div className="lg:col-span-2 grid gap-4">
          {/* Root Cause Analysis */}
          {incident.probable_root_cause && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <Search size={16} style={{ color: 'var(--warning)' }} />
                  Root Cause Analysis
                </h3>
              </div>
              <div className="card-content">
                <div className="p-3 rounded mb-3" style={{ background: 'var(--secondary)', borderLeft: '3px solid var(--warning)' }}>
                  <div className="text-sm">{incident.probable_root_cause}</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-xs text-muted">
                    Confidence: <span className="font-semibold" style={{ color: incident.confidence > 0.7 ? 'var(--success)' : incident.confidence > 0.4 ? 'var(--warning)' : 'var(--destructive)' }}>
                      {(incident.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="metric-bar flex-1" style={{ maxWidth: '200px' }}>
                    <div className={`metric-bar-fill ${incident.confidence > 0.7 ? 'good' : incident.confidence > 0.4 ? 'warn' : 'critical'}`}
                         style={{ width: `${incident.confidence * 100}%` }} />
                  </div>
                </div>
                {incident.alternative_causes?.length > 0 && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                    <div className="text-xs font-medium text-muted mb-2">Alternative Causes</div>
                    {incident.alternative_causes.map((cause, i) => (
                      <div key={i} className="text-xs text-muted mb-1">• {cause}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Remediation Plan */}
          {remPlan && Object.keys(remPlan).length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <Wrench size={16} style={{ color: 'var(--success)' }} />
                  Remediation Plan
                </h3>
              </div>
              <div className="card-content">
                {remPlan.root_cause && (
                  <div className="text-sm mb-3">
                    <span className="text-muted">Root Cause:</span> {remPlan.root_cause}
                  </div>
                )}
                {remPlan.actions?.map((action: any, i: number) => (
                  <div key={i} className="p-3 rounded mb-2 border" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-semibold text-primary">{action.tool}</span>
                      <span className="text-xs text-muted">→ {action.target}</span>
                      {action.authorization && (
                        <span className={`badge ${action.authorization === 'ALLOWED' ? 'badge-success' : 'badge-destructive'}`} style={{ fontSize: '0.6rem' }}>
                          {action.authorization}
                        </span>
                      )}
                    </div>
                  </div>
                )) || (
                  <pre className="text-xs" style={{ maxHeight: '200px' }}>{JSON.stringify(remPlan, null, 2)}</pre>
                )}
              </div>
            </div>
          )}

          {/* Evidence */}
          {evidence && Object.keys(evidence).length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <Eye size={16} style={{ color: 'var(--info)' }} />
                  Telemetry Evidence
                </h3>
              </div>
              <div className="card-content">
                {evidence.anomalies?.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-medium text-muted mb-2 uppercase tracking-wide">Anomalies Detected</div>
                    <div className="grid gap-2">
                      {evidence.anomalies.map((a: any, i: number) => (
                        <div key={i} className="p-2 rounded border flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
                          <AlertTriangle size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                          <div className="text-xs">
                            <span className="font-semibold">{a.metric}</span> on <span className="text-primary">{a.service}</span>:
                            {' '}{a.current_value?.toFixed?.(2) ?? a.current_value} (baseline: {a.baseline?.toFixed?.(2) ?? a.baseline})
                            <span className="text-muted ml-2">score: {a.anomaly_score}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {evidence.per_service && Object.entries(evidence.per_service).map(([svc, data]: [string, any]) => (
                  <div key={svc} className="mb-3">
                    <div className="text-xs font-semibold mb-1">{svc}</div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted">
                      {data.metrics && Object.entries(data.metrics).map(([k, v]: [string, any]) => (
                        <div key={k}>{k}: <span className="font-mono">{typeof v === 'number' ? v.toFixed(2) : String(v)}</span></div>
                      ))}
                    </div>
                    {data.logs?.length > 0 && (
                      <div className="mt-2">
                        {data.logs.slice(0, 3).map((log: any, i: number) => (
                          <div key={i} className="text-xs font-mono" style={{ color: log.level === 'ERROR' ? 'var(--destructive)' : log.level === 'WARN' ? 'var(--warning)' : 'var(--muted-foreground)' }}>
                            [{log.level}] {log.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Verification */}
          {incident.verification && Object.keys(incident.verification).length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  {incident.verification.passed ? <CheckCircle size={16} style={{ color: 'var(--success)' }} /> : <XCircle size={16} style={{ color: 'var(--destructive)' }} />}
                  Verification Results
                </h3>
              </div>
              <div className="card-content">
                <div className={`badge mb-3 ${incident.verification.passed ? 'badge-success' : 'badge-destructive'}`}>
                  {incident.verification.passed ? 'PASSED' : 'FAILED'}
                </div>
                {incident.verification.results?.map((r: any, i: number) => (
                  <div key={i} className="p-2 rounded border mb-2 flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
                    {r.passed ? <CheckCircle size={14} style={{ color: 'var(--success)' }} /> : <XCircle size={14} style={{ color: 'var(--destructive)' }} />}
                    <span className="text-sm">{r.service}</span>
                    {r.checks && Object.entries(r.checks).map(([k, v]: [string, any]) => (
                      <span key={k} className="text-xs text-muted">{k}: {String(v)}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Timeline */}
        <div>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title flex items-center gap-2">
                <Clock size={16} style={{ color: 'var(--info)' }} />
                Investigation Timeline
              </h3>
            </div>
            <div className="card-content">
              {timeline.length > 0 ? (
                <div className="timeline">
                  {timeline.map((evt, i) => (
                    <div key={i} className={`timeline-item stage-${evt.stage.toLowerCase()}`}>
                      <div className="text-xs text-muted mb-1 flex items-center gap-2">
                        <span className="font-mono">{new Date(evt.created_at).toLocaleTimeString()}</span>
                        <span className={`badge badge-muted`} style={{ fontSize: '0.6rem' }}>{evt.stage}</span>
                      </div>
                      <div className="text-sm">{evt.message}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state p-4">
                  <div className="text-sm text-muted">No timeline events yet</div>
                </div>
              )}
            </div>
          </div>

          {/* Impact Summary */}
          {incident.impact && (
            <div className="card mt-4">
              <div className="card-header">
                <h3 className="card-title text-xs uppercase tracking-wide">Impact Summary</h3>
              </div>
              <div className="card-content">
                <div className="text-sm text-muted">{incident.impact}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
