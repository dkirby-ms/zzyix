---
title: Agent Worker MVP
description: Runtime and operations guide for the Fantome resident-agent worker MVP
---

## Overview

The agent worker is the Python runtime for the Fantome resident-agent MVP. It is
a durable, read-only control-plane worker that claims assigned quilt triggers,
starts or resumes workflow runs, owns a lease while work is active, checkpoints
progress, calls approved read tools, and reports completion or failure back to
the PostgreSQL control plane.

The worker does not mutate canonical quilt state. It reads authorized server
state, creates observation-only proposals, and records runtime progress through
the restricted `agent_control` schema. The existing server remains the authority
for authentication, principal resolution, authorization, quilt data, patch data,
events, revisions, and any future canvas mutation.

## Current Capabilities

The implemented MVP can:

* Poll the control plane for pending or reclaimable triggers assigned to the
  configured agent principal.
* Start a new run or resume a previously claimed run when the trigger carries a
  compatible run ID.
* Acquire, renew, verify, and release a quilt lease for serialized work.
* Recover the latest checkpoint for the run and replay read-only workflow steps
  from fresh server data.
* Load quilt context and recent patch events through authenticated read tools.
* Produce a deterministic observation proposal when structured proposals are
  disabled.
* Use the governed gateway contract when Foundry and structured proposals are
  explicitly enabled.
* Mark runs and triggers as succeeded, failed, cancelled, completed, requeued,
  or failed according to runtime outcome.
* Emit redacted operational telemetry without storing raw prompts, tool payloads,
  or model responses.

Planned capabilities include richer Foundry-backed conversation, historical
context synthesis from curated sources, the full resident-agent lifecycle states,
structured proposal activation, broader tool auditing, and future expansion
gates for capabilities beyond read-only observation.

## Production Prerequisites

Enable the worker only after these prerequisites are complete:

* The server has the internal agent read routes mounted at `/internal/v1/agent`.
* The server has `FEATURE_AGENT_READS_ENABLED=true`.
* The server validates app-only tokens for the configured issuer, audience,
  expiry, subject, and required `agent.runtime` role.
* The worker Container App has a system-assigned managed identity.
* The worker managed identity has the server API `agent.runtime` app-role
  assignment in Entra ID.
* The database contains an active pre-provisioned `agent` principal and active
  `agent_control.agent_assignments` rows for quilts the worker may process.
* `AGENT_CONTROL_PLANE_DSN` authenticates as the restricted
  `agent_control_worker` database role and cannot write canonical quilt tables.
* Foundry settings remain disabled until Foundry RBAC, endpoint, scope, timeout,
  quota, and fallback behavior are validated.

`AGENT_PRINCIPAL_ID` is the pre-provisioned database agent principal UUID used
inside the control plane. It is not the Azure Container App managed identity
object ID. The managed identity object ID is used for Entra app-role and Azure
RBAC assignments.

## Configuration

### Required Runtime Variables

| Variable | Purpose | Example |
| --- | --- | --- |
| `AGENT_PRINCIPAL_ID` | Database agent UUID | `principals.id` UUID |
| `AGENT_CONTROL_PLANE_DSN` | Control-plane DSN | `postgresql://...` |
| `AGENT_SERVER_TOKEN_SCOPE` | Server read token scope | `api://.../.default` |

`AGENT_PRINCIPAL_ID` is used for assignment, trigger claiming, runs, and leases.
`AGENT_CONTROL_PLANE_DSN` should authenticate as `agent_control_worker`.

### Optional Operations Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGENT_SERVER_BASE_URL` | `http://127.0.0.1:3001` | Server URL |
| `AGENT_TOOL_TIMEOUT_SECONDS` | `5` | Read-tool timeout |
| `AGENT_LEASE_TTL_SECONDS` | `20` | Quilt lease TTL |
| `AGENT_POLL_INTERVAL_SECONDS` | `0.5` | Idle poll delay |
| `AGENT_FEATURE_MODEL_FREE_ENABLED` | `true` | Runtime gate |
| `AGENT_POLICY_VERSION` | `v1` | Checkpoint policy version |
| `AGENT_FRAMEWORK_VERSION` | `mvp` | Checkpoint framework version |
| `LOG_LEVEL` | `INFO` | Python logging level |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | unset | Azure Monitor export |

### Gateway and Foundry Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGENT_GATEWAY_MODE` | `fake` | Gateway mode |
| `AGENT_FEATURE_FOUNDRY_ENABLED` | `false` | Foundry access gate |
| `AGENT_FEATURE_STRUCTURED_PROPOSALS_ENABLED` | `false` | Proposal gate |
| `AGENT_FOUNDRY_TOKEN_SCOPE` | unset | Foundry token scope |
| `AGENT_FOUNDRY_ENDPOINT` | unset | Foundry endpoint |
| `AGENT_GATEWAY_MODEL` | `gpt-4.1-mini` | Model label |
| `AGENT_GATEWAY_MAX_PROMPT_CHARS` | `8000` | Prompt size guard |
| `AGENT_GATEWAY_MAX_TOOL_BYTES` | `64000` | Tool context guard |
| `AGENT_GATEWAY_MAX_ATTEMPTS` | `2` | Retry budget |
| `AGENT_GATEWAY_TIMEOUT_SECONDS` | `3` | Provider timeout |
| `AGENT_GATEWAY_RATE_LIMIT_PER_MINUTE` | `30` | Rate limit |
| `AGENT_GATEWAY_MAX_CONCURRENCY` | `4` | Concurrency limit |

`AGENT_GATEWAY_MODE=foundry` takes effect only when the Foundry feature gate is
enabled. Otherwise the worker uses deterministic fake gateway output.

### Test-Only Variables

| Variable | Required Condition | Purpose |
| --- | --- | --- |
| `NODE_ENV=test` | Static token mode | Marks local test execution |
| `AGENT_USE_STATIC_SERVER_TOKEN=true` | `NODE_ENV=test` | Uses test token |
| `AGENT_TEST_STATIC_SERVER_TOKEN` | Static mode enabled | Fixed bearer token |
| `AGENT_WORKER_POSTGRES_TEST_DSN` | Optional | Postgres test DSN |

Production static server tokens are unsupported. Static Foundry tokens are also
unsupported. In production, server and Foundry access use managed identity
tokens acquired through `DefaultAzureCredential`.

## Authentication Model

The worker uses `DefaultAzureCredential` with interactive browser credential
excluded. It requests an app-only token for `AGENT_SERVER_TOKEN_SCOPE`, then
sends the token as `Authorization: Bearer <token>` to the server read routes.

The server-side app-only validation path must require:

* The trusted Entra issuer for the worker tenant.
* The server API audience, such as `api://zzyix-agent-reader`.
* A valid app-only `roles` claim containing `agent.runtime`.
* Normal token checks for signature, algorithm, expiry, and subject.
* Principal resolution to an active pre-provisioned database `agent` principal.

Human delegated scopes and agent app roles are separate contracts. A human `scp`
claim does not satisfy the worker role requirement, and an agent `roles` claim
does not satisfy human delegated access.

## Read Tools

Read tools call fixed server endpoints under the configured server base URL:

| Tool | Route pattern |
| --- | --- |
| `get_quilt_context` | `/quilts/{quiltId}/context` |
| `get_patch_snapshot` | `/patches/{patchId}/snapshot` |
| `get_patch_events` | `/patches/{patchId}/events` |

All routes are prefixed with `/internal/v1/agent` and use `GET`. Quilt and
patch identifiers must be UUIDs. Patch snapshots accept `surface=fineData` or
`surface=aggregateData`. Patch event reads require a non-negative `afterOpSeq`
cursor and a `limit` from `1` through `500`.

Tool responses must be JSON objects. The worker redacts responses before they
enter workflow state or gateway context. Quilt context keeps topology metadata
and patch count. Patch snapshots keep patch ID, surface, revision, and tile
count. Patch events keep event ID, sequence, operation type, and creation time.
Each redacted response is bounded to 64 KB of serialized JSON.

## Runtime Flow

`python -m main` builds the control plane, token provider, read tools, gateway,
workflow, and supervisor. The supervisor then runs until interrupted.

1. Poll for the next assigned pending or reclaimable trigger.
2. Start or resume a run for the trigger's quilt and agent principal.
3. Claim the quilt lease with the configured TTL.
4. Load the latest checkpoint for the run.
5. Start a lease renewal thread and verify ownership before and after workflow
   nodes.
6. Run the workflow nodes that load context, load events, and draft a proposal.
7. Commit checkpoints after workflow boundaries with compare-and-set protection.
8. Mark the run succeeded and the trigger completed when workflow execution
   finishes.
9. Mark the run failed and the trigger failed when an unhandled error occurs.
10. Requeue the trigger and mark the run cancelled when the lease is unavailable
    or lost.
11. Release the lease in the cleanup path when the worker still owns it.

Checkpoint recovery stores only the workflow cursor and metadata. Intermediate
tool outputs and proposal state are intentionally replayed from fresh server data
after recovery.

## Gateway Behavior

The fake gateway is the default and returns deterministic observation-only
output. If `AGENT_FEATURE_STRUCTURED_PROPOSALS_ENABLED=false`, the workflow does
not call the gateway for model output and records a feature-gated fallback.

Foundry calls require all of these settings:

* `AGENT_GATEWAY_MODE=foundry`
* `AGENT_FEATURE_FOUNDRY_ENABLED=true`
* `AGENT_FEATURE_STRUCTURED_PROPOSALS_ENABLED=true`
* `AGENT_FOUNDRY_TOKEN_SCOPE`
* `AGENT_FOUNDRY_ENDPOINT`

The governed gateway validates redacted tool context, enforces prompt and tool
size limits, applies concurrency and rate limits, retries within the configured
attempt budget, and falls back to deterministic observation-only output on
timeout or provider failure. Accepted structured actions are limited to
`{"type":"observe","target":"<quilt-id>"}`.

## Startup and Preflight

Install dependencies, then verify database access before starting a production
worker:

```bash
python -m pip install -e .
python -m control_plane_access_verification
python -m main
```

`python -m control_plane_access_verification` checks that
`AGENT_CONTROL_PLANE_DSN` authenticates as `agent_control_worker` and that the
role cannot insert into canonical `public.quilts`. A failure means the DSN is
missing, points at the wrong database role, lacks required control-plane access,
or has overly broad canonical write privileges.

## Testing

Install development dependencies from this package directory:

```bash
python -m pip install -e ".[dev]"
```

Run the normal test suite:

```bash
python -m pytest tests
```

Postgres integration tests run only when `AGENT_WORKER_POSTGRES_TEST_DSN` is set
to a live test database. Leave it unset for the default in-memory and unit-test
path.

Local server-read integration tests may use static server token mode:

```bash
export NODE_ENV=test
export AGENT_USE_STATIC_SERVER_TOKEN=true
export AGENT_TEST_STATIC_SERVER_TOKEN='test-worker-token'
python -m main
```

`AGENT_USE_STATIC_SERVER_TOKEN` is rejected unless `NODE_ENV=test`.

## Operations and Troubleshooting

Use these signals when diagnosing worker behavior:

* `configuration_error` during startup usually means a required environment
  variable is missing or a test-only token mode was enabled outside
  `NODE_ENV=test`.
* `initialization_error` can indicate missing Python dependencies, unavailable
  Agent Framework workflow APIs, or telemetry setup failures.
* Repeated `worker_idle` events mean no eligible assigned trigger is pending for
  `AGENT_PRINCIPAL_ID`.
* `worker_lease_unavailable` or `worker_lease_lost` means another owner holds
  the lease, the lease expired before renewal, or assignment changed while work
  was active.
* `worker_checkpoint_recovered` confirms the worker resumed from durable state.
* `worker_tool_failure` points to server-read authentication, route activation,
  UUID validation, timeout, or response-shape problems.
* `gateway_fallback` records provider timeout, provider failure, or concurrency
  fallback without granting mutation authority.
* `azure_monitor_exporter_disabled` is expected when
  `APPLICATIONINSIGHTS_CONNECTION_STRING` is unset.

Telemetry events redact identifier fields by hashing and omit prompts, payloads,
tool context, raw responses, and structured output. Logging is JSON-shaped for
operational events and standard Python logging for startup or crash paths.

## Non-Goals

The current MVP does not provide:

* Production static server tokens or static Foundry tokens.
* Microsoft Entra Agent ID dependency for activation.
* Canonical database writes from the worker.
* Direct canvas mutation authority from model output.
* Durable user memory.
* Default raw prompt or raw response retention.
* Agent Framework Harness integration.
* Arbitrary HTTP, SQL, filesystem, code execution, or dynamic tool creation.
* Patch claiming, ownership transfer, moderation, or Socket.IO mutation tools.

`AGENT_USE_STATIC_SERVER_TOKEN` is rejected unless `NODE_ENV=test`.
