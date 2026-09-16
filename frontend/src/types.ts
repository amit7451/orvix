export interface Service {
  id: string;
  name: string;
  description: string;
  tier: string;
  owner_team: string;
  tags: string[];
}

export interface Incident {
  id: string;
  title: string;
  status: string;
  severity: string;
  created_at: string;
  probable_root_cause?: string;
  remediation_plan?: any;
  evidence?: any;
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
  requested_action: {
    tool: string;
    arguments: any;
  };
  decision: string;
  reason?: string;
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

export interface KnowledgeDocument {
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
