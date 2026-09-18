import { useState, useRef, useCallback, useEffect } from 'react';
import {
  FlaskConical, Loader2, CheckCircle2, XCircle, Clock, Cpu,
  Zap, BarChart3, Trophy, AlertTriangle, FileText, ChevronDown,
  ChevronRight, Layers, BrainCircuit, ArrowUpDown
} from 'lucide-react';
import { API_BASE } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

interface ScenarioResult {
  model: string;
  scenario_id: string;
  diagnosis: string;
  confidence: number;
  supporting_evidence: string[];
  alternative_causes: any[];
  affected_services: string[];
  time_seconds: number;
  tokens: TokenUsage;
  success: boolean;
  error: string | null;
}

interface ModelSummary {
  label: string;
  provider: string;
  model: string;
  total_time_seconds: number;
  avg_time_per_scenario: number;
  total_tokens: TokenUsage;
  scenarios_analyzed: number;
  successful_analyses: number;
  failed_analyses: number;
  avg_confidence: number;
  anomalies_detected: number;
  problems_solved: number;
  results: ScenarioResult[];
}

interface Comparison {
  fastest_model: { label: string; time: number };
  most_confident_model: { label: string; confidence: number };
  most_economical_model: { label: string; tokens: number };
  most_anomalies_model: { label: string; count: number };
  most_problems_solved: { label: string; count: number };
  leaderboard: {
    label: string;
    score: number;
    avg_confidence: number;
    total_time: number;
    total_tokens: number;
    anomalies: number;
    problems_solved: number;
  }[];
}

interface Scenario {
  scenario_id: string;
  title: string;
  description: string;
  severity: string;
  affected_components: string[];
  symptoms: string[];
  anomaly_count: number;
}

interface TestResults {
  status: string;
  dataset: string;
  total_time_seconds: number;
  dataset_summary: {
    total_log_entries: number;
    level_distribution: Record<string, number>;
    unique_event_templates: number;
    time_range: { start: string | null; end: string | null };
    scenarios_detected: number;
  };
  scenarios: Scenario[];
  model_results: ModelSummary[];
  comparison: Comparison;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const TestingPage = () => {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestResults | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'overview' | 'comparison' | 'scenarios' | 'details'>('overview');
  const abortRef = useRef<AbortController | null>(null);

  const runTest = useCallback(async () => {
    setRunning(true);
    setResults(null);
    setProgress([]);
    setActiveTab('overview');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/api/testing/run-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset: 'openstack_logs.csv' }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        setProgress(prev => [...prev, `❌ Error: ${response.statusText}`]);
        setRunning(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            switch (event.type) {
              case 'status':
                setProgress(prev => [...prev, `📋 ${event.message}`]);
                break;
              case 'dataset_parsed':
                setProgress(prev => [...prev, `✅ Parsed ${event.total_entries.toLocaleString()} log entries → ${event.scenarios_detected} scenarios detected`]);
                break;
              case 'models_configured':
                setProgress(prev => [...prev, `🤖 ${event.count} models configured: ${event.models.join(', ')}`]);
                break;
              case 'model_start':
                setProgress(prev => [...prev, `🔄 Testing with ${event.model}...`]);
                break;
              case 'scenario_start':
                setProgress(prev => [...prev, `  ⏳ ${event.model}: analyzing "${event.scenario}"...`]);
                break;
              case 'scenario_complete':
                const r = event.result;
                const icon = r.success ? '✅' : '❌';
                setProgress(prev => [...prev, `  ${icon} ${r.model}: confidence=${(r.confidence * 100).toFixed(1)}% (${r.time_seconds}s)`]);
                break;
              case 'model_complete':
                setProgress(prev => [...prev, `🏁 ${event.summary.label} complete — ${event.summary.total_time_seconds}s total, ${event.summary.total_tokens.total.toLocaleString()} tokens`]);
                break;
              case 'complete':
                setResults(event as TestResults);
                setProgress(prev => [...prev, `\n🎉 All tests completed in ${event.total_time_seconds}s`]);
                break;
              case 'error':
                setProgress(prev => [...prev, `❌ ${event.message}`]);
                break;
            }
          } catch { /* ignore unparseable lines */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setProgress(prev => [...prev, `❌ Connection error: ${err.message}`]);
      }
    } finally {
      setRunning(false);
    }
  }, []);

  // Auto-load latest results on page mount, or run fresh test if none available
  const hasRun = useRef(false);
  useEffect(() => {
    if (!hasRun.current) {
      hasRun.current = true;
      // First fetch cached / latest results so analytics show instantly
      fetch(`${API_BASE}/api/testing/latest`)
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (data && data.model_results && data.model_results.length > 0) {
            setResults(data);
            setProgress([`⚡ Loaded evaluation results for openstack_logs.csv (${data.model_results.length} models, ${data.scenarios?.length || 9} scenarios)`]);
          } else {
            runTest();
          }
        })
        .catch(() => {
          runTest();
        });
    }
  }, [runTest]);

  const toggleScenario = (id: string) => {
    setExpandedScenarios(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'openai': return '#10b981';
      case 'gemini': return '#3b82f6';
      case 'openrouter': return '#8b5cf6';
      default: return '#64748b';
    }
  };

  const getSeverityClass = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'CRITICAL': return 'severity-critical';
      case 'HIGH': return 'severity-high';
      case 'MEDIUM': return 'severity-medium';
      default: return 'severity-low';
    }
  };

  return (
    <div className="testing-page">
      {/* Header */}
      <div className="testing-header">
        <div className="testing-header-left">
          <div className="testing-icon-wrapper">
            <FlaskConical size={28} />
          </div>
          <div>
            <h1>System Testing</h1>
            <p className="testing-subtitle">Multi-model comparative analysis on real-world log datasets</p>
          </div>
        </div>
        <div className="testing-header-status">
          {running ? (
            <span className="testing-status-badge running"><Loader2 size={14} className="spin" /> Analyzing...</span>
          ) : results ? (
            <span className="testing-status-badge complete"><CheckCircle2 size={14} /> Complete — {results.total_time_seconds}s</span>
          ) : null}
        </div>
      </div>

      {/* Progress Log */}
      {progress.length > 0 && (
        <div className="testing-progress-panel">
          <div className="testing-progress-header">
            <FileText size={16} />
            <span>Test Execution Log</span>
            {running && <Loader2 size={14} className="spin" />}
          </div>
          <div className="testing-progress-body">
            {progress.map((msg, i) => (
              <div key={i} className="progress-line">{msg}</div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <>
          {/* Tab Navigation */}
          <div className="testing-tabs">
            {(['overview', 'comparison', 'scenarios', 'details'] as const).map(tab => (
              <button
                key={tab}
                className={`testing-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
                id={`tab-${tab}`}
              >
                {tab === 'overview' && <BarChart3 size={15} />}
                {tab === 'comparison' && <ArrowUpDown size={15} />}
                {tab === 'scenarios' && <AlertTriangle size={15} />}
                {tab === 'details' && <Layers size={15} />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="testing-overview">
              {/* Summary Cards */}
              <div className="testing-summary-grid">
                <div className="testing-stat-card">
                  <div className="stat-icon" style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                    <FileText size={20} />
                  </div>
                  <div className="stat-content">
                    <div className="stat-value">{results.dataset_summary.total_log_entries.toLocaleString()}</div>
                    <div className="stat-label">Log Entries Parsed</div>
                  </div>
                </div>
                <div className="testing-stat-card">
                  <div className="stat-icon" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                    <AlertTriangle size={20} />
                  </div>
                  <div className="stat-content">
                    <div className="stat-value">{results.dataset_summary.scenarios_detected}</div>
                    <div className="stat-label">Scenarios Detected</div>
                  </div>
                </div>
                <div className="testing-stat-card">
                  <div className="stat-icon" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                    <BrainCircuit size={20} />
                  </div>
                  <div className="stat-content">
                    <div className="stat-value">{results.model_results.length}</div>
                    <div className="stat-label">Models Tested</div>
                  </div>
                </div>
                <div className="testing-stat-card">
                  <div className="stat-icon" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>
                    <Clock size={20} />
                  </div>
                  <div className="stat-content">
                    <div className="stat-value">{results.total_time_seconds}s</div>
                    <div className="stat-label">Total Time</div>
                  </div>
                </div>
              </div>

              {/* Dataset Info */}
              <div className="testing-card">
                <h3><FileText size={17} /> Dataset Summary</h3>
                <div className="testing-dataset-info">
                  <div className="dataset-info-row">
                    <span className="dataset-info-label">Dataset</span>
                    <span className="dataset-info-value">{results.dataset}</span>
                  </div>
                  <div className="dataset-info-row">
                    <span className="dataset-info-label">Time Range</span>
                    <span className="dataset-info-value">
                      {results.dataset_summary.time_range.start?.split('T')[0] ?? 'N/A'} → {results.dataset_summary.time_range.end?.split('T')[0] ?? 'N/A'}
                    </span>
                  </div>
                  <div className="dataset-info-row">
                    <span className="dataset-info-label">Event Templates</span>
                    <span className="dataset-info-value">{results.dataset_summary.unique_event_templates}</span>
                  </div>
                  <div className="dataset-info-row">
                    <span className="dataset-info-label">Log Levels</span>
                    <span className="dataset-info-value">
                      {Object.entries(results.dataset_summary.level_distribution).map(([level, count]) => (
                        <span key={level} className={`level-badge level-${level.toLowerCase()}`}>
                          {level}: {count.toLocaleString()}
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Leaderboard */}
              {results.comparison.leaderboard && (
                <div className="testing-card">
                  <h3><Trophy size={17} /> Model Leaderboard</h3>
                  <div className="testing-leaderboard">
                    {results.comparison.leaderboard.map((entry, i) => (
                      <div key={entry.label} className={`leaderboard-entry ${i === 0 ? 'winner' : ''}`}>
                        <div className="leaderboard-rank">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                        </div>
                        <div className="leaderboard-info">
                          <div className="leaderboard-name">{entry.label}</div>
                          <div className="leaderboard-stats">
                            <span><Clock size={12} /> {entry.total_time}s</span>
                            <span><Cpu size={12} /> {entry.total_tokens.toLocaleString()} tokens</span>
                            <span><Zap size={12} /> {(entry.avg_confidence * 100).toFixed(1)}% conf.</span>
                          </div>
                        </div>
                        <div className="leaderboard-score">
                          <div className="score-value">{entry.score.toFixed(1)}</div>
                          <div className="score-label">score</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Comparison Tab */}
          {activeTab === 'comparison' && (
            <div className="testing-comparison">
              {/* Awards */}
              <div className="testing-awards-grid">
                <div className="award-card">
                  <Zap size={24} className="award-icon" style={{ color: '#f59e0b' }} />
                  <div className="award-title">Fastest</div>
                  <div className="award-winner">{results.comparison.fastest_model.label}</div>
                  <div className="award-stat">{results.comparison.fastest_model.time}s</div>
                </div>
                <div className="award-card">
                  <BrainCircuit size={24} className="award-icon" style={{ color: '#3b82f6' }} />
                  <div className="award-title">Most Confident</div>
                  <div className="award-winner">{results.comparison.most_confident_model.label}</div>
                  <div className="award-stat">{(results.comparison.most_confident_model.confidence * 100).toFixed(1)}%</div>
                </div>
                <div className="award-card">
                  <Cpu size={24} className="award-icon" style={{ color: '#10b981' }} />
                  <div className="award-title">Most Economical</div>
                  <div className="award-winner">{results.comparison.most_economical_model.label}</div>
                  <div className="award-stat">{results.comparison.most_economical_model.tokens.toLocaleString()} tokens</div>
                </div>
                <div className="award-card">
                  <AlertTriangle size={24} className="award-icon" style={{ color: '#ef4444' }} />
                  <div className="award-title">Most Anomalies</div>
                  <div className="award-winner">{results.comparison.most_anomalies_model.label}</div>
                  <div className="award-stat">{results.comparison.most_anomalies_model.count} detected</div>
                </div>
              </div>

              {/* Comparison Table */}
              <div className="testing-card">
                <h3><ArrowUpDown size={17} /> Model Comparison</h3>
                <div className="testing-table-wrapper">
                  <table className="testing-table" id="comparison-table">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>Time</th>
                        <th>Avg Time/Scenario</th>
                        <th>Prompt Tokens</th>
                        <th>Completion Tokens</th>
                        <th>Total Tokens</th>
                        <th>Avg Confidence</th>
                        <th>Anomalies</th>
                        <th>Problems Solved</th>
                        <th>Success Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.model_results.map(m => (
                        <tr key={m.label}>
                          <td>
                            <div className="model-cell">
                              <div className="model-dot" style={{ background: getProviderColor(m.provider) }} />
                              <div>
                                <div className="model-cell-name">{m.label}</div>
                                <div className="model-cell-id">{m.model}</div>
                              </div>
                            </div>
                          </td>
                          <td><span className="mono">{m.total_time_seconds}s</span></td>
                          <td><span className="mono">{m.avg_time_per_scenario}s</span></td>
                          <td><span className="mono">{m.total_tokens.prompt.toLocaleString()}</span></td>
                          <td><span className="mono">{m.total_tokens.completion.toLocaleString()}</span></td>
                          <td><strong className="mono">{m.total_tokens.total.toLocaleString()}</strong></td>
                          <td>
                            <div className="confidence-cell">
                              <div className="confidence-bar-bg">
                                <div
                                  className="confidence-bar-fill"
                                  style={{
                                    width: `${m.avg_confidence * 100}%`,
                                    background: m.avg_confidence > 0.7 ? 'var(--success)' : m.avg_confidence > 0.4 ? 'var(--warning)' : 'var(--destructive)'
                                  }}
                                />
                              </div>
                              <span className="mono">{(m.avg_confidence * 100).toFixed(1)}%</span>
                            </div>
                          </td>
                          <td><span className="mono">{m.anomalies_detected}</span></td>
                          <td><span className="mono">{m.problems_solved}</span></td>
                          <td>
                            <span className={`status-badge ${m.failed_analyses === 0 ? 'success' : 'warning'}`}>
                              {m.successful_analyses}/{m.scenarios_analyzed}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Visual Bars */}
              <div className="testing-bars-grid">
                <div className="testing-card">
                  <h3><Clock size={17} /> Response Time</h3>
                  {results.model_results.map(m => {
                    const maxTime = Math.max(...results.model_results.map(r => r.total_time_seconds));
                    return (
                      <div key={m.label} className="bar-row">
                        <div className="bar-label">{m.label}</div>
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{
                              width: `${(m.total_time_seconds / maxTime) * 100}%`,
                              background: getProviderColor(m.provider),
                            }}
                          />
                        </div>
                        <div className="bar-value">{m.total_time_seconds}s</div>
                      </div>
                    );
                  })}
                </div>
                <div className="testing-card">
                  <h3><Cpu size={17} /> Token Usage</h3>
                  {results.model_results.map(m => {
                    const maxTokens = Math.max(...results.model_results.map(r => r.total_tokens.total));
                    return (
                      <div key={m.label} className="bar-row">
                        <div className="bar-label">{m.label}</div>
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{
                              width: `${(m.total_tokens.total / maxTokens) * 100}%`,
                              background: getProviderColor(m.provider),
                            }}
                          />
                        </div>
                        <div className="bar-value">{m.total_tokens.total.toLocaleString()}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Scenarios Tab */}
          {activeTab === 'scenarios' && (
            <div className="testing-scenarios">
              {results.scenarios.map(scenario => (
                <div key={scenario.scenario_id} className="scenario-card">
                  <div
                    className="scenario-header"
                    onClick={() => toggleScenario(scenario.scenario_id)}
                  >
                    <div className="scenario-header-left">
                      {expandedScenarios.has(scenario.scenario_id) ?
                        <ChevronDown size={18} /> : <ChevronRight size={18} />
                      }
                      <span className={`severity-dot ${getSeverityClass(scenario.severity)}`} />
                      <div>
                        <div className="scenario-title">{scenario.title}</div>
                        <div className="scenario-meta">
                          <span className={`severity-badge ${getSeverityClass(scenario.severity)}`}>
                            {scenario.severity}
                          </span>
                          <span>{scenario.anomaly_count} anomalies</span>
                          <span>{scenario.affected_components.length} components</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {expandedScenarios.has(scenario.scenario_id) && (
                    <div className="scenario-body">
                      <p className="scenario-description">{scenario.description}</p>

                      <div className="scenario-symptoms">
                        <h4>Symptoms</h4>
                        <ul>
                          {scenario.symptoms.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>

                      <div className="scenario-components">
                        <h4>Affected Components</h4>
                        <div className="component-tags">
                          {scenario.affected_components.map(c => (
                            <span key={c} className="component-tag">{c}</span>
                          ))}
                        </div>
                      </div>

                      {/* Per-model diagnoses for this scenario */}
                      <div className="scenario-diagnoses">
                        <h4>Model Diagnoses</h4>
                        {results.model_results.map(m => {
                          const scenarioResult = m.results.find(r => r.scenario_id === scenario.scenario_id);
                          if (!scenarioResult) return null;
                          return (
                            <div key={m.label} className="diagnosis-card">
                              <div className="diagnosis-header">
                                <div className="model-dot" style={{ background: getProviderColor(m.provider) }} />
                                <span className="diagnosis-model-name">{m.label}</span>
                                {scenarioResult.success ? (
                                  <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
                                ) : (
                                  <XCircle size={14} style={{ color: 'var(--destructive)' }} />
                                )}
                                <span className="diagnosis-time">{scenarioResult.time_seconds}s</span>
                                <span className="diagnosis-tokens">{scenarioResult.tokens.total.toLocaleString()} tokens</span>
                              </div>
                              <div className="diagnosis-content">
                                <div className="diagnosis-text">{scenarioResult.diagnosis}</div>
                                <div className="diagnosis-confidence">
                                  <div className="confidence-bar-bg">
                                    <div
                                      className="confidence-bar-fill"
                                      style={{
                                        width: `${scenarioResult.confidence * 100}%`,
                                        background: scenarioResult.confidence > 0.7 ? 'var(--success)' : scenarioResult.confidence > 0.4 ? 'var(--warning)' : 'var(--destructive)'
                                      }}
                                    />
                                  </div>
                                  <span>{(scenarioResult.confidence * 100).toFixed(1)}% confidence</span>
                                </div>
                              </div>
                              {scenarioResult.error && (
                                <div className="diagnosis-error">⚠️ {scenarioResult.error}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="testing-details">
              {results.model_results.map(m => (
                <div key={m.label} className="testing-card model-detail-card">
                  <div className="model-detail-header">
                    <div className="model-dot-lg" style={{ background: getProviderColor(m.provider) }} />
                    <div>
                      <h3>{m.label}</h3>
                      <span className="model-id">{m.model}</span>
                    </div>
                    <div className="model-detail-stats">
                      <div className="mds-item">
                        <Clock size={14} />
                        <span>{m.total_time_seconds}s</span>
                      </div>
                      <div className="mds-item">
                        <Cpu size={14} />
                        <span>{m.total_tokens.total.toLocaleString()} tokens</span>
                      </div>
                      <div className="mds-item">
                        <span className={`status-badge ${m.failed_analyses === 0 ? 'success' : 'warning'}`}>
                          {m.successful_analyses}/{m.scenarios_analyzed} passed
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="model-detail-grid">
                    <div className="model-metric">
                      <div className="model-metric-value">{m.avg_time_per_scenario}s</div>
                      <div className="model-metric-label">Avg Time / Scenario</div>
                    </div>
                    <div className="model-metric">
                      <div className="model-metric-value">{(m.avg_confidence * 100).toFixed(1)}%</div>
                      <div className="model-metric-label">Avg Confidence</div>
                    </div>
                    <div className="model-metric">
                      <div className="model-metric-value">{m.anomalies_detected}</div>
                      <div className="model-metric-label">Anomalies Detected</div>
                    </div>
                    <div className="model-metric">
                      <div className="model-metric-value">{m.problems_solved}</div>
                      <div className="model-metric-label">Problems Solved</div>
                    </div>
                  </div>

                  <div className="model-results-list">
                    <h4>Scenario Results</h4>
                    {m.results.map(r => (
                      <div key={r.scenario_id} className={`model-result-row ${r.success ? '' : 'failed'}`}>
                        <div className="result-status">
                          {r.success ? <CheckCircle2 size={16} style={{ color: 'var(--success)' }} /> : <XCircle size={16} style={{ color: 'var(--destructive)' }} />}
                        </div>
                        <div className="result-info">
                          <div className="result-scenario-id">{r.scenario_id}</div>
                          <div className="result-diagnosis">{r.diagnosis.slice(0, 150)}{r.diagnosis.length > 150 ? '...' : ''}</div>
                        </div>
                        <div className="result-metrics">
                          <span className="mono">{(r.confidence * 100).toFixed(1)}%</span>
                          <span className="mono">{r.time_seconds}s</span>
                          <span className="mono">{r.tokens.total.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Loading State */}
      {!results && (
        <div className="testing-empty-state">
          <div className="empty-icon-wrapper">
            <Loader2 size={48} className="spin" />
          </div>
          <h2>{running ? 'Running Model Evaluation' : 'Loading Evaluation Analytics'}</h2>
          <p>
            {running
              ? 'Evaluating log anomalies and generating comparative benchmarks across OpenAI, Gemini, and DeepSeek...'
              : 'Connecting to the testing engine to retrieve benchmark analytics...'}
          </p>
        </div>
      )}
    </div>
  );
};
