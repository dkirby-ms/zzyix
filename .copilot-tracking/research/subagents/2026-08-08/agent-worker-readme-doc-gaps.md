---
title: Agent Worker README Documentation Gap Research
description: Research notes for missing documentation in apps/agent-worker/README.md
ms.date: 2026-08-08
ms.topic: reference
---

## Research Questions

* Identify undocumented configuration variables for apps/agent-worker.
* Identify undocumented operational behavior in implementation and tests.
* Identify undocumented test-only behavior and constraints.
* Identify planned use cases in architecture docs that are absent from README.
* Identify known non-goals or unsupported modes users should understand.

## Findings

### Error Severity

* The README does not explain that `AGENT_PRINCIPAL_ID` is the pre-provisioned database principal UUID, not the Azure Container App managed identity object ID.
	Evidence: apps/agent-worker/src/supervisor.py, docs/fantome-agent-entra-setup.md, scripts/bootstrap-cd-environment.sh.
* The README omits production server-read prerequisites: server app-role validation, `FEATURE_AGENT_READS_ENABLED`, `AGENT_SERVER_BASE_URL`, and the Entra app-role setup path.
	Evidence: apps/agent-worker/src/main.py, docs/fantome-agent-entra-setup.md, .github/workflows/cd.yml.
* The README omits durable control-plane and restricted-role verification behavior, including the fact that `AGENT_CONTROL_PLANE_DSN` cannot be disabled and should authenticate as `agent_control_worker` with no canonical write access.
	Evidence: apps/agent-worker/src/main.py, apps/agent-worker/src/control_plane_access_verification.py, apps/agent-worker/tests/test_control_plane_access_verification.py, .github/workflows/cd.yml.
* The README's test-only static token section does not mention that `AGENT_SERVER_TOKEN_SCOPE` is still required by startup even when `AGENT_USE_STATIC_SERVER_TOKEN=true`.
	Evidence: apps/agent-worker/src/main.py, apps/agent-worker/tests/test_control_plane_postgres.py.

### Warning Severity

* The README lacks a configuration reference for operational knobs: `LOG_LEVEL`, `APPLICATIONINSIGHTS_CONNECTION_STRING`, `AGENT_LEASE_TTL_SECONDS`, `AGENT_POLL_INTERVAL_SECONDS`, `AGENT_TOOL_TIMEOUT_SECONDS`, `AGENT_POLICY_VERSION`, and `AGENT_FRAMEWORK_VERSION`.
	Evidence: apps/agent-worker/src/main.py, apps/agent-worker/src/supervisor.py, apps/agent-worker/src/telemetry.py, .github/workflows/cd.yml.
* The README lacks a model gateway and feature-gate reference for `AGENT_GATEWAY_MODE`, `AGENT_FEATURE_MODEL_FREE_ENABLED`, `AGENT_FEATURE_FOUNDRY_ENABLED`, `AGENT_FEATURE_STRUCTURED_PROPOSALS_ENABLED`, `AGENT_FOUNDRY_TOKEN_SCOPE`, `AGENT_FOUNDRY_ENDPOINT`, `AGENT_GATEWAY_MODEL`, and gateway limit variables.
	Evidence: apps/agent-worker/src/main.py, apps/agent-worker/src/gateway.py, apps/agent-worker/Dockerfile, docs/fantome-resident-agent-architecture.md.
* The README does not explain runtime lifecycle behavior: assigned triggers only, idle polling, active assignment checks, one live lease per quilt, background lease renewal, lease-loss stop behavior, requeue, and failed/completed run outcomes.
	Evidence: apps/agent-worker/src/supervisor.py, apps/agent-worker/src/control_plane.py, apps/agent-worker/tests/test_supervisor.py, apps/agent-worker/tests/test_control_plane_postgres.py.
* The README does not document checkpoint recovery: stale claimed triggers can be reclaimed, the original run ID is reused, committed checkpoints are loaded, partial checkpoints replay read-only state from fresh server reads, and checkpoint writes use version checks.
	Evidence: apps/agent-worker/src/supervisor.py, apps/agent-worker/src/workflow.py, apps/agent-worker/src/checkpoints.py, apps/agent-worker/tests/test_supervisor.py, apps/agent-worker/tests/test_checkpoints.py.
* The README omits read-only tool behavior and constraints: internal server route prefix, UUID validation, context and event redaction, event limit range, snapshot surface selection, and 64 KB bounded serialized tool responses.
	Evidence: apps/agent-worker/src/tools.py, apps/agent-worker/tests/test_tools.py, docs/fantome-resident-agent-architecture.md.
* The README does not describe telemetry behavior: Azure Monitor is opt-in through Application Insights, operational events are JSON logs, payload fields are dropped, and identifiers are hashed.
	Evidence: apps/agent-worker/src/telemetry.py, apps/agent-worker/tests/test_telemetry.py, docs/fantome-resident-agent-architecture.md.
* The README's test section omits local development prerequisites and skip-gated integration tests, including Python 3.11 package installation, pytest dev dependency, migrated PostgreSQL requirement, and `AGENT_WORKER_POSTGRES_TEST_DSN`.
	Evidence: apps/agent-worker/pyproject.toml, apps/agent-worker/tests/test_control_plane_postgres.py, .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md.
* The README does not state the Agent Framework runtime constraint: the worker requires the installed `agent-framework` API and fails closed when required Workflow symbols are unavailable.
	Evidence: apps/agent-worker/pyproject.toml, apps/agent-worker/src/workflow.py, apps/agent-worker/tests/test_workflow.py.

### Suggestion Severity

* The README does not separate implemented MVP behavior from planned architecture use cases such as Foundry conversational responses, historical context synthesis, lifecycle states, structured proposals, and future model expansion gates.
	Evidence: docs/fantome-resident-agent-architecture.md, docs/decisions/2026-08-07-resident-agent-architecture.md, apps/agent-worker/src/main.py, apps/agent-worker/src/workflow.py.
* The README should list explicit non-goals and unsupported modes: no production static server tokens, no Entra Agent ID, no canonical database writes, no direct canvas mutation authority, no durable user memory, no raw prompt/response retention by default, and no Agent Framework Harness in the MVP.
	Evidence: apps/agent-worker/src/main.py, docs/fantome-agent-entra-setup.md, docs/fantome-resident-agent-architecture.md, docs/decisions/2026-08-07-resident-agent-architecture.md, .github/workflows/cd.yml.

## Evidence Log

* apps/agent-worker/README.md currently documents only a minimal test command, three production environment variables, managed identity token acquisition, and static server token test mode.
* apps/agent-worker/src/main.py is the primary startup configuration surface and reads required DSN/scope settings, server base URL, tool timeout, gateway settings, feature gates, Foundry configuration, policy/framework versions, logging, and static token constraints.
* apps/agent-worker/src/supervisor.py owns claim, run, lease, checkpoint, requeue, idle, and model-free gating behavior.
* apps/agent-worker/src/control_plane.py implements active assignment checks, stale trigger reclaim, one live lease per quilt, checkpoint compare-and-set, run status updates, and requeue behavior.
* apps/agent-worker/src/workflow.py implements the Agent Framework graph, read-only proposal path, checkpoint resume behavior, lease checks before and after graph nodes, and fail-closed runtime API detection.
* apps/agent-worker/src/gateway.py implements fake and Foundry gateway modes, preflight limits, rate and concurrency controls, redacted tool context, observe-only output validation, and deterministic fallback behavior.
* apps/agent-worker/src/tools.py implements read-only internal server API calls, bearer token usage, UUID validation, redaction, event bounds, and serialized response size limits.
* apps/agent-worker/src/identity.py implements managed identity token caching and refresh; static token provider rejects blank test tokens.
* apps/agent-worker/src/telemetry.py configures Azure Monitor only when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set and redacts/hashes event payloads.
* apps/agent-worker/src/control_plane_access_verification.py verifies `AGENT_CONTROL_PLANE_DSN` is restricted to `agent_control_worker` and cannot write canonical quilt rows.
* apps/agent-worker/tests cover static token constraints, telemetry opt-in, gateway fallback and limits, read-tool redaction and bounds, checkpoint recovery, lease contention, stale-trigger recovery, and PostgreSQL process restart behavior.
* docs/fantome-agent-entra-setup.md explains Entra app-role setup, managed identity activation, `AGENT_PRINCIPAL_ID` semantics, Foundry RBAC, and validation requirements.
* docs/fantome-resident-agent-architecture.md explains authority boundaries, durable state, lifecycle states, tool boundary, model gateway policy, prompt/memory policy, telemetry, activation gates, and non-goals.
* .github/workflows/cd.yml and scripts/bootstrap-cd-environment.sh define production/CD variables and deploy-time worker access verification.

## Follow-On Questions

None for the scoped discovery pass.

## Final Assessment

Total gaps found: 14.

Issues by severity:

* Error: 4
* Warning: 8
* Suggestion: 2

Additional passes needed: no.

Confidence in completeness: high for the requested scope, because all agent-worker source files and tests were scanned, and nearby architecture and identity docs were checked where they describe worker use cases.
