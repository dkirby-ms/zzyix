---
title: Agent Worker README Discovery
description: Documentation discovery comparing apps/agent-worker/README.md claims with implementation and nearby architecture docs
ms.date: 2026-08-08
ms.topic: research
---

## Research Questions

* Compare apps/agent-worker/README.md claims against apps/agent-worker implementation files.
* Inspect nearby architecture docs for intended worker use cases and current MVP boundaries.
* Identify discrepancies for worker purpose, configuration, authentication, control-plane behavior, intended use cases, and test or local run instructions.

## Findings

* apps/agent-worker/README.md accurately states the high-level worker purpose as read-only and prototype/MVP, but it omits several current MVP mechanics implemented in code: durable Postgres control-plane dependency, trigger claiming, run start/resume, lease ownership and renewal, checkpoint commits, read-tool calls, structured-proposal gating, and run/trigger completion reporting.
* The README runtime configuration section lists only AGENT_PRINCIPAL_ID, AGENT_CONTROL_PLANE_DSN, and AGENT_SERVER_TOKEN_SCOPE for normal runs. The implementation also reads lease/poll timings, server base URL, tool timeout, gateway mode and limits, feature gates, Foundry scope/endpoint/model values, policy/framework versions, logging, and Application Insights configuration.
* The README says managed identity app-only tokens are acquired and refreshed. The implementation specifically uses DefaultAzureCredential with interactive browser auth disabled, caches tokens until a 120-second refresh skew, and supplies bearer tokens to internal server read endpoints.
* The README sentence "Static server or Foundry tokens are not supported" conflicts with the later test-only static server token mode. The implementation supports static server tokens only when NODE_ENV=test and never implements static Foundry token support.
* The README does not document that AGENT_PRINCIPAL_ID is a database principal UUID rather than the Container App managed identity object ID. docs/fantome-agent-entra-setup.md explicitly calls out that distinction.
* The README does not mention the server-side app-role and token-validation contract described in docs/fantome-agent-entra-setup.md: server API audience, trusted issuer, JWKS URI, and required app role agent.runtime.
* The README does not document that the default gateway path is fake/model-free, Foundry is disabled by default, and structured proposals are disabled by default in the Dockerfile.
* The README test command is valid only in an activated environment with pytest installed. In this shell, `python -m pytest tests` failed because `python` is not on PATH; `python3 -m pytest tests` failed because pytest is not installed system-wide; `./.venv/bin/python -m pytest tests` passed with 35 passed and 5 skipped.
* The README does not mention optional Postgres integration tests gated by AGENT_WORKER_POSTGRES_TEST_DSN.
* The README does not mention the control-plane access verification script, which validates that AGENT_CONTROL_PLANE_DSN authenticates as agent_control_worker and cannot write canonical quilt tables.
* Nearby architecture docs describe the intended v1 use cases: one logical resident agent per quilt, a Python Microsoft Agent Framework Workflow with a supervisor, read-only tools, structured proposals, governed Foundry gateway, no model memory, and no canvas mutation authority. The README does not summarize those intended boundaries.

## Evidence

* apps/agent-worker/README.md: documents a read-only MVP, `python -m pytest tests`, `python -m main`, three normal env vars, managed identity token behavior, and test-only static server token mode.
* apps/agent-worker/src/main.py: builds PostgresControlPlane, AgentReadTools, ManagedIdentityTokenProvider or StaticAccessTokenProvider, FakeGateway or GovernedGateway, GraphWorkflow, and AgentSupervisor from environment configuration.
* apps/agent-worker/src/supervisor.py: requires AGENT_PRINCIPAL_ID, reads AGENT_LEASE_TTL_SECONDS, AGENT_POLL_INTERVAL_SECONDS, and AGENT_FEATURE_MODEL_FREE_ENABLED, claims triggers, starts or resumes runs, claims and renews leases, checkpoints, completes or fails runs, and marks triggers completed, failed, or pending.
* apps/agent-worker/src/control_plane.py: implements active-assignment guarded trigger claiming, stale claim reclaim, run start/resume, lease claim/renew/release, checkpoint load/save, trigger completion/failure/requeue, and Postgres-backed control-plane SQL.
* apps/agent-worker/src/identity.py: ManagedIdentityTokenProvider uses DefaultAzureCredential(exclude_interactive_browser_credential=True), caches tokens, and refreshes before expiry.
* apps/agent-worker/src/tools.py: server reads use `/internal/v1/agent/...` endpoints with bearer tokens, UUID validation, response redaction, event limits, and serialized response byte limits.
* apps/agent-worker/src/gateway.py: fake gateway returns deterministic observation-only output; Foundry mode enforces prompt/tool limits, rate/concurrency limits, managed-identity bearer auth, structured JSON extraction, safe observe-only actions, and deterministic fallback.
* apps/agent-worker/src/control_plane_access_verification.py: verifies restricted role `agent_control_worker` and canonical write denial.
* apps/agent-worker/Dockerfile: installs the package and sets default AGENT_GATEWAY_MODE=fake, AGENT_FEATURE_MODEL_FREE_ENABLED=true, AGENT_FEATURE_FOUNDRY_ENABLED=false, and AGENT_FEATURE_STRUCTURED_PROPOSALS_ENABLED=false.
* apps/agent-worker/pyproject.toml: requires Python >=3.11 and runtime dependencies agent-framework==1.13.0, azure-identity, azure-monitor-opentelemetry, psycopg[binary], with pytest in the dev extra.
* apps/agent-worker/tests/test_control_plane_postgres.py: skips Postgres integration tests unless AGENT_WORKER_POSTGRES_TEST_DSN points at a migrated database, and starts the production process with static server token only under NODE_ENV=test.
* docs/fantome-agent-entra-setup.md: documents managed identity, server API app role agent.runtime, `AGENT_PRINCIPAL_ID` as database principal UUID, restricted AGENT_CONTROL_PLANE_DSN, Foundry optional RBAC, and server auth env contracts.
* docs/fantome-resident-agent-architecture.md: documents final Python Agent Framework v1 runtime, supervisor-owned lifecycle, Postgres control plane, read-only tools, governed model gateway, and no model/canvas authority.
* docs/decisions/2026-08-07-resident-agent-architecture.md: earlier TypeScript deterministic worker baseline is superseded by the final Python runtime doc, while authority and identity boundaries remain relevant.
* Command evidence: `python -m pytest tests` failed with command not found for `python`; `python3 -m pytest tests` failed because pytest was missing; `./.venv/bin/python -m pytest tests` passed with 35 passed and 5 skipped.

## Clarifying Questions

* Should the README document the existing repository-local `.venv` workflow, or should it use generic `python3 -m venv .venv` plus `python -m pip install -e '.[dev]'` setup instructions?
* Should the README remain a minimal MVP smoke-test guide, or should it become the canonical operator guide for the agent worker runtime?