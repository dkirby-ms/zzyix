---
title: Fantome Resident Agent Implementation Phase 4 Validation
description: Evidence-based validation of deployment, telemetry, identity, access, feature gates, and operational evidence
ms.date: 2026-08-08
ms.topic: validation
---

<!-- markdownlint-disable-file -->

## Executive Details

**Status: Partial.** The worker source, Dockerfile, CD build matrix, imperative
Container App deployment step, server app-token verifier, restricted-schema
migration, feature-gate defaults, and redacted worker logging are present. The
CD workflow is the intended deployment contract and creates or updates the
worker Container App alongside the existing server and client deployments.
However, the CD workflow does not assign the worker identity the protected
server `agent.runtime` app role or Foundry RBAC, and it accepts an opaque DSN
without proving the `agent_control_worker` login. Worker logs are not exported
through the supplied Application Insights connection string. These are
required Phase 4 activation controls, so the phase is not complete.

## Scope And Inputs

This read-only validation compares Phase 4 of the implementation plan against
the changes log, primary research, implementation details, planning log, prior
Phase 4 validation, the 2026-08-08 implementation review, and current source.
Reviewed evidence includes:

* `.copilot-tracking/plans/2026-08-07/fantome-resident-agent-implementation-plan.instructions.md`
* `.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md`
* `.copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md`
* `.copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md`
* `.copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md`
* `.copilot-tracking/reviews/rpi/2026-08-07/fantome-resident-agent-implementation-plan-004-validation.md`
* `infra/bicep/main.bicep`, `infra/bicep/main.bicepparam`, and current Bicep modules
* `.github/workflows/cd.yml`, `scripts/bootstrap-cd-environment.sh`, and `scripts/gh-vars.env.template`
* `apps/agent-worker` worker identity, telemetry, supervisor, gateway, tools, package, Docker, and README files
* server auth, route, telemetry, and control-plane migration files
* `docs/fantome-agent-entra-setup.md`

## Plan Comparison

| Plan item | Verified implementation evidence | Result |
| --- | --- | --- |
| 4.1 Independently deploy and scale the worker | The CD matrix builds the worker image and the imperative deploy step creates or updates a worker Container App at [.github/workflows/cd.yml](../../../../.github/workflows/cd.yml#L736), with system identity and replica bounds. | Covered by the intended CD deployment model |
| 4.1 Managed identity and restricted access | CD requests a system-assigned identity at [.github/workflows/cd.yml](../../../../.github/workflows/cd.yml#L814), and worker code acquires tokens through `ManagedIdentityTokenProvider` at [apps/agent-worker/src/identity.py](../../../../apps/agent-worker/src/identity.py#L12). The migration defines `agent_control_worker` and revokes public-schema writes at [apps/server/migrations/0012_agent_control_plane.sql](../../../../apps/server/migrations/0012_agent_control_plane.sql#L236) and [apps/server/migrations/0012_agent_control_plane.sql](../../../../apps/server/migrations/0012_agent_control_plane.sql#L252). No app-role assignment, Foundry role assignment, database login activation, or DSN identity check is in Bicep or CD. | Failed; activation blocker |
| 4.1 Runtime settings and feature gates | CD supplies worker gates and operating settings at [.github/workflows/cd.yml](../../../../.github/workflows/cd.yml#L159). Production startup fails closed without a durable DSN or server token scope at [apps/agent-worker/src/main.py](../../../../apps/agent-worker/src/main.py#L39). The server route gate defaults false at [apps/server/src/index.ts](../../../../apps/server/src/index.ts#L167). | Implemented in code/CD; not activation-ready |
| 4.2 Server and worker telemetry | Server Azure Monitor initialization and worker-read spans are present at [telemetry.ts](../../../../apps/server/src/telemetry.ts#L16-L57); route instrumentation is present in [agentReads.ts](../../../../apps/server/src/routes/agentReads.ts#L100-L190). Worker lifecycle, gateway, and tool events use redacted JSON logging at [telemetry.py](../../../../apps/agent-worker/src/telemetry.py#L10-L31), with call sites in [supervisor.py](../../../../apps/agent-worker/src/supervisor.py#L45-L137), [gateway.py](../../../../apps/agent-worker/src/gateway.py#L65-L142), and [tools.py](../../../../apps/agent-worker/src/tools.py#L43-L91). The worker package has no Azure Monitor/OpenTelemetry exporter dependency and startup only configures standard logging at [main.py](../../../../apps/agent-worker/src/main.py#L20-L23). | Partial; worker export missing |
| 4.3 Infrastructure and build validation | Bicep entrypoint and parameter compilation, shell syntax, workflow YAML parsing, and Python `compileall` completed without diagnostics in this session. `python3 -m pytest apps/agent-worker/tests` is unavailable because the host has no `pytest` module. | Partial evidence |

## Findings

### Critical

#### P4-001: The worker identity has no protected API app role or Foundry RBAC

The worker can request an app-only token, and the server verifier requires the
configured audience and `agent.runtime` role at [tokenVerifier.ts](../../../../apps/server/src/auth/tokenVerifier.ts#L64-L92).
However, the CD workflow only creates or assigns the system-assigned identity
at [.github/workflows/cd.yml](../../../../.github/workflows/cd.yml#L814).
Neither Bicep nor the CD workflow contains an Entra app-role assignment or
`Microsoft.Authorization/roleAssignments` resource. Foundry authorization is
only documented as a manual command at [fantome-agent-entra-setup.md](../../../../docs/fantome-agent-entra-setup.md#L172-L194).

The deployed identity therefore has no verified permission to call the
protected server reads, and Foundry activation has no infrastructure-enforced
RBAC boundary. This is a required Phase 4 success criterion, not merely an
environmental convenience. The planning log records the same unresolved
dependency as DR-01, WI-01, WI-06, and WI-09 at [fantome-resident-agent-implementation-log.md](../../../../.copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md#L4-L24).

### Major

#### P4-003: The worker DSN is not deployment-bound to `agent_control_worker`

The migration creates `agent_control_worker`, grants it access only to the
`agent_control` schema, and revokes public-schema writes at [0012_agent_control_plane.sql](../../../../apps/server/migrations/0012_agent_control_plane.sql#L235-L254).
Recovery sequence grants are present at [0013_agent_control_recovery.sql](../../../../apps/server/migrations/0013_agent_control_recovery.sql#L50-L59).

The CD workflow accepts an opaque caller-supplied DSN and passes it as an ACA
secret at [.github/workflows/cd.yml](../../../../.github/workflows/cd.yml#L744).
The PostgreSQL module provisions only an administrator and database at [postgresql.bicep](../../../../infra/bicep/modules/postgresql.bicep#L42-L83).
CD checks that a DSN exists at [.github/workflows/cd.yml](../../../../.github/workflows/cd.yml#L260-L272), but does not inspect its login or test denial of canonical writes.

`AGENT_CANONICAL_DB_ACCESS=disabled` is a process setting, not a database
authorization control. A broad credential could still be supplied while all
configuration checks pass. The restricted role topology remains the DR-04/WI-09
blocker recorded in [the planning log](../../../../.copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md#L22-L24).

#### P4-004: Worker Azure Monitor configuration is not consumed by the worker

CD supplies `APPLICATIONINSIGHTS_CONNECTION_STRING` to the worker at [.github/workflows/cd.yml](../../../../.github/workflows/cd.yml#L775).
Worker telemetry itself only serializes events to a Python logger at [telemetry.py](../../../../apps/agent-worker/src/telemetry.py#L10-L27), while [pyproject.toml](../../../../apps/agent-worker/pyproject.toml#L8-L14) declares no Azure Monitor or OpenTelemetry exporter. Worker startup does not initialize an exporter at [main.py](../../../../apps/agent-worker/src/main.py#L20-L23).

Consequently, worker lease, checkpoint, tool, gateway, and feature-gate events
are not proven to reach the configured Application Insights resource. The
server half does initialize Azure Monitor, so this finding applies specifically
to the worker telemetry path.

#### P4-005: Foundry and operating-limit activation policy remains incomplete

Foundry and structured proposals default off, and the gateway forces fake mode
when Foundry is disabled at [main.py](../../../../apps/agent-worker/src/main.py#L56-L83).
That is a verified safe default. However, research and the plan require
deployment-specific retention, backoff, queue, model budget, latency, ingress,
and cost policy before activation. These remain explicitly unresolved as DR-03
and WI-03 at [the planning log](../../../../.copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md#L18-L20) and [the follow-on list](../../../../.copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md#L105-L115).
The gate values are therefore safe for disabled rollout but insufficient for
production activation evidence.

### Minor

#### P4-006: Phase 4 telemetry export and gate-state behavior lack focused tests

Redaction and operational event call sites are present, but no focused test
proves that the Application Insights setting initializes a worker exporter or
that a lifecycle event reaches the configured backend. The worker test suite is
also not executable in the current host because `pytest` is unavailable, as
recorded in the changes log at [fantome-resident-agent-implementation-changes.md](../../../../.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L84-L97).

## Verified Passes

* The worker source and Dockerfile exist, and the CD build matrix includes the
  worker image.
* Server CD configuration now passes `FEATURE_AGENT_READS_ENABLED` and the
  agent issuer, audience, and role settings to the server Container App at [.github/workflows/cd.yml](../../../../.github/workflows/cd.yml#L695-L715). The server gate defaults false at [index.ts](../../../../apps/server/src/index.ts#L163-L168), so the earlier prior-review finding that no server activation path existed is closed by current CD evidence.
* CD derives the worker base URL from the server Container App FQDN and keeps
  server ingress internal at [.github/workflows/cd.yml](../../../../.github/workflows/cd.yml#L754-L770) and [.github/workflows/cd.yml](../../../../.github/workflows/cd.yml#L718-L733).
* Worker token acquisition uses managed identity rather than static bearer or
  API-key configuration at [identity.py](../../../../apps/agent-worker/src/identity.py#L30-L51), and the server accepts only app-role tokens for the worker route.
* Mutation, canonical database, and memory settings are explicitly disabled in
  the CD worker environment at [.github/workflows/cd.yml](../../../../.github/workflows/cd.yml#L785-L794).
* Worker event serialization drops prompt and payload fields and hashes selected
  identifiers at [telemetry.py](../../../../apps/agent-worker/src/telemetry.py#L10-L31); server worker-read attributes hash identifiers at [telemetry.ts](../../../../apps/server/src/telemetry.ts#L34-L52).
* Bicep entrypoint and parameter compilation, `python3 -m compileall apps/agent-worker/src apps/agent-worker/tests`, `bash -n scripts/bootstrap-cd-environment.sh`, and workflow YAML parsing passed during this validation.

## Coverage Assessment

Phase 4 coverage is **failed for deployment readiness** and **partial for code
and CD structure**:

* Worker image and imperative ACA deployment: covered structurally; worker Bicep resource and declarative deployment contract: missing.
* Feature-gate defaults and mutation exclusion: covered for disabled rollout.
* Server gate and internal ingress CD wiring: covered structurally.
* Managed identity token code: covered; Entra app-role/RBAC assignment: missing.
* Restricted schema SQL: covered; deployment DSN binding and negative access
  proof: missing.
* Server telemetry and redaction: covered; worker Azure Monitor export: missing.
* Deployment validation: Bicep, parameter, syntax, shell, and YAML checks passed; worker pytest is blocked by missing host tooling.

Overall status is **Failed**, and the phase must not be marked complete or
activated in a shared environment until P4-001 through P4-004 are resolved
and deployment evidence is captured.

## Recommended Next Validations

* Assign `agent.runtime` to the deployed worker identity and capture the
  assignment/resource IDs, or add an equivalent automated deployment step.
* Add and verify the required Foundry data-plane role assignment before any
  Foundry gate can be enabled.
* Connect using the actual worker DSN, assert `current_user =
  'agent_control_worker'`, and prove canonical-table writes fail.
* Add a worker Azure Monitor/OpenTelemetry exporter, emit a synthetic
  redacted lifecycle event, and verify ingestion in the target resource.
* Define and record production retention, retry/backoff, queue, budget,
  latency, ingress, and cost limits.
* Complete `docker build -f apps/agent-worker/Dockerfile apps/agent-worker` and,
  after restoring the worker module, capture Bicep validation for the complete
  deployment graph.
* Install the repository worker test tooling and run
  `python -m pytest apps/agent-worker/tests`.

## Clarifying Questions

* Is Entra app-role assignment and Foundry RBAC intentionally owned by an
  external platform repository? If so, what resource/output contract proves
  those bindings for this deployment?
* Does the target PostgreSQL environment provision `agent_control_worker` as a
  login through a separate migration/bootstrap step, or should the deployment
  create and rotate that binding?
* Which environment owns the production operating-limit values required before
  enabling non-fake gateway behavior?