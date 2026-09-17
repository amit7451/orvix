import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  FileText,
  Wrench,
  Shield,
  Eye,
  Brain,
  BookOpen,
  Target,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  Bot,
  Sparkles,
  Layers,
  Code,
  Activity,
  Zap,
} from 'lucide-react';
import type { Incident, IncidentEvent, Approval } from '../types';
import { API_BASE, AGENT_STAGES } from '../types';
import { getStageAISummary, STAGE_CONFIGS } from '../utils/stageSummaries';
import { useEventStream } from '../context/EventStreamContext';
import { useToast } from '../components/Toast';

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
  const { addToast } = useToast();
  const { events, connected: wsConnected } = useEventStream();

  const [incident, setIncident] = useState<Incident | null>(null);
  const [timeline, setTimeline] = useState<IncidentEvent[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [selectedStage, setSelectedStage] = useState<string>('OBSERVE');
  const [showRawJson, setShowRawJson] = useState(false);

  // Approval decision state
  const [approverName, setApproverName] = useState('admin');
  const [decisionReason, setDecisionReason] = useState('');
  const [deciding, setDeciding] = useState(false);

  const lastEventCountRef = useRef(events.length);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const [incRes, tlRes, appRes] = await Promise.all([
        fetch(`${API_BASE}/api/incidents/${id}`),
        fetch(`${API_BASE}/api/incidents/${id}/timeline`),
        fetch(`${API_BASE}/api/approvals?incident_id=${id}`),
      ]);
      if (incRes.ok) setIncident(await incRes.json());
      if (tlRes.ok) setTimeline(await tlRes.json());
      if (appRes.ok) setApprovals(await appRes.json());
    } catch (err) {
      console.error(err);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Real-time listener: whenever any event related to this incident arrives over WebSocket
  useEffect(() => {
    if (events.length !== lastEventCountRef.current) {
      lastEventCountRef.current = events.length;
      const latest = events[events.length - 1];
      if (!latest || !id) return;
      const eventIncId = latest.payload?.incident_id || latest.raw?.incident_id;
      if (!eventIncId || eventIncId === id) {
        fetchData();
      }
    }
  }, [events, id, fetchData]);

  // Sync default selected stage with current execution progress
  useEffect(() => {
    if (incident && timeline.length > 0) {
      const latestStage = timeline[timeline.length - 1].stage.toUpperCase();
      if (AGENT_STAGES.includes(latestStage as any)) {
        setSelectedStage(latestStage);
      } else if (incident.status === 'RESOLVED') {
        setSelectedStage('LEARN');
      }
    }
  }, [incident?.status, timeline.length]);

  if (!incident) {
    return (
      <div className="empty-state">
        <div>Loading incident investigation pipeline...</div>
      </div>
    );
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'RESOLVED':
        return 'badge-success';
      case 'ESCALATED':
      case 'FAILED':
        return 'badge-destructive';
      case 'AWAITING_APPROVAL':
        return 'badge-purple';
      default:
        return 'badge-warning';
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'badge-destructive';
      case 'HIGH':
        return 'badge-warning';
      case 'MEDIUM':
        return 'badge-info';
      default:
        return 'badge-muted';
    }
  };

  const completedStages = new Set(timeline.map((e) => e.stage.toUpperCase()));
  const isResolved = incident.status === 'RESOLVED';
  const isEscalated = incident.status === 'ESCALATED';

  // ══════════════════════════════════════════════════════════════════════
  // DYNAMIC STAGE CLASSIFICATION (Real-Time, No Hardcoding)
  // ══════════════════════════════════════════════════════════════════════
  let currentExecutingStage: string | null = null;
  if (!isResolved && !isEscalated) {
    if (incident.status === 'AWAITING_APPROVAL') {
      currentExecutingStage = 'AUTHORIZE';
    } else if (incident.status === 'REMEDIATING') {
      currentExecutingStage = 'ACT';
    } else if (incident.status === 'VERIFYING') {
      currentExecutingStage = 'VERIFY';
    } else if (incident.status === 'DIAGNOSED') {
      currentExecutingStage = 'PLAN';
    } else if (incident.status === 'INVESTIGATING') {
      currentExecutingStage = completedStages.has('UNDERSTAND') ? 'RETRIEVE' : 'UNDERSTAND';
    } else if (incident.status === 'DETECTED') {
      currentExecutingStage = completedStages.has('OBSERVE') ? 'UNDERSTAND' : 'OBSERVE';
    } else if (timeline.length > 0) {
      const lastStageIdx = AGENT_STAGES.indexOf(timeline[timeline.length - 1].stage.toUpperCase() as any);
      if (lastStageIdx >= 0 && lastStageIdx < AGENT_STAGES.length - 1) {
        currentExecutingStage = AGENT_STAGES[lastStageIdx + 1];
      } else {
        currentExecutingStage = AGENT_STAGES[lastStageIdx];
      }
    } else {
      currentExecutingStage = 'OBSERVE';
    }
  }

  // Stages that are completely finished
  const completedStageList = AGENT_STAGES.filter((s) => {
    if (isResolved) return true;
    if (isEscalated) return completedStages.has(s);
    if (s === currentExecutingStage) return false;
    const sIdx = AGENT_STAGES.indexOf(s);
    const curIdx = currentExecutingStage ? AGENT_STAGES.indexOf(currentExecutingStage as any) : 999;
    return completedStages.has(s) || sIdx < curIdx;
  });

  // Stages that are still queued / remaining
  const remainingStageList = AGENT_STAGES.filter((s) => {
    if (isResolved || isEscalated) return false;
    if (s === currentExecutingStage) return false;
    return !completedStageList.includes(s);
  });

  // Stepper navigation helpers
  const stageIndex = AGENT_STAGES.indexOf(selectedStage as any);
  const prevStage = stageIndex > 0 ? AGENT_STAGES[stageIndex - 1] : null;
  const nextStage = stageIndex < AGENT_STAGES.length - 1 ? AGENT_STAGES[stageIndex + 1] : null;

  // AI 3-4 line summary for selected stage
  const aiSummary = getStageAISummary(selectedStage, incident, timeline);
  const stageEvent = [...timeline].reverse().find((e) => e.stage.toUpperCase() === selectedStage);

  // Approval data for this incident
  const pendingApproval = approvals.find((a) => a.decision === 'PENDING');
  const decidedApproval = approvals.find((a) => a.decision !== 'PENDING');

  const handleDecide = async (approvalId: string, approved: boolean) => {
    setDeciding(true);
    try {
      const res = await fetch(`${API_BASE}/api/approvals/${approvalId}/${approved ? 'approve' : 'reject'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approver: approverName || 'admin',
          reason: decisionReason || (approved ? 'Authorized by engineer' : 'Rejected by engineer'),
        }),
      });
      if (res.ok) {
        addToast(approved ? 'success' : 'warning', `Action ${approved ? 'approved' : 'rejected'}`);
        setDecisionReason('');
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        addToast('error', err.detail || 'Failed to submit decision');
      }
    } catch {
      addToast('error', 'Network error submitting decision');
    }
    setDeciding(false);
  };

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
          <div className="text-xs text-muted flex items-center gap-4 flex-wrap">
            <span className="font-mono">ID: {incident.id.slice(0, 8)}</span>
            <span className="flex items-center gap-1">
              <Clock size={11} /> Detected: {new Date(incident.detected_at).toLocaleString()}
            </span>
            {incident.resolved_at && (
              <span className="flex items-center gap-1 text-success">
                <CheckCircle size={11} /> Resolved: {new Date(incident.resolved_at).toLocaleString()}
              </span>
            )}
            {incident.affected_services?.length > 0 && (
              <span>Services: {incident.affected_services.join(', ')}</span>
            )}
            <span className="flex items-center gap-1 ml-auto text-xs" style={{ color: wsConnected ? 'var(--success)' : 'var(--muted-foreground)' }}>
              <span className={`connection-dot ${wsConnected ? '' : 'offline'}`} />
              {wsConnected ? 'Real-Time Synchronized' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Real-Time Pipeline Execution Overview Banner (No Hardcoding) */}
      <div
        className="card mb-4"
        style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="card-content p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Activity
                size={16}
                className={currentExecutingStage ? 'animate-pulse text-primary' : 'text-success'}
              />
              <span className="font-semibold text-sm">Real-Time Pipeline Execution Status</span>
              <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>
                {completedStageList.length}/9 Stages Complete ({Math.round((completedStageList.length / 9) * 100)}%)
              </span>
            </div>

            {incident.status === 'AWAITING_APPROVAL' && (
              <span className="badge badge-purple animate-pulse flex items-center gap-1">
                <AlertTriangle size={12} /> PAUSED AT AUTHORIZE • HUMAN APPROVAL REQUIRED
              </span>
            )}
          </div>

          {/* 3 Categories: Completed, Currently Executing, Remaining */}
          <div className="grid md:grid-cols-3 gap-3 text-xs">
            {/* 1. Completed Stages */}
            <div
              className="p-2.5 rounded border"
              style={{ borderColor: 'rgba(34, 197, 94, 0.25)', background: 'rgba(34, 197, 94, 0.05)' }}
            >
              <div className="font-bold text-success mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                <CheckCircle size={13} /> Completed ({completedStageList.length})
              </div>
              {completedStageList.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {completedStageList.map((stg) => (
                    <span
                      key={stg}
                      className={`badge badge-success cursor-pointer ${
                        selectedStage === stg ? 'ring-2 ring-success ring-offset-1' : ''
                      }`}
                      style={{ fontSize: '0.62rem' }}
                      onClick={() => setSelectedStage(stg)}
                      title={`Click to view ${stg} details`}
                    >
                      ✓ {stg}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-muted">No stages completed yet</span>
              )}
            </div>

            {/* 2. Currently Executing */}
            <div
              className="p-2.5 rounded border"
              style={{
                borderColor:
                  currentExecutingStage === 'AUTHORIZE' && incident.status === 'AWAITING_APPROVAL'
                    ? 'rgba(251, 191, 36, 0.45)'
                    : currentExecutingStage
                    ? 'rgba(59, 130, 246, 0.45)'
                    : 'rgba(34, 197, 94, 0.25)',
                background:
                  currentExecutingStage === 'AUTHORIZE' && incident.status === 'AWAITING_APPROVAL'
                    ? 'rgba(251, 191, 36, 0.09)'
                    : currentExecutingStage
                    ? 'rgba(59, 130, 246, 0.09)'
                    : 'rgba(34, 197, 94, 0.05)',
              }}
            >
              <div
                className="font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-wide"
                style={{
                  color:
                    currentExecutingStage === 'AUTHORIZE' && incident.status === 'AWAITING_APPROVAL'
                      ? '#fbbf24'
                      : currentExecutingStage
                      ? 'var(--primary)'
                      : 'var(--success)',
                }}
              >
                {currentExecutingStage ? (
                  <Zap size={13} className="animate-bounce" />
                ) : (
                  <CheckCircle size={13} />
                )}
                {currentExecutingStage ? 'Currently Executing' : 'Pipeline Execution Complete'}
              </div>
              {currentExecutingStage ? (
                <div
                  className="cursor-pointer font-medium flex items-center justify-between gap-1"
                  onClick={() => setSelectedStage(currentExecutingStage)}
                  title={`Click to inspect ${currentExecutingStage}`}
                >
                  <span
                    className={`badge ${
                      currentExecutingStage === 'AUTHORIZE' && incident.status === 'AWAITING_APPROVAL'
                        ? 'badge-purple'
                        : 'badge-primary'
                    }`}
                  >
                    Step {AGENT_STAGES.indexOf(currentExecutingStage as any) + 1}: {currentExecutingStage}
                  </span>
                  <span className="text-muted truncate ml-1" style={{ fontSize: '0.68rem' }}>
                    {currentExecutingStage === 'AUTHORIZE' && incident.status === 'AWAITING_APPROVAL'
                      ? '⚠️ Action Paused'
                      : 'Active Processing...'}
                  </span>
                </div>
              ) : (
                <span className="text-success font-semibold">
                  {isResolved ? 'All 9 stages resolved successfully' : 'Pipeline stopped'}
                </span>
              )}
            </div>

            {/* 3. Remaining Stages */}
            <div
              className="p-2.5 rounded border"
              style={{ borderColor: 'rgba(255, 255, 255, 0.08)', background: 'rgba(255, 255, 255, 0.02)' }}
            >
              <div className="font-bold text-muted mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                <Clock size={13} /> Remaining ({remainingStageList.length})
              </div>
              {remainingStageList.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {remainingStageList.map((stg) => (
                    <span
                      key={stg}
                      className={`badge badge-muted cursor-pointer ${
                        selectedStage === stg ? 'ring-2 ring-muted ring-offset-1' : ''
                      }`}
                      style={{ fontSize: '0.62rem', opacity: 0.7 }}
                      onClick={() => setSelectedStage(stg)}
                      title={`Click to view ${stg} queue details`}
                    >
                      ⏳ {stg}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-muted">None remaining (Pipeline complete)</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sequential Agent Pipeline Stepper Bar */}
      <div className="card mb-4" style={{ padding: '0.8rem 1rem' }}>
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-2">
            <Layers size={13} style={{ color: 'var(--primary)' }} />
            Pipeline Stepper
          </div>
          <div className="text-xs text-muted">
            Viewing Step <span className="text-primary font-bold">{stageIndex + 1}</span> of 9
          </div>
        </div>

        <div className="pipeline-container" style={{ padding: '0.5rem 0' }}>
          {AGENT_STAGES.map((stage, i) => {
            const isStageCompleted = completedStageList.includes(stage) || isResolved;
            const isStageActive = currentExecutingStage === stage;
            const isSelected = selectedStage === stage;

            return (
              <React.Fragment key={stage}>
                {i > 0 && (
                  <div
                    className={`pipeline-connector ${
                      isStageCompleted ? 'completed' : isStageActive ? 'active' : ''
                    }`}
                  />
                )}
                <div
                  className="pipeline-step"
                  onClick={() => setSelectedStage(stage)}
                  style={{ cursor: 'pointer' }}
                  title={`Step ${i + 1}: ${stage}`}
                >
                  <div
                    className={`pipeline-node ${
                      isStageCompleted && !isStageActive
                        ? 'completed'
                        : isStageActive
                        ? 'active'
                        : ''
                    } ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    style={{ position: 'relative' }}
                  >
                    {isStageCompleted && !isStageActive ? (
                      <CheckCircle size={16} />
                    ) : (
                      stageIcons[stage] || <Target size={14} />
                    )}
                    <span
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-6px',
                        background: 'var(--card-bg, #1e293b)',
                        border: '1px solid var(--border)',
                        borderRadius: '50%',
                        fontSize: '0.55rem',
                        width: '14px',
                        height: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                      }}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <span
                    className={`pipeline-label ${
                      isStageCompleted && !isStageActive
                        ? 'completed'
                        : isStageActive
                        ? 'active'
                        : ''
                    }`}
                    style={{ fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--primary)' : undefined }}
                  >
                    {stage}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Selected Stage Header & 3-4 Line AI Summary */}
      <div
        className="card mb-4 animate-fadeIn"
        style={{
          borderLeft: `4px solid ${
            aiSummary.status === 'COMPLETED'
              ? 'var(--success)'
              : aiSummary.status === 'IN_PROGRESS'
              ? 'var(--primary)'
              : aiSummary.status === 'AWAITING_APPROVAL'
              ? '#fbbf24'
              : 'var(--border)'
          }`,
        }}
      >
        <div className="card-header flex justify-between items-center flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-md"
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {stageIcons[selectedStage] || <Search size={18} />}
            </div>
            <div>
              <div className="text-xs text-muted uppercase tracking-wider font-semibold">
                Sequential Stage • Step {stageIndex + 1} of 9
              </div>
              <h3 className="card-title mb-0" style={{ fontSize: '1.1rem' }}>
                {selectedStage} — {STAGE_CONFIGS[selectedStage]?.label || selectedStage}
              </h3>
            </div>
            <span
              className={`badge ${
                aiSummary.status === 'COMPLETED'
                  ? 'badge-success'
                  : aiSummary.status === 'IN_PROGRESS'
                  ? 'badge-info'
                  : aiSummary.status === 'AWAITING_APPROVAL'
                  ? 'badge-purple'
                  : 'badge-muted'
              }`}
              style={{ marginLeft: '0.5rem' }}
            >
              {aiSummary.status}
            </span>
          </div>

          {/* Stepper Navigation Buttons */}
          <div className="flex items-center gap-2">
            <button
              className="btn btn-outline btn-xs"
              onClick={() => prevStage && setSelectedStage(prevStage)}
              disabled={!prevStage}
              style={{ opacity: prevStage ? 1 : 0.4 }}
            >
              <ChevronLeft size={14} /> Previous Stage
            </button>
            <button
              className="btn btn-outline btn-xs"
              onClick={() => nextStage && setSelectedStage(nextStage)}
              disabled={!nextStage}
              style={{ opacity: nextStage ? 1 : 0.4 }}
            >
              Next Stage <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="card-content">
          {/* AI 3-4 Line Stage Summary Box */}
          <div
            className="p-4 rounded-md mb-4"
            style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div
              className="flex items-center gap-2 mb-2.5 pb-2 border-b"
              style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}
            >
              <Bot size={16} style={{ color: 'var(--primary)' }} />
              <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                AI Stage Analysis & Execution Summary
              </span>
              <Sparkles size={12} style={{ color: '#fbbf24', marginLeft: 'auto' }} />
            </div>

            {/* 3-4 Line Structured AI Summary */}
            <div className="grid gap-2 text-sm leading-relaxed">
              <div className="flex items-start gap-2.5">
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-mono font-semibold"
                  style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', minWidth: '100px', flexShrink: 0 }}
                >
                  What Happened
                </span>
                <span className="text-foreground">{aiSummary.whatHappened}</span>
              </div>

              <div className="flex items-start gap-2.5">
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-mono font-semibold"
                  style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', minWidth: '100px', flexShrink: 0 }}
                >
                  What Processed
                </span>
                <span className="text-muted-foreground">{aiSummary.whatProcessed}</span>
              </div>

              <div className="flex items-start gap-2.5">
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-mono font-semibold"
                  style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', minWidth: '100px', flexShrink: 0 }}
                >
                  Key Finding
                </span>
                <span className="text-foreground font-medium">{aiSummary.keyFinding}</span>
              </div>

              <div className="flex items-start gap-2.5">
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-mono font-semibold"
                  style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', minWidth: '100px', flexShrink: 0 }}
                >
                  Next Steps
                </span>
                <span className="text-muted">{aiSummary.nextSteps}</span>
              </div>
            </div>
          </div>

          {/* Toggle Raw Data Inspection */}
          {stageEvent?.data && Object.keys(stageEvent.data).length > 0 && (
            <div className="mb-3">
              <button
                className="btn btn-ghost btn-xs text-muted flex items-center gap-1.5"
                onClick={() => setShowRawJson((prev) => !prev)}
              >
                <Code size={12} />
                {showRawJson ? 'Hide Raw Stage Data' : 'Inspect Raw Stage Data (JSON)'}
              </button>

              {showRawJson && (
                <div
                  className="mt-2 p-3 rounded bg-muted overflow-x-auto border"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="text-xs text-muted mb-1 font-mono">
                    Stage: {stageEvent.stage} • Timestamp: {stageEvent.created_at}
                  </div>
                  <pre style={{ margin: 0, fontSize: '0.72rem', color: '#cbd5e1' }}>
                    {JSON.stringify(stageEvent.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Two Column Layout: Stage Deep Dive (Left) & Approval + Macro Timeline (Right) */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left Column: Stage-Specific Deep Dive View */}
        <div className="lg:col-span-2 grid gap-4">
          {/* STAGE 1: OBSERVE */}
          {selectedStage === 'OBSERVE' && (
            <div className="card animate-fadeIn">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <Eye size={16} style={{ color: 'var(--info)' }} />
                  Live Telemetry & Anomaly Evidence
                </h3>
              </div>
              <div className="card-content">
                {evidence?.anomalies?.length > 0 ? (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">
                      Detected Anomalies
                    </div>
                    <div className="grid gap-2">
                      {evidence.anomalies.map((a: any, i: number) => (
                        <div
                          key={i}
                          className="p-3 rounded border flex items-center gap-3"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                          <div className="text-xs flex-1">
                            <span className="font-semibold text-primary">{a.service}</span>: Metric{' '}
                            <span className="font-mono font-bold text-foreground">{a.metric}</span> breached threshold
                            (Current: <span className="font-mono">{a.current_value?.toFixed?.(2) ?? a.current_value}</span>, Baseline:{' '}
                            <span className="font-mono">{a.baseline?.toFixed?.(2) ?? a.baseline}</span>)
                          </div>
                          <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
                            Score: {a.anomaly_score}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted mb-3">No individual anomaly breaches stored.</div>
                )}

                {evidence?.per_service && (
                  <div>
                    <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">
                      Observed Service Telemetry
                    </div>
                    {Object.entries(evidence.per_service).map(([svc, data]: [string, any]) => (
                      <div key={svc} className="p-3 rounded border mb-2" style={{ borderColor: 'var(--border)' }}>
                        <div className="font-semibold text-xs text-primary mb-2">{svc}</div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-muted">
                          {data.metrics &&
                            Object.entries(data.metrics).map(([k, v]: [string, any]) => (
                              <div key={k}>
                                {k}: <span className="font-mono text-foreground">{typeof v === 'number' ? v.toFixed(2) : String(v)}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STAGE 2: UNDERSTAND */}
          {selectedStage === 'UNDERSTAND' && (
            <div className="card animate-fadeIn">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <Brain size={16} style={{ color: '#a78bfa' }} />
                  Symptom Analysis & Severity Derivation
                </h3>
              </div>
              <div className="card-content">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 rounded border" style={{ borderColor: 'var(--border)' }}>
                    <div className="text-xs text-muted mb-1">Derived Severity</div>
                    <span className={`badge ${severityColor(incident.severity)}`}>{incident.severity}</span>
                  </div>
                  <div className="p-3 rounded border" style={{ borderColor: 'var(--border)' }}>
                    <div className="text-xs text-muted mb-1">Impact Scope</div>
                    <div className="text-sm font-medium">{incident.impact || 'Service degradation detected'}</div>
                  </div>
                </div>

                <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">
                  Identified Symptoms ({incident.symptoms?.length || 0})
                </div>
                {incident.symptoms?.length > 0 ? (
                  <div className="grid gap-2">
                    {incident.symptoms.map((s, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded border text-xs flex items-center gap-2"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <span className="font-mono text-primary font-bold">#{i + 1}</span>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted">Symptoms normalized from live telemetry.</div>
                )}
              </div>
            </div>
          )}

          {/* STAGE 3: RETRIEVE */}
          {selectedStage === 'RETRIEVE' && (
            <div className="card animate-fadeIn">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <BookOpen size={16} style={{ color: '#c084fc' }} />
                  Retrieved Runbooks & Vector Knowledge
                </h3>
              </div>
              <div className="card-content">
                {stageEvent?.data?.retrieved_documents?.length > 0 ? (
                  <div className="grid gap-3">
                    {stageEvent?.data?.retrieved_documents?.map((doc: any, i: number) => (
                      <div key={i} className="p-3 rounded border" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-semibold text-sm text-primary">{doc.title || doc.document_id}</span>
                          <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>
                            Score: {(doc.score || 0).toFixed(3)}
                          </span>
                        </div>
                        <div className="text-xs text-muted leading-relaxed">{doc.text || doc.snippet}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted p-4 text-center">
                    Runbook documents retrieved from the vector database for incident resolution.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STAGE 4: REASON */}
          {selectedStage === 'REASON' && (
            <div className="card animate-fadeIn">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <Search size={16} style={{ color: 'var(--warning)' }} />
                  Root Cause Diagnosis & Confidence
                </h3>
              </div>
              <div className="card-content">
                {incident.probable_root_cause ? (
                  <>
                    <div
                      className="p-3 rounded mb-3"
                      style={{ background: 'var(--secondary)', borderLeft: '3px solid var(--warning)' }}
                    >
                      <div className="text-xs text-muted uppercase font-bold mb-1">Diagnosed Root Cause</div>
                      <div className="text-sm font-medium">{incident.probable_root_cause}</div>
                    </div>

                    <div className="flex items-center gap-4 mb-4">
                      <div className="text-xs text-muted">
                        Confidence:{' '}
                        <span
                          className="font-semibold"
                          style={{
                            color:
                              incident.confidence > 0.7
                                ? 'var(--success)'
                                : incident.confidence > 0.4
                                ? 'var(--warning)'
                                : 'var(--destructive)',
                          }}
                        >
                          {(incident.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="metric-bar flex-1" style={{ maxWidth: '240px' }}>
                        <div
                          className={`metric-bar-fill ${
                            incident.confidence > 0.7 ? 'good' : incident.confidence > 0.4 ? 'warn' : 'critical'
                          }`}
                          style={{ width: `${incident.confidence * 100}%` }}
                        />
                      </div>
                    </div>

                    {incident.alternative_causes?.length > 0 && (
                      <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                        <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">
                          Alternative Causes Evaluated
                        </div>
                        {incident.alternative_causes.map((cause, i) => (
                          <div key={i} className="text-xs text-muted mb-1.5 flex items-center gap-2">
                            <span>•</span> {cause}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-muted">Awaiting diagnostic synthesis from agent.</div>
                )}
              </div>
            </div>
          )}

          {/* STAGE 5: PLAN */}
          {selectedStage === 'PLAN' && (
            <div className="card animate-fadeIn">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <FileText size={16} style={{ color: 'var(--info)' }} />
                  Targeted Remediation Plan
                </h3>
              </div>
              <div className="card-content">
                {remPlan?.actions?.length > 0 ? (
                  <div className="grid gap-2">
                    {remPlan.actions.map((action: any, i: number) => (
                      <div key={i} className="p-3 rounded border" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-mono text-sm font-semibold text-primary">{action.tool}</span>
                          <span className="text-xs text-muted">Target: {action.target}</span>
                          {action.authorization && (
                            <span
                              className={`badge ${
                                action.authorization === 'ALLOWED' ? 'badge-success' : 'badge-warning'
                              }`}
                              style={{ fontSize: '0.65rem' }}
                            >
                              {action.authorization}
                            </span>
                          )}
                        </div>
                        {action.rollback && (
                          <div className="text-xs text-muted mt-1">Rollback: {action.rollback}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted">Remediation action plan formulation pending.</div>
                )}
              </div>
            </div>
          )}

          {/* STAGE 6: AUTHORIZE */}
          {selectedStage === 'AUTHORIZE' && (
            <div className="card animate-fadeIn">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <Shield size={16} style={{ color: '#fbbf24' }} />
                  Safety Policy & Authorization Evaluation
                </h3>
              </div>
              <div className="card-content">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 rounded border" style={{ borderColor: 'var(--border)' }}>
                    <div className="text-xs text-muted mb-1">Policy Gate Status</div>
                    <span
                      className={`badge ${
                        incident.status === 'AWAITING_APPROVAL' ? 'badge-purple' : 'badge-success'
                      }`}
                    >
                      {incident.status === 'AWAITING_APPROVAL' ? 'APPROVAL REQUIRED' : 'PRE-AUTHORIZED'}
                    </span>
                  </div>
                  <div className="p-3 rounded border" style={{ borderColor: 'var(--border)' }}>
                    <div className="text-xs text-muted mb-1">Permission Profile</div>
                    <div className="text-sm font-medium">Autonomous Agent Sandbox</div>
                  </div>
                </div>

                {remPlan?.actions && (
                  <div>
                    <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">
                      Tool Risk Classifications
                    </div>
                    {remPlan.actions.map((act: any, i: number) => (
                      <div
                        key={i}
                        className="p-2.5 rounded border mb-2 flex items-center justify-between text-xs"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <span className="font-mono font-semibold">{act.tool}</span>
                        <span className={`badge ${act.risk_level === 'HIGH' ? 'badge-destructive' : 'badge-success'}`}>
                          {act.risk_level || 'LOW'} RISK
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STAGE 7: ACT */}
          {selectedStage === 'ACT' && (
            <div className="card animate-fadeIn">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <Wrench size={16} style={{ color: 'var(--success)' }} />
                  Automated Tool Execution
                </h3>
              </div>
              <div className="card-content">
                {remPlan?.actions?.length > 0 ? (
                  <div className="grid gap-2">
                    {remPlan.actions.map((action: any, i: number) => (
                      <div key={i} className="p-3 rounded border" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-mono text-sm font-semibold text-primary">{action.tool}</span>
                          <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                            EXECUTED
                          </span>
                        </div>
                        <div className="text-xs text-muted">Applied against: {action.target}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted">Tools executed autonomously to remediate degradation.</div>
                )}
              </div>
            </div>
          )}

          {/* STAGE 8: VERIFY */}
          {selectedStage === 'VERIFY' && (
            <div className="card animate-fadeIn">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <CheckCircle size={16} style={{ color: '#34d399' }} />
                  Health Verification & Metric Validation
                </h3>
              </div>
              <div className="card-content">
                {incident.verification?.results?.length > 0 ? (
                  <>
                    <div
                      className={`badge mb-3 ${
                        incident.verification.passed ? 'badge-success' : 'badge-destructive'
                      }`}
                    >
                      {incident.verification.passed ? 'ALL CHECKS PASSED' : 'VERIFICATION FAILED'}
                    </div>
                    <div className="grid gap-2">
                      {incident.verification.results.map((r: any, i: number) => (
                        <div key={i} className="p-3 rounded border" style={{ borderColor: 'var(--border)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-sm">{r.service}</span>
                            <span
                              className={`badge ${r.passed ? 'badge-success' : 'badge-destructive'}`}
                              style={{ fontSize: '0.65rem' }}
                            >
                              {r.passed ? 'HEALTHY' : 'DEGRADED'}
                            </span>
                          </div>
                          {r.checks && (
                            <div className="grid grid-cols-2 gap-2 text-xs text-muted">
                              {Object.entries(r.checks).map(([k, v]: [string, any]) => (
                                <div key={k}>
                                  {k}: <span className="font-mono text-foreground">{String(v.value ?? v)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted">Independent verification metrics to be validated post-action.</div>
                )}
              </div>
            </div>
          )}

          {/* STAGE 9: LEARN */}
          {selectedStage === 'LEARN' && (
            <div className="card animate-fadeIn">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <GraduationCap size={16} style={{ color: 'var(--primary)' }} />
                  Knowledge Consolidation & Memory Archive
                </h3>
              </div>
              <div className="card-content">
                <div className="p-3 rounded border mb-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-xs text-muted uppercase font-bold mb-1">Long-Term Memory Status</div>
                  <div className="text-sm">
                    {isResolved
                      ? 'Resolution fingerprint archived in Qdrant vector memory for similarity search.'
                      : 'Pending final resolution confirmation.'}
                  </div>
                </div>

                <div className="p-3 rounded border" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-xs text-muted uppercase font-bold mb-1">Notification Audit</div>
                  <div className="text-sm">Dispatched post-mortem alerts to on-call Slack & monitoring webhooks.</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Dedicated Incident Approval Gate + Timeline & Impact */}
        <div>
          {/* ══════════════════════════════════════════════════════════════ */}
          {/* DEDICATED HUMAN APPROVAL GATE ON THE SIDE FOR THIS INCIDENT */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {pendingApproval && (
            <div
              className="card mb-4 animate-fadeIn"
              style={{
                border: '2px solid #fbbf24',
                background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(15, 23, 42, 0.95) 100%)',
                boxShadow: '0 0 20px rgba(251, 191, 36, 0.2)',
              }}
            >
              <div
                className="card-header flex items-center justify-between"
                style={{ borderBottom: '1px solid rgba(251, 191, 36, 0.25)' }}
              >
                <h3 className="card-title flex items-center gap-2" style={{ color: '#fbbf24', fontSize: '0.95rem' }}>
                  <AlertTriangle size={17} style={{ color: '#fbbf24' }} />
                  Human Approval Required
                </h3>
                <span className="badge badge-purple" style={{ fontSize: '0.62rem' }}>
                  PAUSED
                </span>
              </div>

              <div className="card-content p-4">
                {/* 1. Explaining the Issue */}
                <div className="mb-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted mb-1">
                    The Issue
                  </div>
                  <div
                    className="text-xs text-foreground leading-relaxed p-2.5 rounded"
                    style={{ background: 'rgba(0, 0, 0, 0.35)', border: '1px solid var(--border)' }}
                  >
                    {incident.probable_root_cause || incident.description || incident.title}
                  </div>
                </div>

                {/* 2. Proposed Remediation Action */}
                <div className="mb-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted mb-1">
                    Proposed Action
                  </div>
                  <div
                    className="p-2.5 rounded border text-xs"
                    style={{ borderColor: 'var(--border)', background: 'rgba(0, 0, 0, 0.35)' }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono font-bold text-primary text-sm">
                        {pendingApproval.requested_action?.tool || pendingApproval.action_id}
                      </span>
                      <span className="badge badge-destructive" style={{ fontSize: '0.62rem' }}>
                        {pendingApproval.risk_level || 'HIGH'} RISK
                      </span>
                    </div>
                    <div className="text-muted">
                      Target Service:{' '}
                      <span className="font-semibold text-foreground">
                        {pendingApproval.requested_action?.target || incident.affected_services?.join(', ') || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Explaining WHY Human Approval is Required */}
                <div className="mb-3">
                  <div
                    className="text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"
                    style={{ color: '#fbbf24' }}
                  >
                    <Shield size={12} /> Why Human Approval is Required
                  </div>
                  <div
                    className="p-2.5 rounded text-xs leading-relaxed"
                    style={{
                      background: 'rgba(251, 191, 36, 0.08)',
                      border: '1px solid rgba(251, 191, 36, 0.25)',
                      color: '#fef3c7',
                    }}
                  >
                    {pendingApproval.requested_action?.reasons && pendingApproval.requested_action.reasons.length > 0 ? (
                      <ul className="list-disc pl-4 space-y-1" style={{ margin: 0 }}>
                        {pendingApproval.requested_action.reasons.map((r: string, idx: number) => (
                          <li key={idx}>{r}</li>
                        ))}
                      </ul>
                    ) : pendingApproval.reason ? (
                      <div>{pendingApproval.reason}</div>
                    ) : (
                      <div>
                        Action involves executing <strong>{pendingApproval.requested_action?.tool}</strong> against Tier-1
                        production service{' '}
                        <strong>
                          {pendingApproval.requested_action?.target || incident.affected_services?.[0] || 'infrastructure'}
                        </strong>
                        . Under ORVIX Safety Policies, high-impact write operations and container restarts require explicit
                        human engineer authorization before execution to safeguard system stability.
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Decision Form */}
                <div className="pt-2 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                  <div className="mb-2">
                    <label className="text-xs text-muted block mb-1">Approver Identity</label>
                    <input
                      type="text"
                      value={approverName}
                      onChange={(e) => setApproverName(e.target.value)}
                      className="w-full text-xs"
                      placeholder="e.g. on-call engineer"
                    />
                  </div>

                  <div className="mb-3">
                    <label className="text-xs text-muted block mb-1">Decision Reason (Optional)</label>
                    <input
                      type="text"
                      value={decisionReason}
                      onChange={(e) => setDecisionReason(e.target.value)}
                      className="w-full text-xs"
                      placeholder="e.g. Verified database pool safe to restart"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      className="btn btn-success btn-sm flex-1"
                      disabled={deciding}
                      onClick={() => handleDecide(pendingApproval.id, true)}
                    >
                      <CheckCircle size={14} /> {deciding ? 'Authorizing...' : 'Approve Action'}
                    </button>
                    <button
                      className="btn btn-destructive btn-sm flex-1"
                      disabled={deciding}
                      onClick={() => handleDecide(pendingApproval.id, false)}
                    >
                      <XCircle size={14} /> {deciding ? 'Rejecting...' : 'Reject Action'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Decided Approval Audit Badge */}
          {decidedApproval && !pendingApproval && (
            <div
              className="card mb-4 p-3 border"
              style={{
                borderColor:
                  decidedApproval.decision === 'APPROVED'
                    ? 'rgba(34, 197, 94, 0.4)'
                    : 'rgba(239, 68, 68, 0.4)',
                background: 'rgba(0, 0, 0, 0.2)',
              }}
            >
              <div
                className="flex items-center gap-2 text-xs font-semibold mb-1"
                style={{
                  color: decidedApproval.decision === 'APPROVED' ? 'var(--success)' : 'var(--destructive)',
                }}
              >
                {decidedApproval.decision === 'APPROVED' ? (
                  <CheckCircle size={14} />
                ) : (
                  <XCircle size={14} />
                )}
                Action Authorization: {decidedApproval.decision}
              </div>
              <div className="text-xs text-muted">
                Action: <span className="text-primary font-mono">{decidedApproval.requested_action?.tool}</span> •
                Decided by <span className="text-foreground font-medium">{decidedApproval.approver || 'operator'}</span>
                {decidedApproval.decided_at && ` at ${new Date(decidedApproval.decided_at).toLocaleTimeString()}`}
                {decidedApproval.reason && ` ("${decidedApproval.reason}")`}
              </div>
            </div>
          )}

          {/* Full Chronological Investigation Timeline */}
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
                    <div
                      key={i}
                      className={`timeline-item stage-${evt.stage.toLowerCase()}`}
                      style={{
                        cursor: 'pointer',
                        padding: '0.4rem',
                        borderRadius: '4px',
                        background:
                          selectedStage === evt.stage.toUpperCase() ? 'rgba(59, 130, 246, 0.08)' : undefined,
                      }}
                      onClick={() => setSelectedStage(evt.stage.toUpperCase())}
                    >
                      <div className="text-xs text-muted mb-1 flex items-center justify-between gap-2">
                        <span className="font-mono">{new Date(evt.created_at).toLocaleTimeString()}</span>
                        <span
                          className={`badge ${
                            selectedStage === evt.stage.toUpperCase() ? 'badge-info' : 'badge-muted'
                          }`}
                          style={{ fontSize: '0.6rem' }}
                        >
                          {evt.stage}
                        </span>
                      </div>
                      <div className="text-xs text-foreground leading-snug">{evt.message}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state p-4">
                  <div className="text-sm text-muted">No timeline events recorded yet.</div>
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
                <div className="text-sm text-muted leading-relaxed">{incident.impact}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
