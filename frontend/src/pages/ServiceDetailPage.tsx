import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Server,
  ArrowLeft,
  Activity,
  Gauge,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  ShieldAlert,
  Database,
  Cpu,
  Layers,
  Terminal,
  RotateCcw,
  Play,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Search,
  Radio,
} from 'lucide-react';
import type { ServiceDetail, Incident, DependencyServiceInfo } from '../types';
import { API_BASE } from '../types';
import { useEventStream } from '../context/EventStreamContext';
import { useToast } from '../components/Toast';

export const ServiceDetailPage: React.FC = () => {
  const { name: serviceName = '' } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { connected, events } = useEventStream();

  const [detail, setDetail] = useState<ServiceDetail | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<'overview' | 'failures' | 'dependencies' | 'logs'>('overview');
  const [incidentFilter, setIncidentFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [chaosModalOpen, setChaosModalOpen] = useState(false);
  const [chaosType, setChaosType] = useState('database');
  const [chaosSeverity, setChaosSeverity] = useState(0.85);
  const [actionLoading, setActionLoading] = useState(false);
  const [chartMetric, setChartMetric] = useState<'latency' | 'error_rate' | 'resources' | 'traffic'>('latency');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [logSearch, setLogSearch] = useState('');

  const fetchData = useCallback(async (isSilent = false) => {
    if (!serviceName) return;
    if (!isSilent) setLoading(true);
    try {
      const [detailRes, incRes] = await Promise.all([
        fetch(`${API_BASE}/api/services/${serviceName}/detail`),
        fetch(`${API_BASE}/api/incidents?service=${serviceName}`),
      ]);

      if (detailRes.ok) {
        const d: ServiceDetail = await detailRes.json();
        setDetail(d);
      }
      if (incRes.ok) {
        const incs: Incident[] = await incRes.json();
        setIncidents(incs);
      }
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to fetch service detail:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [serviceName]);

  // Initial fetch and auto-refresh timer
  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchData(true), 3000);
    return () => clearInterval(interval);
  }, [fetchData, autoRefresh]);

  // Listen to WebSocket events to trigger instant re-fetch on service changes
  useEffect(() => {
    if (events.length === 0) return;
    const lastEvent = events[0];
    const payload = lastEvent.payload || {};
    const affected = payload.affected_services || [];
    if (
      lastEvent.type === 'service_updated' ||
      lastEvent.type === 'anomaly_detected' ||
      lastEvent.type === 'incident_created' ||
      lastEvent.type === 'incident_resolved' ||
      affected.includes(serviceName) ||
      payload.service === serviceName
    ) {
      fetchData(true);
    }
  }, [events, serviceName, fetchData]);

  const handleInjectFailure = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/simulation/failures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: serviceName,
          kind: chaosType,
          severity: chaosSeverity,
          note: `Manual chaos injection test from ${serviceName} detail page`,
        }),
      });
      if (res.ok) {
        addToast('warning', `Injected ${chaosType} failure on ${serviceName} (severity: ${chaosSeverity})`);
        setChaosModalOpen(false);
        fetchData(true);
      } else {
        const data = await res.json();
        addToast('error', `Failed: ${data.detail || 'Injection error'}`);
      }
    } catch {
      addToast('error', 'Network error injecting failure');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearFailures = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/simulation/reset?service=${serviceName}`, {
        method: 'POST',
      });
      if (res.ok) {
        addToast('success', `Cleared all active failures on ${serviceName}`);
        fetchData(true);
      }
    } catch {
      addToast('error', 'Error resetting failures');
    } finally {
      setActionLoading(false);
    }
  };

  const getHealthStatus = (telemetry?: ServiceDetail['telemetry']) => {
    if (!telemetry) return 'healthy';
    if (!telemetry.healthy || telemetry.error_rate > 0.3) return 'unhealthy';
    if (telemetry.latency_ms > 400 || telemetry.error_rate > 0.05 || telemetry.cpu_percent > 80) return 'degraded';
    return 'healthy';
  };

  const currentStatus = getHealthStatus(detail?.telemetry);

  const filteredIncidents = useMemo(() => {
    if (incidentFilter === 'active') {
      return incidents.filter(i => i.status !== 'RESOLVED');
    }
    if (incidentFilter === 'resolved') {
      return incidents.filter(i => i.status === 'RESOLVED');
    }
    return incidents;
  }, [incidents, incidentFilter]);

  const activeIncidentsCount = incidents.filter(i => i.status !== 'RESOLVED').length;

  const historyPoints = detail?.history || [];

  // SVG Chart Dimensions
  const chartWidth = 720;
  const chartHeight = 220;
  const padding = { top: 20, right: 30, bottom: 35, left: 55 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  // Chart data preparation based on selected metric
  const chartData = useMemo(() => {
    if (!historyPoints.length) return { points: [], maxVal: 1, minVal: 0, unit: '', yTicks: [] };

    let values: number[] = [];
    let unit = '';
    let thresholdVal: number | null = null;

    if (chartMetric === 'latency') {
      values = historyPoints.map(p => p.latency_ms);
      unit = 'ms';
      thresholdVal = 300;
    } else if (chartMetric === 'error_rate') {
      values = historyPoints.map(p => p.error_rate * 100);
      unit = '%';
      thresholdVal = 5.0;
    } else if (chartMetric === 'resources') {
      values = historyPoints.map(p => Math.max(p.cpu_percent, p.memory_percent));
      unit = '%';
      thresholdVal = 80;
    } else if (chartMetric === 'traffic') {
      values = historyPoints.map(p => p.throughput_rps);
      unit = 'rps';
    }

    const maxVal = Math.max(...values, thresholdVal || 0, 1) * 1.15;
    const minVal = 0;

    const points = historyPoints.map((p, idx) => {
      const x = padding.left + (idx / Math.max(historyPoints.length - 1, 1)) * graphWidth;
      const y = padding.top + graphHeight - ((values[idx] - minVal) / (maxVal - minVal)) * graphHeight;
      return {
        x,
        y,
        raw: values[idx],
        timestamp: p.timestamp,
        point: p,
      };
    });

    const yTicks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal].map(v => ({
      val: v,
      y: padding.top + graphHeight - ((v - minVal) / (maxVal - minVal)) * graphHeight,
    }));

    return { points, maxVal, minVal, unit, yTicks, thresholdVal };
  }, [historyPoints, chartMetric, graphWidth, graphHeight, padding.left, padding.top]);

  const svgPath = useMemo(() => {
    if (!chartData.points.length) return '';
    const pts = chartData.points;
    const d = pts.reduce((acc, curr, idx) => {
      if (idx === 0) return `M ${curr.x} ${curr.y}`;
      return `${acc} L ${curr.x} ${curr.y}`;
    }, '');
    return d;
  }, [chartData.points]);

  const svgAreaPath = useMemo(() => {
    if (!chartData.points.length) return '';
    const pts = chartData.points;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const bottomY = padding.top + graphHeight;
    return `${svgPath} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
  }, [svgPath, chartData.points, padding.top, graphHeight]);

  const thresholdY = useMemo(() => {
    if (chartData.thresholdVal == null) return null;
    return (
      padding.top +
      graphHeight -
      ((chartData.thresholdVal - chartData.minVal) / (chartData.maxVal - chartData.minVal)) * graphHeight
    );
  }, [chartData.thresholdVal, chartData.minVal, chartData.maxVal, padding.top, graphHeight]);

  const filteredLogs = useMemo(() => {
    if (!detail?.logs) return [];
    if (!logSearch) return detail.logs;
    return detail.logs.filter(
      l =>
        l.message.toLowerCase().includes(logSearch.toLowerCase()) ||
        l.level.toLowerCase().includes(logSearch.toLowerCase())
    );
  }, [detail?.logs, logSearch]);

  if (loading && !detail) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
        <Activity className="animate-spin text-primary mb-3" size={32} />
        <div className="text-sm font-medium text-muted">Loading telemetry for {serviceName}...</div>
      </div>
    );
  }

  if (!detail && !loading) {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <AlertTriangle className="text-destructive mx-auto mb-3" size={40} />
        <h2 className="text-lg font-bold mb-2">Service Not Found</h2>
        <p className="text-sm text-muted mb-4">Could not load details for service &quot;{serviceName}&quot;.</p>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/services')}>
          <ArrowLeft size={14} className="mr-1" /> Back to Services
        </button>
      </div>
    );
  }

  const telemetry = detail?.telemetry;
  const activeFailures = detail?.active_failures || [];
  const upstream = detail?.dependencies.upstream || [];
  const downstream = detail?.dependencies.downstream || [];

  return (
    <div className="animate-fadeIn pb-12">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <button
            className="btn btn-ghost btn-sm p-2 rounded-lg"
            onClick={() => navigate('/services')}
            title="Back to Services"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight mb-0 flex items-center gap-2">
                <Server size={22} style={{ color: 'var(--primary)' }} />
                {serviceName}
              </h1>
              <span
                className={`badge uppercase text-xs font-semibold px-2 py-0.5 ${
                  currentStatus === 'healthy'
                    ? 'badge-success'
                    : currentStatus === 'degraded'
                    ? 'badge-warning'
                    : 'badge-destructive'
                }`}
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                    currentStatus === 'healthy' ? 'bg-emerald-400 animate-pulse' : currentStatus === 'degraded' ? 'bg-amber-400' : 'bg-red-500 animate-ping'
                  }`}
                />
                {currentStatus}
              </span>
              <span className="badge badge-outline text-xs uppercase" style={{ color: 'var(--primary)' }}>
                {detail?.service.tier?.toUpperCase() || 'TIER-1'}
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Owner: <strong>{detail?.service.owner_team || 'platform'}</strong> • {detail?.service.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Live WS Pulse */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}
          >
            <Radio size={12} className={connected ? 'text-emerald-400' : 'text-amber-400'} />
            <span className="text-muted text-[11px]">
              {autoRefresh ? 'Live Stream' : 'Paused'} • {lastRefreshed.toLocaleTimeString()}
            </span>
          </div>

          <button
            className={`btn btn-xs ${autoRefresh ? 'btn-ghost' : 'btn-outline'}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? 'Pause live auto-refresh' : 'Resume live auto-refresh'}
          >
            {autoRefresh ? 'Pause' : 'Resume'}
          </button>

          <button
            className="btn btn-ghost btn-xs"
            onClick={() => fetchData(false)}
            title="Force refresh"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>

          {activeFailures.length > 0 && (
            <button
              className="btn btn-destructive btn-xs flex items-center gap-1"
              onClick={handleClearFailures}
              disabled={actionLoading}
            >
              <RotateCcw size={12} /> Clear Failures ({activeFailures.length})
            </button>
          )}

          <button
            className="btn btn-primary btn-xs flex items-center gap-1"
            onClick={() => setChaosModalOpen(true)}
          >
            <Zap size={12} /> Inject Chaos Test
          </button>
        </div>
      </div>

      {/* Active Failure Warning Banner */}
      {activeFailures.length > 0 && (
        <div
          className="mb-6 p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 animate-pulse"
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            borderColor: 'rgba(239, 68, 68, 0.4)',
          }}
        >
          <div className="flex items-start gap-3">
            <ShieldAlert size={22} className="text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-sm text-destructive flex items-center gap-2">
                Active Anomaly / Injected Chaos Failure on {serviceName}
              </div>
              <div className="text-xs text-muted mt-1 space-y-1">
                {activeFailures.map((f, idx) => (
                  <div key={idx}>
                    Type: <strong className="text-foreground">{f.kind}</strong> (severity: {(f.severity * 100).toFixed(0)}%) •
                    Injected: {new Date(f.injected_at).toLocaleTimeString()}
                    {f.note && <span> — &quot;{f.note}&quot;</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn btn-destructive btn-sm flex items-center gap-1 text-xs"
              onClick={handleClearFailures}
              disabled={actionLoading}
            >
              <RotateCcw size={13} /> Clear Failure & Restore Baseline
            </button>
          </div>
        </div>
      )}

      {/* Key Real-Time Telemetry Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6 stagger-children">
        {/* Latency */}
        <div className="card p-3 flex flex-col justify-between">
          <div className="text-xs font-medium text-muted flex items-center justify-between mb-1">
            <span>Latency (p99)</span>
            <Clock size={13} className="text-primary" />
          </div>
          <div>
            <div
              className="text-xl font-bold tracking-tight"
              style={{
                color:
                  (telemetry?.latency_ms || 0) > 400
                    ? 'var(--destructive)'
                    : (telemetry?.latency_ms || 0) > 250
                    ? 'var(--warning)'
                    : 'var(--success)',
              }}
            >
              {telemetry?.latency_ms.toFixed(0)} <span className="text-xs font-normal text-muted">ms</span>
            </div>
            <div className="text-[11px] text-muted mt-1 flex items-center justify-between">
              <span>Baseline: 110ms</span>
              <span className={(telemetry?.latency_ms || 0) > 300 ? 'text-destructive font-medium' : 'text-emerald-400'}>
                {(telemetry?.latency_ms || 0) > 300 ? 'HIGH' : 'NORMAL'}
              </span>
            </div>
          </div>
        </div>

        {/* Error Rate */}
        <div className="card p-3 flex flex-col justify-between">
          <div className="text-xs font-medium text-muted flex items-center justify-between mb-1">
            <span>Error Rate</span>
            <AlertTriangle size={13} className="text-destructive" />
          </div>
          <div>
            <div
              className="text-xl font-bold tracking-tight"
              style={{
                color:
                  (telemetry?.error_rate || 0) > 0.1
                    ? 'var(--destructive)'
                    : (telemetry?.error_rate || 0) > 0.03
                    ? 'var(--warning)'
                    : 'var(--success)',
              }}
            >
              {((telemetry?.error_rate || 0) * 100).toFixed(2)} <span className="text-xs font-normal text-muted">%</span>
            </div>
            <div className="text-[11px] text-muted mt-1 flex items-center justify-between">
              <span>SLA Target: &lt;1.0%</span>
              <span className={(telemetry?.error_rate || 0) > 0.05 ? 'text-destructive font-medium' : 'text-emerald-400'}>
                {(telemetry?.error_rate || 0) > 0.05 ? 'BREACH' : 'OK'}
              </span>
            </div>
          </div>
        </div>

        {/* Throughput */}
        <div className="card p-3 flex flex-col justify-between">
          <div className="text-xs font-medium text-muted flex items-center justify-between mb-1">
            <span>Throughput</span>
            <Gauge size={13} className="text-info" />
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>
              {telemetry?.throughput_rps.toFixed(0)} <span className="text-xs font-normal text-muted">rps</span>
            </div>
            <div className="text-[11px] text-muted mt-1 flex items-center justify-between">
              <span>Capacity: 500 rps</span>
              <span className="text-muted">Load OK</span>
            </div>
          </div>
        </div>

        {/* CPU Utilization */}
        <div className="card p-3 flex flex-col justify-between">
          <div className="text-xs font-medium text-muted flex items-center justify-between mb-1">
            <span>CPU Usage</span>
            <Cpu size={13} className="text-primary" />
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight" style={{ color: (telemetry?.cpu_percent || 0) > 80 ? 'var(--destructive)' : 'var(--foreground)' }}>
              {telemetry?.cpu_percent.toFixed(1)} <span className="text-xs font-normal text-muted">%</span>
            </div>
            <div className="w-full bg-secondary h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (telemetry?.cpu_percent || 0) > 80 ? 'bg-red-500' : (telemetry?.cpu_percent || 0) > 60 ? 'bg-amber-400' : 'bg-primary'
                }`}
                style={{ width: `${Math.min(telemetry?.cpu_percent || 0, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Memory */}
        <div className="card p-3 flex flex-col justify-between">
          <div className="text-xs font-medium text-muted flex items-center justify-between mb-1">
            <span>Memory Usage</span>
            <Layers size={13} className="text-primary" />
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight" style={{ color: (telemetry?.memory_percent || 0) > 85 ? 'var(--destructive)' : 'var(--foreground)' }}>
              {telemetry?.memory_percent.toFixed(1)} <span className="text-xs font-normal text-muted">%</span>
            </div>
            <div className="w-full bg-secondary h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (telemetry?.memory_percent || 0) > 85 ? 'bg-red-500' : (telemetry?.memory_percent || 0) > 65 ? 'bg-amber-400' : 'bg-primary'
                }`}
                style={{ width: `${Math.min(telemetry?.memory_percent || 0, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* DB Connection Pool Saturation */}
        <div className="card p-3 flex flex-col justify-between">
          <div className="text-xs font-medium text-muted flex items-center justify-between mb-1">
            <span>DB Connections</span>
            <Database size={13} className="text-warning" />
          </div>
          <div>
            <div
              className="text-xl font-bold tracking-tight"
              style={{
                color:
                  (telemetry?.db_connections_used || 0) / (telemetry?.db_connections_max || 50) > 0.85
                    ? 'var(--destructive)'
                    : (telemetry?.db_connections_used || 0) / (telemetry?.db_connections_max || 50) > 0.65
                    ? 'var(--warning)'
                    : 'var(--foreground)',
              }}
            >
              {telemetry?.db_connections_used}
              <span className="text-xs font-normal text-muted"> / {telemetry?.db_connections_max}</span>
            </div>
            <div className="w-full bg-secondary h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (telemetry?.db_connections_used || 0) / (telemetry?.db_connections_max || 50) > 0.85
                    ? 'bg-red-500'
                    : 'bg-emerald-400'
                }`}
                style={{
                  width: `${Math.min(
                    ((telemetry?.db_connections_used || 0) / (telemetry?.db_connections_max || 50)) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b mb-6" style={{ borderColor: 'var(--border)' }}>
        <button
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-foreground'
          }`}
          onClick={() => setActiveTab('overview')}
        >
          <Activity size={14} /> Telemetry Graphs & Overview
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'failures'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-foreground'
          }`}
          onClick={() => setActiveTab('failures')}
        >
          <ShieldAlert size={14} /> Recent Failure Reports ({incidents.length})
          {activeIncidentsCount > 0 && (
            <span className="badge badge-destructive text-[10px] px-1.5 py-0.2">
              {activeIncidentsCount} active
            </span>
          )}
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'dependencies'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-foreground'
          }`}
          onClick={() => setActiveTab('dependencies')}
        >
          <Layers size={14} /> Dependencies & Topology ({upstream.length + downstream.length})
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'logs'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-foreground'
          }`}
          onClick={() => setActiveTab('logs')}
        >
          <Terminal size={14} /> Live Logs ({detail?.logs.length || 0})
        </button>
      </div>

      {/* TAB 1: OVERVIEW & INTERACTIVE SVG TELEMETRY GRAPHS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Main Interactive SVG Telemetry Graph */}
          <div className="card p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Activity size={16} className="text-primary" />
                  Live Telemetry Time-Series
                </h3>
                <p className="text-xs text-muted">
                  Rolling historical window updating in real-time (last {historyPoints.length} snapshots)
                </p>
              </div>

              {/* Chart Metric Selector Pills */}
              <div className="flex items-center gap-1 p-1 bg-secondary rounded-lg border text-xs" style={{ borderColor: 'var(--border)' }}>
                <button
                  className={`px-2.5 py-1 rounded font-medium transition-all ${
                    chartMetric === 'latency' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted hover:text-foreground'
                  }`}
                  onClick={() => setChartMetric('latency')}
                >
                  Latency (ms)
                </button>
                <button
                  className={`px-2.5 py-1 rounded font-medium transition-all ${
                    chartMetric === 'error_rate' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted hover:text-foreground'
                  }`}
                  onClick={() => setChartMetric('error_rate')}
                >
                  Error Rate (%)
                </button>
                <button
                  className={`px-2.5 py-1 rounded font-medium transition-all ${
                    chartMetric === 'resources' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted hover:text-foreground'
                  }`}
                  onClick={() => setChartMetric('resources')}
                >
                  CPU & Memory
                </button>
                <button
                  className={`px-2.5 py-1 rounded font-medium transition-all ${
                    chartMetric === 'traffic' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted hover:text-foreground'
                  }`}
                  onClick={() => setChartMetric('traffic')}
                >
                  Throughput (RPS)
                </button>
              </div>
            </div>

            {/* SVG Chart */}
            <div className="relative w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-auto select-none"
                style={{ minWidth: '550px', maxHeight: '280px' }}
                onMouseLeave={() => setHoveredPointIndex(null)}
              >
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={
                        chartMetric === 'latency'
                          ? '#38bdf8'
                          : chartMetric === 'error_rate'
                          ? '#f87171'
                          : '#a78bfa'
                      }
                      stopOpacity="0.35"
                    />
                    <stop
                      offset="100%"
                      stopColor={
                        chartMetric === 'latency'
                          ? '#38bdf8'
                          : chartMetric === 'error_rate'
                          ? '#f87171'
                          : '#a78bfa'
                      }
                      stopOpacity="0.0"
                    />
                  </linearGradient>
                </defs>

                {/* Y-axis gridlines & labels */}
                {chartData.yTicks.map((tick, i) => (
                  <g key={i}>
                    <line
                      x1={padding.left}
                      y1={tick.y}
                      x2={chartWidth - padding.right}
                      y2={tick.y}
                      stroke="rgba(255,255,255,0.06)"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={padding.left - 8}
                      y={tick.y + 3}
                      textAnchor="end"
                      fontSize="10"
                      fill="var(--muted-foreground)"
                      fontFamily="monospace"
                    >
                      {tick.val < 1 ? tick.val.toFixed(2) : tick.val.toFixed(0)}
                      {chartData.unit}
                    </text>
                  </g>
                ))}

                {/* Threshold Reference Line */}
                {thresholdY != null && (
                  <g>
                    <line
                      x1={padding.left}
                      y1={thresholdY}
                      x2={chartWidth - padding.right}
                      y2={thresholdY}
                      stroke="#fbbf24"
                      strokeDasharray="4 4"
                      strokeWidth="1.2"
                    />
                    <text
                      x={chartWidth - padding.right}
                      y={thresholdY - 4}
                      textAnchor="end"
                      fontSize="10"
                      fill="#fbbf24"
                      fontWeight="bold"
                    >
                      Threshold: {chartData.thresholdVal}
                      {chartData.unit}
                    </text>
                  </g>
                )}

                {/* Area Fill */}
                {svgAreaPath && <path d={svgAreaPath} fill="url(#chartGradient)" />}

                {/* Primary Data Polyline */}
                {svgPath && (
                  <path
                    d={svgPath}
                    fill="none"
                    stroke={
                      chartMetric === 'latency'
                        ? '#38bdf8'
                        : chartMetric === 'error_rate'
                        ? '#ef4444'
                        : '#a78bfa'
                    }
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Points & Hover Interactivity */}
                {chartData.points.map((pt, idx) => (
                  <g key={idx}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={hoveredPointIndex === idx ? 5 : 2}
                      fill={
                        hoveredPointIndex === idx
                          ? '#ffffff'
                          : chartMetric === 'latency'
                          ? '#38bdf8'
                          : chartMetric === 'error_rate'
                          ? '#ef4444'
                          : '#a78bfa'
                      }
                      stroke="#0f172a"
                      strokeWidth={hoveredPointIndex === idx ? 2 : 1}
                      className="cursor-pointer transition-all"
                    />
                    {/* Invisible hover capture target */}
                    <rect
                      x={pt.x - graphWidth / chartData.points.length / 2}
                      y={padding.top}
                      width={graphWidth / chartData.points.length}
                      height={graphHeight}
                      fill="transparent"
                      onMouseEnter={() => setHoveredPointIndex(idx)}
                      className="cursor-pointer"
                    />
                  </g>
                ))}

                {/* Crosshair on Hover */}
                {hoveredPointIndex !== null && chartData.points[hoveredPointIndex] && (
                  <g pointerEvents="none">
                    <line
                      x1={chartData.points[hoveredPointIndex].x}
                      y1={padding.top}
                      x2={chartData.points[hoveredPointIndex].x}
                      y2={padding.top + graphHeight}
                      stroke="rgba(255,255,255,0.25)"
                      strokeDasharray="2 2"
                    />
                  </g>
                )}
              </svg>

              {/* Tooltip Overlay */}
              {hoveredPointIndex !== null && chartData.points[hoveredPointIndex] && (
                <div
                  className="absolute p-2 rounded-lg text-xs bg-popover text-popover-foreground border shadow-xl pointer-events-none"
                  style={{
                    left: `${Math.min(
                      Math.max(
                        (chartData.points[hoveredPointIndex].x / chartWidth) * 100,
                        10
                      ),
                      85
                    )}%`,
                    top: '12px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="font-semibold text-primary">
                    {chartData.points[hoveredPointIndex].raw < 1
                      ? chartData.points[hoveredPointIndex].raw.toFixed(4)
                      : chartData.points[hoveredPointIndex].raw.toFixed(1)}{' '}
                    {chartData.unit}
                  </div>
                  <div className="text-[10px] text-muted">
                    {new Date(chartData.points[hoveredPointIndex].timestamp).toLocaleTimeString()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Health & Telemetry Breakdown Grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Health & Diagnostic Summary */}
            <div className="card p-4">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Shield size={15} style={{ color: 'var(--primary)' }} />
                Service Health & Operational Status
              </h4>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-secondary">
                  <span className="text-muted">Process State</span>
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} /> Active & Monitored
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-secondary">
                  <span className="text-muted">Autonomous Detection</span>
                  <span className="font-semibold text-primary">ORVIX Watcher (5s loop)</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-secondary">
                  <span className="text-muted">Queue Backlog</span>
                  <span className={(telemetry?.queue_depth || 0) > 100 ? 'text-destructive font-bold' : 'text-foreground'}>
                    {telemetry?.queue_depth} messages
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-secondary">
                  <span className="text-muted">Active Injected Faults</span>
                  <span className={activeFailures.length > 0 ? 'text-destructive font-bold' : 'text-emerald-400'}>
                    {activeFailures.length > 0 ? `${activeFailures.length} Active Failure(s)` : 'None (Baseline Nominal)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions & Chaos Simulation */}
            <div className="card p-4">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Zap size={15} style={{ color: 'var(--warning)' }} />
                Service Chaos Simulation Controls
              </h4>
              <p className="text-xs text-muted mb-4">
                Test ORVIX self-healing agent by simulating infrastructure faults against {serviceName}.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn btn-outline btn-xs flex items-center justify-center gap-1.5 py-2"
                  onClick={() => {
                    setChaosType('database');
                    setChaosSeverity(0.85);
                    setChaosModalOpen(true);
                  }}
                >
                  <Database size={12} className="text-amber-400" /> DB Pool Exhaustion
                </button>
                <button
                  className="btn btn-outline btn-xs flex items-center justify-center gap-1.5 py-2"
                  onClick={() => {
                    setChaosType('latency');
                    setChaosSeverity(0.8);
                    setChaosModalOpen(true);
                  }}
                >
                  <Clock size={12} className="text-sky-400" /> Latency Spike (p99)
                </button>
                <button
                  className="btn btn-outline btn-xs flex items-center justify-center gap-1.5 py-2"
                  onClick={() => {
                    setChaosType('service_down');
                    setChaosSeverity(1.0);
                    setChaosModalOpen(true);
                  }}
                >
                  <XCircle size={12} className="text-red-400" /> Container Down (500)
                </button>
                <button
                  className="btn btn-outline btn-xs flex items-center justify-center gap-1.5 py-2"
                  onClick={() => {
                    setChaosType('queue');
                    setChaosSeverity(0.75);
                    setChaosModalOpen(true);
                  }}
                >
                  <Layers size={12} className="text-violet-400" /> Queue Consumer Lag
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RECENT FAILURE & INCIDENT REPORTS */}
      {activeTab === 'failures' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <ShieldAlert size={16} className="text-destructive" />
                Failure & Incident Reports for {serviceName}
              </h3>
              <p className="text-xs text-muted">
                Complete audit history of anomalies detected, AI diagnoses, and autonomous remediation outcomes
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-secondary p-1 rounded-lg border text-xs" style={{ borderColor: 'var(--border)' }}>
              <button
                className={`px-3 py-1 rounded font-medium ${
                  incidentFilter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
                }`}
                onClick={() => setIncidentFilter('all')}
              >
                All ({incidents.length})
              </button>
              <button
                className={`px-3 py-1 rounded font-medium ${
                  incidentFilter === 'active' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
                }`}
                onClick={() => setIncidentFilter('active')}
              >
                Active / Awaiting ({activeIncidentsCount})
              </button>
              <button
                className={`px-3 py-1 rounded font-medium ${
                  incidentFilter === 'resolved' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
                }`}
                onClick={() => setIncidentFilter('resolved')}
              >
                Resolved ({incidents.length - activeIncidentsCount})
              </button>
            </div>
          </div>

          {filteredIncidents.length === 0 ? (
            <div className="card p-8 text-center border-dashed">
              <CheckCircle2 size={36} className="text-emerald-400 mx-auto mb-3" />
              <div className="font-semibold text-base mb-1">No Failure Incidents Found</div>
              <p className="text-xs text-muted max-w-md mx-auto mb-4">
                {incidentFilter === 'all'
                  ? `No incidents have occurred on ${serviceName}. The service is currently operating stably within nominal boundaries.`
                  : `No ${incidentFilter} incidents match this filter.`}
              </p>
              <button
                className="btn btn-primary btn-sm mx-auto flex items-center gap-1"
                onClick={() => {
                  setChaosType('database');
                  setChaosModalOpen(true);
                }}
              >
                <Zap size={14} /> Inject Test Failure to Generate Report
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredIncidents.map(inc => {
                const isResolved = inc.status === 'RESOLVED';
                const isAwaiting = inc.status === 'AWAITING_APPROVAL';
                return (
                  <div
                    key={inc.id}
                    className="card p-4 transition-all hover:border-primary border"
                    style={{ borderColor: isAwaiting ? 'rgba(251, 191, 36, 0.5)' : 'var(--border)' }}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`badge text-xs font-bold uppercase ${
                              inc.severity === 'CRITICAL'
                                ? 'badge-destructive'
                                : inc.severity === 'HIGH'
                                ? 'badge-destructive'
                                : 'badge-warning'
                            }`}
                          >
                            {inc.severity}
                          </span>
                          <span
                            className={`badge text-xs uppercase ${
                              isResolved
                                ? 'badge-success'
                                : isAwaiting
                                ? 'badge-warning font-bold'
                                : 'badge-outline'
                            }`}
                          >
                            {inc.status.replace('_', ' ')}
                          </span>
                          <h4 className="font-semibold text-sm mb-0">{inc.title}</h4>
                        </div>
                        <div className="text-xs text-muted mt-1">
                          Incident ID: <span className="font-mono text-[11px]">{inc.id}</span> •
                          Detected: {new Date(inc.detected_at).toLocaleString()}
                        </div>
                      </div>

                      <Link
                        to={`/incidents/${inc.id}`}
                        className="btn btn-outline btn-xs flex items-center gap-1 text-primary self-start md:self-auto"
                      >
                        Open Incident Pipeline <ArrowRight size={12} />
                      </Link>
                    </div>

                    {/* Report Breakdown: Symptoms, Root Cause Diagnosis, Remediation & Verification */}
                    <div className="grid md:grid-cols-3 gap-4 pt-3 text-xs">
                      {/* Column 1: Symptoms & Detection */}
                      <div className="p-2.5 rounded bg-secondary">
                        <div className="font-semibold text-muted uppercase text-[10px] tracking-wider mb-1.5 flex items-center gap-1">
                          <Activity size={12} /> Observed Symptoms
                        </div>
                        {inc.symptoms?.length > 0 ? (
                          <ul className="list-disc pl-4 space-y-1">
                            {inc.symptoms.map((s, idx) => (
                              <li key={idx}>{s}</li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-muted">{inc.description || 'Threshold anomalies observed.'}</div>
                        )}
                      </div>

                      {/* Column 2: AI Root Cause Diagnosis */}
                      <div className="p-2.5 rounded bg-secondary">
                        <div className="font-semibold text-muted uppercase text-[10px] tracking-wider mb-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Shield size={12} /> AI Diagnosis
                          </span>
                          {inc.confidence != null && (
                            <span className="text-primary font-bold">
                              {(inc.confidence * 100).toFixed(0)}% Confidence
                            </span>
                          )}
                        </div>
                        <div className="font-medium text-foreground leading-relaxed">
                          {inc.probable_root_cause || 'Root cause diagnosis in progress.'}
                        </div>
                      </div>

                      {/* Column 3: Autonomous Remediation & Verification */}
                      <div className="p-2.5 rounded bg-secondary">
                        <div className="font-semibold text-muted uppercase text-[10px] tracking-wider mb-1.5 flex items-center gap-1">
                          <CheckCircle2 size={12} /> Remediation & Verification
                        </div>
                        {inc.remediation_plan?.actions?.length > 0 ? (
                          <div>
                            <div className="mb-1">
                              Action: <strong>{inc.remediation_plan.actions[0].tool}</strong>
                              {inc.remediation_plan.actions[0].authorization && (
                                <span className="ml-1 text-muted">
                                  ({inc.remediation_plan.actions[0].authorization})
                                </span>
                              )}
                            </div>
                            <div className="text-muted">
                              Verification:{' '}
                              <strong className={inc.verification?.passed ? 'text-emerald-400' : 'text-amber-400'}>
                                {inc.verification?.passed ? 'PASSED (Recovered)' : isResolved ? 'RESOLVED' : 'IN PROGRESS'}
                              </strong>
                            </div>
                          </div>
                        ) : (
                          <div className="text-muted">
                            {isResolved ? 'Recovered and verified.' : 'Remediation pipeline active.'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DEPENDENCIES & TOPOLOGY */}
      {activeTab === 'dependencies' && (
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Layers size={16} className="text-primary" />
              Service Dependency Architecture
            </h3>
            <p className="text-xs text-muted">
              Live dependency links and downstream consumer impact topology
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Upstream Dependencies */}
            <div className="card p-4">
              <h4 className="font-semibold text-sm mb-1 flex items-center justify-between">
                <span>Upstream Dependencies (Outgoing Calls)</span>
                <span className="badge badge-outline text-xs">{upstream.length}</span>
              </h4>
              <p className="text-xs text-muted mb-4">
                Services that <strong>{serviceName}</strong> depends on to process requests.
              </p>

              {upstream.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted border border-dashed rounded-lg">
                  No upstream service dependencies. This service acts as an independent root tier.
                </div>
              ) : (
                <div className="space-y-2">
                  {upstream.map((dep: DependencyServiceInfo) => (
                    <div
                      key={dep.name}
                      className="p-3 rounded-lg border bg-secondary flex items-center justify-between hover:border-primary transition-all cursor-pointer"
                      onClick={() => navigate(`/services/${dep.name}`)}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${dep.healthy ? 'bg-emerald-400' : 'bg-red-500 animate-pulse'}`} />
                        <div>
                          <div className="font-semibold text-xs text-foreground flex items-center gap-1">
                            {dep.name} <ExternalLink size={11} className="text-muted" />
                          </div>
                          <div className="text-[11px] text-muted">
                            Latency: {dep.latency_ms.toFixed(0)}ms • Errors: {(dep.error_rate * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                      <span className={`badge text-[10px] ${dep.healthy ? 'badge-success' : 'badge-destructive'}`}>
                        {dep.healthy ? 'HEALTHY' : 'DEGRADED'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Downstream Consumers */}
            <div className="card p-4">
              <h4 className="font-semibold text-sm mb-1 flex items-center justify-between">
                <span>Downstream Consumers (Incoming Traffic)</span>
                <span className="badge badge-outline text-xs">{downstream.length}</span>
              </h4>
              <p className="text-xs text-muted mb-4">
                Services that call <strong>{serviceName}</strong>. Failure here may cascade downstream.
              </p>

              {downstream.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted border border-dashed rounded-lg">
                  No downstream internal service consumers registered.
                </div>
              ) : (
                <div className="space-y-2">
                  {downstream.map((dep: DependencyServiceInfo) => (
                    <div
                      key={dep.name}
                      className="p-3 rounded-lg border bg-secondary flex items-center justify-between hover:border-primary transition-all cursor-pointer"
                      onClick={() => navigate(`/services/${dep.name}`)}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${dep.healthy ? 'bg-emerald-400' : 'bg-red-500 animate-pulse'}`} />
                        <div>
                          <div className="font-semibold text-xs text-foreground flex items-center gap-1">
                            {dep.name} <ExternalLink size={11} className="text-muted" />
                          </div>
                          <div className="text-[11px] text-muted">
                            Latency: {dep.latency_ms.toFixed(0)}ms • Errors: {(dep.error_rate * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                      <span className={`badge text-[10px] ${dep.healthy ? 'badge-success' : 'badge-destructive'}`}>
                        {dep.healthy ? 'HEALTHY' : 'DEGRADED'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LIVE SERVICE LOGS */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Terminal size={16} className="text-primary" />
                Live Synthetic Log Console
              </h3>
              <p className="text-xs text-muted">
                Recent operational output synthesized for {serviceName}
              </p>
            </div>

            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Search log messages..."
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                className="pl-8 pr-3 py-1 rounded text-xs bg-secondary border"
                style={{ borderColor: 'var(--border)' }}
              />
            </div>
          </div>

          <div
            className="p-3 rounded-lg font-mono text-xs overflow-y-auto max-h-[420px] space-y-1.5"
            style={{
              background: '#090d16',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#e2e8f0',
            }}
          >
            {filteredLogs.length === 0 ? (
              <div className="p-4 text-center text-muted">No logs matching query.</div>
            ) : (
              filteredLogs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2.5 hover:bg-white/[0.03] p-1 rounded">
                  <span className="text-muted text-[11px] flex-shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                      log.level === 'ERROR'
                        ? 'bg-red-500/20 text-red-400'
                        : log.level === 'WARN'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="leading-relaxed flex-1 break-words">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* CHAOS INJECTION MODAL */}
      {chaosModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div
            className="card p-5 max-w-md w-full shadow-2xl border animate-scaleUp"
            style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
          >
            <div className="flex items-center justify-between mb-4 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="font-semibold text-base flex items-center gap-2">
                <Zap size={16} className="text-warning" />
                Inject Chaos Test on {serviceName}
              </div>
              <button
                className="btn btn-ghost btn-xs p-1"
                onClick={() => setChaosModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-muted font-medium mb-1">Failure Kind</label>
                <select
                  value={chaosType}
                  onChange={e => setChaosType(e.target.value)}
                  className="w-full p-2 rounded border bg-secondary text-foreground text-xs"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <option value="database">Database Connection Exhaustion</option>
                  <option value="latency">Latency Spike (p99 Exceeded)</option>
                  <option value="service_down">Container Crash / Down (500)</option>
                  <option value="queue">Queue Message Backlog Lag</option>
                  <option value="cpu">CPU Exhaustion Spike</option>
                  <option value="memory">Memory Leak Pressure</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-muted font-medium">Severity Intensity</label>
                  <span className="font-bold text-primary">{(chaosSeverity * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={chaosSeverity}
                  onChange={e => setChaosSeverity(parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              <div className="p-2.5 rounded bg-secondary text-muted leading-relaxed">
                ORVIX Watcher will detect this threshold breach on its 5-second observation loop, open an incident, run AI root cause diagnosis, and execute an autonomous remediation runbook.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <button
                className="btn btn-ghost btn-sm text-xs"
                onClick={() => setChaosModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-destructive btn-sm text-xs flex items-center gap-1.5"
                onClick={handleInjectFailure}
                disabled={actionLoading}
              >
                <Play size={12} /> Inject Failure Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
