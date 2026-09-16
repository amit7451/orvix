# ORVIX

**Observe, Reason, Verify & Execute Intelligence**

Autonomous AI Backend Reliability & Incident Response Platform.

ORVIX continuously monitors backend systems, detects abnormal behavior,
investigates probable root causes, retrieves approved remediation
knowledge, drafts a remediation plan, executes controlled corrective
actions when authorized, independently verifies recovery, notifies
engineers, and learns from the outcome. It is a closed-loop AI reliability
system, not a chatbot or a generic RAG demo.

```
Detection → Diagnosis → Knowledge Retrieval → Planning → Authorization → Action → Verification → Learning
```

---

## 1. Problem statement

Traditional monitoring stops at alerting. An engineer still has to
correlate signals, read runbooks, decide on a fix, get sign-off, execute
it, and confirm recovery - all manually, under pressure, often at 3am.
ORVIX automates every step of that loop except the parts that
deliberately require a human: authorizing risky actions.

## 2. Why traditional monitoring is insufficient

- Dashboards show symptoms, not root causes.
- Runbooks live in wikis nobody reads mid-incident.
- Remediation knowledge is siloed in the heads of senior engineers.
- Every incident is investigated from scratch, even if it happened last
  month.
- "Automation" in most shops means a restart script triggered by a
  threshold - with no diagnosis, no verification, and no audit trail.

## 3. Architecture

### Six-layer architecture

| Layer | Responsibility | Where |
|---|---|---|
| 1. Monitored Infrastructure | APIs, services, DBs, queues (simulated locally) | `app/simulation/` |
| 2. Observability | Metrics, logs, traces, events, health | `app/observability/` |
| 3. Agentic Intelligence | Anomaly detection, embeddings, retrieval, reasoning | `app/observability/anomaly.py`, `app/rag/` |
| 4. Agent Orchestration | LangGraph stateful workflow | `app/agents/` |
| 5. Controlled Action | Typed tools, policy engine, verification | `app/tools/`, `app/policy/` |
| 6. Experience/API | REST + WebSocket API for a frontend | `app/api/` |

### Agent lifecycle

```
OBSERVE → UNDERSTAND → RETRIEVE → REASON → PLAN → AUTHORIZE → ACT → VERIFY → LEARN
                                                        ↑                  │
                                                        └── retry loop ────┘
                                                    (verification failure, up to 2x)
                                                             │
                                                        ESCALATE (after 2 failed
                                                     verifications, or a denied action)
```

Implemented as a real [LangGraph](https://github.com/langchain-ai/langgraph)
`StateGraph` in `app/agents/graph.py` - not a hand-rolled sequence of
function calls. Human approval uses LangGraph's native `interrupt()` /
`Command(resume=...)` mechanism: the graph genuinely pauses mid-execution
and resumes exactly where it left off once a human decides, even across
separate HTTP requests, via a checkpointer keyed on the agent run ID.

### RAG architecture (decision-support, not document chat)

```
Documents → Parsing → Normalization → Chunking → Metadata
   → Embeddings → Vector Store → Metadata Filtering
   → Semantic Retrieval → Optional Reranking → Context Assembly
   → Structured LLM Reasoning
```

- `app/rag/chunking.py` - paragraph-aware sliding-window chunker.
- `app/rag/embeddings.py` - offline deterministic hashing embedder by
  default (`LLM_PROVIDER=mock`), so the whole pipeline runs with **zero
  external API calls or keys**. Swap in a real embedding model by
  implementing `EmbeddingProvider`.
- `app/rag/vector_store.py` - abstract `VectorStore`; ships with an
  in-memory cosine-similarity implementation. Swap for Chroma or pgvector
  by implementing the same interface - nothing else changes.
- `app/rag/reranker.py` - lexical overlap + approval-status reranking.
- `app/rag/retriever.py` - the actual retrieval orchestration used by the
  agent's RETRIEVE stage. Retrieved content is explicitly framed as
  **untrusted reference data** in the prompt and can never override tool
  permissions or policy decisions - that boundary is enforced in the
  policy engine, not the prompt.

### Tool-calling architecture

Every tool in `app/tools/` extends `Tool` (`app/tools/base.py`): typed
input schema, risk classification, structured `ToolResult`, and no path
to arbitrary shell/command execution. Twelve tools are implemented:

`check_service_health`, `check_database_health`, `get_recent_deployments`,
`get_service_logs`, `get_metrics`, `get_trace`, `restart_service`,
`restart_pod`, `scale_service`, `rollback_deployment`,
`send_engineer_notification`, `verify_recovery`.

### Policy and approval architecture

The LLM **proposes**; `app/policy/engine.py` **decides**. Pure, deterministic,
independently unit-tested, zero dependency on the LLM layer:

- `ALLOW` - low risk + high confidence + auto-remediation enabled.
- `REQUIRE_APPROVAL` - medium/high risk, or confidence below 0.6.
- `DENY` - unknown tool (fail closed), or the acting identity isn't
  permitted to use that tool at all.

Risk is escalated (`MEDIUM → HIGH`) for any medium-risk action targeting
`production` (`app/policy/risk.py`). RBAC lives in
`app/policy/permissions.py` (`ADMIN / SRE / ENGINEER / APPROVER / VIEWER`).

When approval is required, `AUTHORIZE` creates an `ApprovalRequest` row
and calls `interrupt()`. The API's `POST /api/approvals/{id}/approve|reject`
endpoint resumes the paused graph with the human's decision. A rejected
action is marked `DENIED` and is **never retried silently** - the agent
routes straight to `ESCALATE`.

### Database architecture

PostgreSQL-shaped schema (runs on SQLite locally with zero setup) via
SQLAlchemy 2.x async ORM: `users`, `services`, `service_dependencies`,
`incidents`, `incident_events`, `agent_runs`, `tool_calls`,
`remediation_actions`, `approval_requests`, `knowledge_documents`,
`audit_logs`, `notifications`, `verification_results`. See
`app/db/models/`.

### Observability architecture

`app/observability/` defines `MetricsProvider`, `LogsProvider`,
`TracesProvider`, `EventsProvider` interfaces (OpenTelemetry/Prometheus
shaped) with mock implementations backed by `app/simulation/engine.py`.
`app/observability/anomaly.py` is a deterministic anomaly detector
(threshold + baseline-ratio + rolling z-score/EWMA) - the LLM never
decides whether a metric is anomalous.

---

## 4. Local setup

Requires Python 3.11+.

```bash
cd orvix
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Visit `http://localhost:8000/docs` for interactive API docs, or
`http://localhost:8000/health`.

On startup ORVIX seeds five simulated services, five demo users (one per
role), and the operational knowledge base (`knowledge/*.md`) into the
vector store - no manual setup required. A background watcher
(`app/services/watcher.py`) ticks the simulated infrastructure every 5
seconds and autonomously opens + drives an incident through the full
agent loop the moment it detects an anomaly.

### Docker setup

```bash
docker compose up --build
```

Runs the API on `:8000` against local SQLite by default. Uncomment the
`postgres` service and `DATABASE_URL` override in `docker-compose.yml` for
a Postgres-backed run.

---

## 5. Environment variables

See `.env.example` for the full list. Key ones:

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `mock` | `mock` runs fully offline; `openai` requires `OPENAI_API_KEY` |
| `DATABASE_URL` | `sqlite+aiosqlite:///./orvix.db` | swap for Postgres in production |
| `VECTOR_STORE` | `memory` | swap for `chroma`/`pgvector` in production |
| `ENABLE_AUTO_REMEDIATION` | `true` | policy engine refuses to `ALLOW` anything if `false` |
| `DRY_RUN` | `false` | tools report what they *would* do without mutating state |
| `SLACK_WEBHOOK_URL` / `TEAMS_WEBHOOK_URL` | unset | enables those notification adapters |

---

## 6. Demo scenario

Two end-to-end scenarios are scripted in `scripts/demo_scenario.sh`
(requires the server running locally):

```bash
./scripts/run_dev.sh &        # start ORVIX
./scripts/demo_scenario.sh    # run both demo scenarios
```

**Scenario A - fully autonomous resolution.** Injects a database
connection-pool-exhaustion failure on `payment-service`. The watcher
detects the anomaly within 5 seconds, opens an incident, diagnoses "DB
pool exhaustion" with ~0.9+ confidence, proposes `restart_service` (LOW
risk), the policy engine auto-`ALLOW`s it, the tool runs, independent
verification passes, and the incident is marked `RESOLVED` - end to end,
no human involved, typically inside ~10 seconds.

**Scenario B - human-in-the-loop.** Injects CPU pressure on
`order-service`, leading to a `scale_service` proposal (escalated to HIGH
risk in production). The agent graph genuinely pauses via `interrupt()`;
the incident sits at `AWAITING_APPROVAL` until a human calls
`POST /api/approvals/{id}/approve`, at which point the graph resumes from
exactly where it paused and drives the incident to `RESOLVED`.

You can also inject failures manually:

```bash
curl -X POST "http://localhost:8000/api/simulation/failures/latency?service=auth-service&severity=0.8"
curl -X POST "http://localhost:8000/api/simulation/failures/service-down?service=user-service"
curl -X POST http://localhost:8000/api/simulation/reset
```

Watch it happen live over WebSocket: `ws://localhost:8000/ws/events`
(or SSE at `GET /api/events/stream`).

---

## 7. API reference (selected)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health`, `/ready` | liveness/readiness |
| GET/POST | `/api/services` | simulated service registry |
| GET/POST | `/api/incidents` | incident CRUD |
| POST | `/api/incidents/{id}/investigate` | manually trigger the agent loop |
| GET | `/api/incidents/{id}/timeline` | structured agent execution timeline |
| POST | `/api/agent/run` | start an agent run for an incident |
| GET | `/api/agent/runs/{id}` | inspect an agent run's state |
| GET | `/api/approvals` | list approval requests |
| POST | `/api/approvals/{id}/approve` `/reject` | human decision, resumes the graph |
| POST | `/api/knowledge/documents`, `/ingest` | ingest operational knowledge |
| GET | `/api/knowledge/search` | semantic search over the knowledge base |
| GET | `/api/tools` | list the typed tool registry |
| POST | `/api/tools/{name}/execute` | human-triggered tool execution (still policy-checked) |
| GET/POST | `/api/notifications`, `/test` | notification log + adapter test |
| GET | `/api/analytics/overview` `/incidents` `/reliability` | MTTR, automation rate, etc. |
| POST | `/api/simulation/failures*`, `/reset` | failure injection |
| WS | `/ws/events` | real-time event stream |

---

## 8. Testing

```bash
pytest -q
```

35 tests across three suites:

- `tests/unit/` - anomaly detection, policy engine, risk classification,
  incident lifecycle/correlation, RAG retrieval - all independent of the
  running API.
- `tests/integration/` - full telemetry → incident → evidence → RAG →
  diagnosis → plan → policy → remediation → verification → resolution
  flow, driven through the public API.
- `tests/safety/` - unauthorized actions are blocked, destructive actions
  require approval, **rejected approvals never execute and never let an
  incident silently resolve**, no shell-execution-shaped tool exists in
  the registry, secrets are scrubbed from audit logs, malformed tool
  calls fail closed.

The safety suite caught two real bugs during development (a lifecycle
transition gap and a "verify against ambient metrics after a rejected
action" gap) - both are now regression-tested.

---

## 9. Security

- RBAC (`ADMIN/SRE/ENGINEER/APPROVER/VIEWER`) gates every tool at the
  human-triggered `/api/tools/{name}/execute` endpoint.
- The autonomous agent acts under its own fixed identity/permission set,
  distinct from any human role.
- Policy decisions are deterministic and independent of the LLM.
- Secrets are never logged, never sent to the LLM, and are actively
  scrubbed (`app/memory/audit.py::_scrub`) before hitting the audit trail.
- CORS is explicit (`CORS_ORIGINS`); no wildcard in production config.
- Every tool call, approval decision, and status transition is recorded
  in the append-only `audit_logs` table.

---

## 10. Limitations (be honest about what's simulated)

This is a local-development reference implementation:

| Simulated here | Production replacement |
|---|---|
| `app/simulation/engine.py` mock services | real Kubernetes/cloud APIs |
| Mock metrics/logs/traces | Prometheus / Loki-ELK / OpenTelemetry-Jaeger |
| In-memory hashing embeddings | a real embedding model (OpenAI/Gemini/local) |
| In-memory vector store | pgvector or Chroma |
| `MemorySaver` LangGraph checkpointer | a durable Postgres/Redis checkpoint saver |
| `LLM_PROVIDER=mock` deterministic reasoning | a real hosted LLM |
| SQLite | PostgreSQL + Alembic migrations |

None of the above requires touching calling code to swap - every one of
these is hidden behind an abstract interface (`VectorStore`,
`EmbeddingProvider`, `MetricsProvider`, etc.) specifically so the
production swap is additive, not a rewrite.

## 11. Production-hardening roadmap

- Kubernetes-native remediation tools (behind the existing `Tool` interface).
- Multi-agent supervisor architecture: specialist diagnosis / security /
  remediation / verification agents behind the same graph.
- Predictive failure detection (time-series models, Isolation Forest) as
  additional `AnomalyDetector` methods.
- Causal dependency graphs and change-impact analysis feeding `PLAN`.
- Policy-as-code (OPA/Rego) instead of the in-process `PolicyEngine`.
- Learning-to-rank for incident similarity in `app/memory/long_term.py`.
- Cost-aware model routing and private/on-prem LLM support in `app/llm/`.

---

### ORVIX

*Observe. Reason. Verify. Execute.*
