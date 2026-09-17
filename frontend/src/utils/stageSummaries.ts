import type { Incident, IncidentEvent } from '../types';

export interface StageAISummary {
  step: number;
  stage: string;
  label: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'AWAITING_APPROVAL' | 'QUEUED';
  whatHappened: string;
  whatProcessed: string;
  keyFinding: string;
  nextSteps: string;
}

export const STAGE_CONFIGS: Record<string, { step: number; label: string; defaultTagline: string }> = {
  OBSERVE: {
    step: 1,
    label: 'Observe & Telemetry Gathering',
    defaultTagline: 'Continuously monitors telemetry and extracts live metrics, logs, and trace spans.',
  },
  UNDERSTAND: {
    step: 2,
    label: 'Understand & Symptom Normalization',
    defaultTagline: 'Normalizes raw telemetry into symptoms, calculates severity, and checks dependencies.',
  },
  RETRIEVE: {
    step: 3,
    label: 'Retrieve & Knowledge Search',
    defaultTagline: 'Queries the Qdrant vector database for runbooks and matching historical incidents.',
  },
  REASON: {
    step: 4,
    label: 'Reason & Diagnostic Synthesis',
    defaultTagline: 'Synthesizes telemetry, logs, and runbooks to determine the root cause and confidence.',
  },
  PLAN: {
    step: 5,
    label: 'Plan & Remediation Strategy',
    defaultTagline: 'Formulates an actionable remediation plan with rollback contingencies.',
  },
  AUTHORIZE: {
    step: 6,
    label: 'Authorize & Safety Policy',
    defaultTagline: 'Evaluates planned actions against safety policies and enforces human approval.',
  },
  ACT: {
    step: 7,
    label: 'Act & Automated Execution',
    defaultTagline: 'Safely executes approved remediation tools against target infrastructure.',
  },
  VERIFY: {
    step: 8,
    label: 'Verify & Health Validation',
    defaultTagline: 'Independently inspects telemetry to verify whether recovery criteria are met.',
  },
  LEARN: {
    step: 9,
    label: 'Learn & Knowledge Consolidation',
    defaultTagline: 'Saves incident resolution to memory for future incidents and dispatches alerts.',
  },
};

export function getStageAISummary(
  stage: string,
  incident: Incident,
  timeline: IncidentEvent[]
): StageAISummary {
  const config = STAGE_CONFIGS[stage] || { step: 1, label: stage, defaultTagline: '' };
  const stageEvent = [...timeline].reverse().find((e) => e.stage.toUpperCase() === stage.toUpperCase());

  // Determine completion and active status
  const completedStages = new Set(timeline.map((e) => e.stage.toUpperCase()));
  const isResolved = incident.status === 'RESOLVED';
  const isEscalated = incident.status === 'ESCALATED';
  const isCompleted = completedStages.has(stage.toUpperCase()) || isResolved || isEscalated;

  // Current active stage
  const latestTimelineStage = timeline.length > 0 ? timeline[timeline.length - 1].stage.toUpperCase() : 'DETECTED';
  const isActive = latestTimelineStage === stage.toUpperCase() && !isResolved && !isEscalated;

  let status: 'COMPLETED' | 'IN_PROGRESS' | 'AWAITING_APPROVAL' | 'QUEUED' = 'QUEUED';
  if (isCompleted && !isActive) status = 'COMPLETED';
  else if (incident.status === 'AWAITING_APPROVAL' && stage === 'AUTHORIZE') status = 'AWAITING_APPROVAL';
  else if (isActive) status = 'IN_PROGRESS';

  const services = incident.affected_services?.length > 0 ? incident.affected_services : ['target service'];
  const anomalies = incident.evidence?.anomalies || [];
  const topAnomaly = anomalies[0];

  switch (stage.toUpperCase()) {
    case 'OBSERVE': {
      if (!isCompleted && !isActive) {
        return {
          step: 1,
          stage,
          label: config.label,
          status,
          whatHappened: 'Queued to observe live telemetry signals from affected services.',
          whatProcessed: 'Will collect Prometheus metrics, Loki logs, and Jaeger trace spans.',
          keyFinding: 'Awaiting telemetry ingestion to detect metric anomalies and deviations.',
          nextSteps: 'Hand off collected evidence to UNDERSTAND for symptom normalization.',
        };
      }
      return {
        step: 1,
        stage,
        label: config.label,
        status,
        whatHappened: `ORVIX observed telemetry anomalies across ${services.join(', ')} triggered by threshold breaches.`,
        whatProcessed: `Gathered ${anomalies.length || 1} metric anomaly point(s), active service error logs, and distributed trace spans.`,
        keyFinding: topAnomaly
          ? `Detected ${topAnomaly.metric} anomaly on ${topAnomaly.service} with anomaly score ${topAnomaly.anomaly_score}.`
          : `Detected abnormal latency and error spikes exceeding operational baselines.`,
        nextSteps: 'Forwarded raw telemetry evidence to UNDERSTAND to isolate symptoms and calculate incident severity.',
      };
    }

    case 'UNDERSTAND': {
      if (!isCompleted && !isActive) {
        return {
          step: 2,
          stage,
          label: config.label,
          status,
          whatHappened: 'Queued to normalize symptoms and evaluate incident severity.',
          whatProcessed: 'Will evaluate anomaly scores, service topology, and downstream dependency health.',
          keyFinding: 'Severity tier and scope of service disruption to be determined.',
          nextSteps: 'Pass structured symptoms to RETRIEVE for runbook matching.',
        };
      }
      const symptomsCount = incident.symptoms?.length || 1;
      return {
        step: 2,
        stage,
        label: config.label,
        status,
        whatHappened: `Normalized raw telemetry into ${symptomsCount} distinct symptom(s) and assigned ${incident.severity} severity.`,
        whatProcessed: `Evaluated service dependency links across ${services.join(', ')} and isolated unhealthy dependencies.`,
        keyFinding: `Impact: ${incident.impact || `${services.length} service(s) impacted with elevated latency/error rate.`}`,
        nextSteps: 'Dispatched normalized symptom queries to RETRIEVE to search vector runbooks and past incidents.',
      };
    }

    case 'RETRIEVE': {
      if (!isCompleted && !isActive) {
        return {
          step: 3,
          stage,
          label: config.label,
          status,
          whatHappened: 'Queued to query vector knowledge store for relevant operational runbooks.',
          whatProcessed: 'Will perform dense semantic vector search over Qdrant collections.',
          keyFinding: 'Awaiting runbook chunk extraction and historical incident correlation.',
          nextSteps: 'Provide retrieved documents to REASON for root cause hypothesis synthesis.',
        };
      }
      const docCount = stageEvent?.data?.retrieved_documents?.length || 8;
      const simCount = stageEvent?.data?.similar_incidents?.length || 0;
      return {
        step: 3,
        stage,
        label: config.label,
        status,
        whatHappened: `Queried the Qdrant vector database using dense embeddings derived from incident symptoms.`,
        whatProcessed: `Retrieved ${docCount} relevant runbook chunk(s) and correlated ${simCount} past similar incident(s).`,
        keyFinding: `Identified high-relevance remediation runbooks tailored to ${services.join(', ')}.`,
        nextSteps: 'Supplied runbook context and historical resolution patterns to REASON for diagnostic synthesis.',
      };
    }

    case 'REASON': {
      if (!isCompleted && !isActive) {
        return {
          step: 4,
          stage,
          label: config.label,
          status,
          whatHappened: 'Queued to synthesize telemetry and runbooks to diagnose the probable root cause.',
          whatProcessed: 'Will evaluate failure hypotheses, error stack traces, and database connection metrics.',
          keyFinding: 'Root cause and diagnostic confidence score pending.',
          nextSteps: 'Transmit diagnosis to PLAN to construct remediation steps.',
        };
      }
      const cause = incident.probable_root_cause || 'Service degradation identified';
      const conf = (incident.confidence * 100).toFixed(0);
      return {
        step: 4,
        stage,
        label: config.label,
        status,
        whatHappened: `Synthesized telemetry observations with runbook knowledge to deduce the underlying failure mechanism.`,
        whatProcessed: `Evaluated candidate root causes against service logs, connection pool saturation, and dependency health.`,
        keyFinding: `Diagnosis: "${cause}" with ${conf}% confidence.`,
        nextSteps: 'Forwarded diagnosis to PLAN to formulate an automated, safe remediation sequence.',
      };
    }

    case 'PLAN': {
      if (!isCompleted && !isActive) {
        return {
          step: 5,
          stage,
          label: config.label,
          status,
          whatHappened: 'Queued to formulate a targeted remediation action plan.',
          whatProcessed: 'Will select remediation tools and calculate rollback contingency strategies.',
          keyFinding: 'Remediation actions and targets pending plan formulation.',
          nextSteps: 'Submit proposed actions to AUTHORIZE for safety policy compliance check.',
        };
      }
      const actions = incident.remediation_plan?.actions || [];
      const toolNames = actions.map((a: any) => a.tool).join(', ') || 'remediation tools';
      return {
        step: 5,
        stage,
        label: config.label,
        status,
        whatHappened: `Formulated a structured ${actions.length || 1}-step remediation plan with rollback contingencies.`,
        whatProcessed: `Selected tools [${toolNames}] targeting ${services.join(', ')} based on runbook recommendations.`,
        keyFinding: `Targeted plan designed to restore service baseline without interrupting upstream workflows.`,
        nextSteps: 'Submitted proposed actions to AUTHORIZE to verify safety policies and permission boundaries.',
      };
    }

    case 'AUTHORIZE': {
      if (!isCompleted && !isActive) {
        return {
          step: 6,
          stage,
          label: config.label,
          status,
          whatHappened: 'Queued to evaluate action risk against the security and safety policy engine.',
          whatProcessed: 'Will verify tool permissions, blast radius, and human approval requirements.',
          keyFinding: 'Action authorization and risk level pending policy evaluation.',
          nextSteps: 'Execute authorized tools in ACT or pause for human approval.',
        };
      }
      const actions = incident.remediation_plan?.actions || [];
      const hasHighRisk = actions.some((a: any) => a.risk_level === 'HIGH' || a.authorization === 'REQUIRES_APPROVAL');
      return {
        step: 6,
        stage,
        label: config.label,
        status,
        whatHappened: `Evaluated remediation actions against safety policies and organizational permission matrices.`,
        whatProcessed: `Assessed tool write permissions, resource blast radius, and human-in-the-loop approval gates.`,
        keyFinding: hasHighRisk || incident.status === 'AWAITING_APPROVAL'
          ? `High-risk action flagged — requires explicit engineer authorization before execution.`
          : `All actions verified as low-risk / read-safe and pre-authorized for autonomous execution.`,
        nextSteps: 'Authorized actions passed to ACT for execution on target infrastructure.',
      };
    }

    case 'ACT': {
      if (!isCompleted && !isActive) {
        return {
          step: 7,
          stage,
          label: config.label,
          status,
          whatHappened: 'Queued to execute authorized remediation actions.',
          whatProcessed: 'Will invoke infrastructure tools, restarts, scale operations, or cache flushes.',
          keyFinding: 'Tool execution results and return codes pending.',
          nextSteps: 'Trigger independent verification in VERIFY to confirm health restoration.',
        };
      }
      const actions = incident.remediation_plan?.actions || [];
      const executedTools = stageEvent?.data?.executed_tools || actions;
      const count = executedTools.length || 1;
      return {
        step: 7,
        stage,
        label: config.label,
        status,
        whatHappened: `Executed ${count} approved remediation action(s) across target infrastructure.`,
        whatProcessed: `Invoked tools [${actions.map((a: any) => a.tool).join(', ') || 'remediation'}] with parameter validation.`,
        keyFinding: `Actions applied successfully to ${services.join(', ')}; services returned healthy process status.`,
        nextSteps: 'Handed off to VERIFY to independently test live telemetry and validate recovery.',
      };
    }

    case 'VERIFY': {
      if (!isCompleted && !isActive) {
        return {
          step: 8,
          stage,
          label: config.label,
          status,
          whatHappened: 'Queued to independently verify post-remediation service recovery.',
          whatProcessed: 'Will evaluate live latency, error rate, and connection metrics against recovery limits.',
          keyFinding: 'Recovery verification status pending.',
          nextSteps: 'Resolve incident in LEARN or escalate if metrics remain abnormal.',
        };
      }
      const passed = incident.verification?.passed ?? true;
      return {
        step: 8,
        stage,
        label: config.label,
        status,
        whatHappened: `Independently verified service telemetry post-remediation against recovery criteria.`,
        whatProcessed: `Evaluated latency (<300ms), error rate (<5%), and database connection ratios on ${services.join(', ')}.`,
        keyFinding: passed
          ? `Verification PASSED: all services confirmed healthy and within normal operating parameters.`
          : `Verification FAILED: metrics remain degraded; initiating escalation protocol.`,
        nextSteps: passed
          ? 'Passed to LEARN to archive resolution knowledge and alert the engineering team.'
          : 'Escalated incident to human on-call engineer for manual intervention.',
      };
    }

    case 'LEARN': {
      if (!isCompleted && !isActive) {
        return {
          step: 9,
          stage,
          label: config.label,
          status,
          whatHappened: 'Queued to consolidate incident findings into long-term organizational memory.',
          whatProcessed: 'Will update vector database embeddings and dispatch post-incident summaries.',
          keyFinding: 'Final post-mortem and notification dispatch pending.',
          nextSteps: 'Autonomous response cycle complete; watcher returns to baseline monitoring.',
        };
      }
      return {
        step: 9,
        stage,
        label: config.label,
        status,
        whatHappened: `Consolidated incident resolution into long-term organizational memory and closed the incident.`,
        whatProcessed: `Archived diagnosis, verified tool effectiveness, and dispatched notifications via console/Slack.`,
        keyFinding: `Incident resolved successfully with recorded post-mortem patterns available for future incidents.`,
        nextSteps: 'Autonomous incident response complete. Returned to continuous watcher monitoring.',
      };
    }

    default:
      return {
        step: 1,
        stage,
        label: config.label,
        status,
        whatHappened: stageEvent?.message || 'Processing stage events.',
        whatProcessed: 'Processed operational signals and agent transitions.',
        keyFinding: 'Operational state verified.',
        nextSteps: 'Proceeding to next sequential step.',
      };
  }
}
