export interface Service {
  id: string;
  name: string;
  description: string;
  tier: string;
  owner_team: string;
  tags: string[];
}

export interface SimulatedService {
  healthy: boolean;
  latency_ms: number;
  error_rate: number;
  throughput_rps: number;
  cpu_percent: number;
  memory_percent: number;
  db_connections_used: number;
  db_connections_max: number;
  queue_depth: number;
  active_failures: string[];
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  affected_services: string[];
  symptoms: string[];
  evidence: any;
  probable_root_cause: string;
  confidence: number;
  alternative_causes: string[];
  remediation_plan: any;
  verification: any;
  impact: string;
  owner: string;
  correlation_key: string;
  duplicate_of: string | null;
  detected_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentEvent {
  id: string;
  stage: string;
  message: string;
  data: any;
  created_at: string;
}

export interface Approval {
  id: string;
  incident_id: string;
  action_id: string;
  risk_level: string;
  requested_action: {
    tool: string;
    target: string;
    reason: string;
    arguments?: any;
    risk_level?: string;
  };
  decision: string;
  approver: string | null;
  reason: string;
  expires_at: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface EventData {
  type: string;
  timestamp: string;
  payload: any;
}

export interface Tool {
  name: string;
  description: string;
  risk_level: string;
  input_schema: any;
}

export interface Notification {
  id: string;
  channel: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
}

export interface KnowledgeSearchResult {
  document_id: string;
  title: string;
  document_type: string;
  service: string;
  score: number;
  snippet: string;
}

export interface AnalyticsOverview {
  total_incidents: number;
  active_incidents: number;
  resolved_incidents: number;
  escalated_incidents: number;
}

export interface IncidentAnalytics {
  mttr_seconds_avg: number | null;
  diagnosis_confidence_avg: number | null;
  resolved_by_severity: Record<string, number>;
  sample_size: number;
}

export interface ReliabilityAnalytics {
  tool_failure_rate: number;
  verification_failure_rate: number;
  automation_rate: number;
  total_tool_calls: number;
  total_verifications: number;
}

export interface AgentRun {
  id: string;
  incident_id: string;
  current_stage: string;
  status: string;
  state: any;
  created_at: string;
  updated_at: string;
}

// API base URL
export const API_BASE = 'http://localhost:8000';
export const WS_BASE = 'ws://localhost:8000';

// Agent pipeline stages in order
export const AGENT_STAGES = [
  'OBSERVE',
  'UNDERSTAND',
  'RETRIEVE',
  'REASON',
  'PLAN',
  'AUTHORIZE',
  'ACT',
  'VERIFY',
  'LEARN',
] as const;

export type AgentStage = typeof AGENT_STAGES[number];
