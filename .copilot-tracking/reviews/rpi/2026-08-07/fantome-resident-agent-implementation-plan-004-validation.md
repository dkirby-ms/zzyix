---
title: Fantome Resident Agent Phase 4 Validation
description: Revalidation of deployment, telemetry, identity, access, and feature-gate requirements
ms.date: 2026-08-07
ms.topic: validation
---

## Scope and Status

This revalidation covers Implementation Phase 4, Deployment, Telemetry, and
Feature Gates, against the current workspace. It compares the plan, changes
log, research, planning log, current Bicep, server deployment/authorization,
worker runtime, migrations, and package metadata.

**Status: Partial.** The independently scalable worker resource, system
identity declaration, safe runtime defaults, restricted-schema migration,
server app-token verifier, and redacted application logging are present. The
deployment does not wire the managed identity to the server app role or
Foundry RBAC, does not bind the worker to the restricted PostgreSQL role, does
not configure the server's worker-route gate, and does not export worker
telemetry to Azure Monitor. Fresh server and Python syntax checks pass, but
Docker and Bicep completion evidence was not produced and the required worker
pytest command remains unavailable.

## Inputs Reviewed

* `.copilot-tracking/plans/2026-08-07/fantome-resident-agent-implementation-plan.instructions.md`
* `.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md`
* `.copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md`
* `.copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md`
* `.copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md`
* `infra/bicep/main.bicep`, `infra/bicep/main.bicepparam`, and `infra/bicep/modules/agent-worker.bicep`
* `apps/server/src/index.ts`, `apps/server/src/auth/config.ts`, `apps/server/src/auth/tokenVerifier.ts`, `apps/server/src/routes/agentReads.ts`, and `apps/server/src/telemetry.ts`
* `apps/agent-worker/src/main.py`, `identity.py`, `telemetry.py`, `supervisor.py`, `tools.py`, and `gateway.py`
* `apps/server/migrations/0012_agent_control_plane.sql` and `0013_agent_control_recovery.sql`
* `apps/agent-worker/pyproject.toml`, `Dockerfile`, `README.md`, `apps/server/package.json`, and root `package.json`

## Requirement Comparison

| Phase 4 requirement | Current evidence | Result |
| --- | --- | --- |
| Independently deploy and scale the worker | `infra/bicep/main.bicep:156-186` wires the module into the ACA environment. `infra/bicep/modules/agent-worker.bicep:202-228` declares a separate Container App with `minReplicas` and `maxReplicas`; defaults are 1 and 2 at `infra/bicep/main.bicep:89-94`. | Implemented structurally |
| Managed identity, app-role, and Foundry authorization | The worker has a system-assigned identity at `infra/bicep/modules/agent-worker.bicep:205-207`; token acquisition uses `DefaultAzureCredential` at `apps/agent-worker/src/identity.py:40-49`. Server verification requires audience and `agent.runtime` at `apps/server/src/auth/tokenVerifier.ts:130-164`. No Bicep `roleAssignments`, API application-role assignment, Foundry RBAC assignment, or target resource IDs are present. | Missing deployment wiring |
| Restricted DSN/schema binding | Migration creates `agent_control_worker`, grants `agent_control` access, and revokes public-schema writes at `apps/server/migrations/0012_agent_control_plane.sql:235-255`; recovery grants sequences at `apps/server/migrations/0013_agent_control_recovery.sql:56-60`. Bicep accepts an opaque DSN and stores it as a secret at `infra/bicep/modules/agent-worker.bicep:96-100` and `184-186`; the PostgreSQL module only provisions an administrator and database at `infra/bicep/modules/postgresql.bicep:42-83`. | Partial; not deployment-enforced |
| Server route feature-gate activation | Server reads `FEATURE_AGENT_READS_ENABLED` with default false at `apps/server/src/index.ts:167`, and registers the protected route at `apps/server/src/index.ts:870-879` and `972`. The Bicep setting with the same name is emitted only in the worker container at `infra/bicep/modules/agent-worker.bicep:134-136`; no server Container App configuration is present. | Partial; no server activation path |
| Azure Monitor telemetry export | Server initializes Azure Monitor from its connection string at `apps/server/src/telemetry.ts:21-31`, and route spans are present at `apps/server/src/telemetry.ts:34-57`. The worker receives `APPLICATIONINSIGHTS_CONNECTION_STRING` at `infra/bicep/modules/agent-worker.bicep:106-108`, but `apps/agent-worker/src/main.py:20-23` only configures standard logging and `apps/agent-worker/src/telemetry.py:10-27` only emits JSON to a logger. Worker package metadata has no Azure Monitor/OpenTelemetry exporter dependency at `apps/agent-worker/pyproject.toml:8-13`. | Partial; server only |
| Safe defaults and mutation exclusion | Bicep defaults model-free enabled and Foundry/structured proposals disabled at `infra/bicep/main.bicep:57-73` and `infra/bicep/main.bicepparam:37-41`. The worker emits `AGENT_CANONICAL_DB_ACCESS=disabled`, `AGENT_MUTATIONS_ENABLED=false`, and `AGENT_MEMORY_ENABLED=false` at `infra/bicep/modules/agent-worker.bicep:158-168`; production startup requires a durable DSN at `apps/agent-worker/src/main.py:38-45`. | Implemented, subject to access wiring |
| Fresh validation evidence | `npm --prefix apps/server run build` passed. `python3 -m py_compile apps/agent-worker/src/*.py` passed. Docker build and `az bicep build --file infra/bicep/main.bicep` were attempted but interrupted before completion. The changes log states Docker/Bicep passed, but no reproducible output was available in this revalidation. | Partial |

## Findings

### Critical

#### P4-001: Managed identity is not assigned the server app role or Foundry permissions

The worker can acquire a token through `DefaultAzureCredential`, and the
server has a separate app-token verifier that checks the configured audience
and `agent.runtime` role. However, the Bicep deployment stops at creating a
system-assigned identity. There is no app registration reference, API
application-role assignment, Foundry resource reference, or
`Microsoft.Authorization/roleAssignments` resource in the worker module or
main deployment.

Evidence: `infra/bicep/modules/agent-worker.bicep:205-207`,
`apps/agent-worker/src/identity.py:30-55`,
`apps/agent-worker/src/main.py:47-55`,
`apps/server/src/auth/tokenVerifier.ts:130-164`, and
`infra/bicep/main.bicep:159-186`.

This prevents the deployed worker from making the authenticated server reads
required by the phase. It also leaves Foundry activation without the required
RBAC boundary. The changes log and planning log correctly classify this as a
deployment-specific blocker.

### Major

#### P4-002: Worker DSN is not proven to use the restricted control-plane role

The authored SQL creates the restricted `agent_control_worker` role and
removes its public-schema write privileges. The deployment, however, accepts
`agentControlPlaneDsn` as an opaque caller-supplied value, stores it as a
secret, and passes it to the worker. It does not create a login/password for
that role, bind the ACA identity to PostgreSQL, validate the DSN role, or
prevent an administrator or canonical application DSN from being supplied.

Evidence: `apps/server/migrations/0012_agent_control_plane.sql:235-255`,
`apps/server/migrations/0013_agent_control_recovery.sql:56-60`,
`infra/bicep/modules/agent-worker.bicep:96-100` and `184-186`,
`infra/bicep/modules/postgresql.bicep:42-83`, and
`apps/agent-worker/src/main.py:38-45`.

The process flag `AGENT_CANONICAL_DB_ACCESS=disabled` is useful telemetry and
configuration, but it is not a PostgreSQL authorization control. This remains
the DR-04/WI-09 deployment blocker recorded in the planning log.

#### P4-003: Server worker-read route activation is not wired to server deployment

The server route is correctly protected by the app-token verifier and is
disabled by default. The Bicep module emits
`FEATURE_AGENT_READS_ENABLED` only into the worker container, not into any
server Container App configuration. Therefore setting the worker parameter
does not activate the server route, and the deployment has no documented
environment-level switch for enabling the matching server feature after
evidence review.

Evidence: `apps/server/src/index.ts:167`, `apps/server/src/index.ts:870-879`,
`apps/server/src/index.ts:972`, and
`infra/bicep/modules/agent-worker.bicep:134-136`.

#### P4-004: Worker Application Insights connection string is unused

The worker receives `APPLICATIONINSIGHTS_CONNECTION_STRING`, but worker
startup does not initialize an Azure Monitor/OpenTelemetry exporter. Worker
telemetry is standard-library logging only. As a result, the deployment's
connection string cannot export worker lifecycle, lease, checkpoint, tool, or
gateway events to the monitored path.

Evidence: `infra/bicep/modules/agent-worker.bicep:106-108`,
`apps/agent-worker/src/main.py:20-23`,
`apps/agent-worker/src/telemetry.py:10-27`, and
`apps/agent-worker/pyproject.toml:8-13`.

Server-side export is present at `apps/server/src/telemetry.ts:21-57`, so this
finding is specifically about the worker half of the Phase 4 telemetry
requirement.

#### P4-005: Deployment parameters still contain non-deployable identity and endpoint placeholders

`infra/bicep/main.bicepparam:23-34` uses the example worker image, a placeholder
principal ID, a placeholder tenant in the issuer, and a placeholder restricted
DSN fallback. The internal server URL is also the example value
`http://zzyix-server` at `infra/bicep/main.bicepparam:24`.

These are acceptable safe defaults for a non-activated template, but they are
not fresh deployment evidence and cannot satisfy the phase's operational
identity, ingress, or route-activation criteria without an environment overlay.

### Minor

#### P4-006: Phase 4 operational contracts lack focused worker telemetry tests

The worker has redaction and lifecycle instrumentation. The changes log lists
worker tests for identity, gateway, tools, supervisor, and workflow, but there
is no focused test proving that `APPLICATIONINSIGHTS_CONNECTION_STRING` is
consumed or that the complete Phase 4 gate state is exported through the
configured telemetry backend. This is a coverage gap rather than the primary
deployment blocker.

Evidence: `apps/agent-worker/src/telemetry.py:10-27`,
`apps/agent-worker/src/main.py:61-77`, and
`apps/agent-worker/pyproject.toml:16-19`.

## Verified Strengths

* Independent worker Container App and replica bounds are present.
* Token acquisition code refreshes managed-identity tokens and the server
  app-token verifier requires the configured application role.
* The control-plane migration has a dedicated schema, restricted role grants,
  public-schema write revocations, and recovery sequence grants.
* Model-free execution defaults on; Foundry and structured proposals default
  off; canonical database access, mutation, and memory flags default disabled.
* Worker telemetry excludes prompt, tool context, payload, response, and
  structured-output fields and hashes selected identifiers.
* Fresh TypeScript server build and Python worker syntax compilation passed.

## Coverage Assessment

Phase 4 coverage is **partial, approximately 50% by requirement area**:

* Deployment resource and independent scaling: covered.
* Safe defaults and mutation exclusion: covered in configuration, not a
  substitute for database grants.
* App-role and Foundry authorization: not wired in deployment.
* Restricted DSN/schema binding: migration covered, deployment binding absent.
* Server route activation: server code covered, deployment wiring absent.
* Azure Monitor export: server covered, worker export absent.
* Fresh validation: server/Python checks covered; Docker/Bicep completion and
  full worker pytest evidence remain unavailable.

## Recommended Next Validations

* Add or identify the deployment resources that assign `agent.runtime` to the
  worker identity and grant the required Foundry data-plane role.
* Prove the worker DSN authenticates as `agent_control_worker` and add a
  negative connection test for canonical-table writes.
* Wire `FEATURE_AGENT_READS_ENABLED`, server auth settings, and the internal
  server origin into the actual server Container App deployment.
* Add a worker Azure Monitor/OpenTelemetry exporter and verify an emitted
  lifecycle event reaches the configured Application Insights resource.
* Re-run `docker build -f apps/agent-worker/Dockerfile apps/agent-worker` and
  `az bicep build --file infra/bicep/main.bicep` to completion.
* Install the declared worker test tooling and run
  `python -m pytest apps/agent-worker/tests`.

## Clarifying Questions

* Is Entra app-role assignment and Foundry RBAC managed by an external
  platform repository? If so, which resource IDs and output contract should
  be included in this validation?
* Is the TypeScript server deployed outside `infra/bicep`? If so, where are
  its `FEATURE_AGENT_READS_ENABLED`, issuer, audience, and internal ingress
  settings provisioned?
* Does the target PostgreSQL deployment use password-based restricted-role
  DSNs or Entra identity authentication, and where is that role binding
  created and rotated?---
title: Fantome Resident Agent Phase 4 Validation
description: Revalidation of deployment, telemetry, identity, access, and feature-gate requirements
ms.date: 2026-08-07
ms.topic: validation
---

## Scope and Status

This revalidation covers Implementation Phase 4, Deployment, Telemetry, and
Feature Gates, against the current workspace. It compares the plan, changes
log, research, planning log, current Bicep, server deployment/authuration,
worker runtime, migrations, and package metadata.

**Status: Partial.** The independently scalable worker resource, system
identity declaration, safe runtime defaults, restricted-schema migration,
server app-token verifier, and redacted application logging are present. The
deployment does not wire the managed identity to the server app role or
Foundry RBAC, does not bind the worker to the restricted PostgreSQL role, does
not configure the server's worker-route gate, and does not export worker
telemetry to Azure Monitor. Fresh server and Python syntax checks pass, but
Docker and Bicep completion evidence was not produced and the required worker
pytest command remains unavailable.

## Inputs Reviewed

* `.copilot-tracking/plans/2026-08-07/fantome-resident-agent-implementation-plan.instructions.md`
* `.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md`
* `.copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md`
* `.copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md`
* `.copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md`
* `infra/bicep/main.bicep`, `infra/bicep/main.bicepparam`, and `infra/bicep/modules/agent-worker.bicep`
* `apps/server/src/index.ts`, `apps/server/src/auth/config.ts`, `apps/server/src/auth/tokenVerifier.ts`, `apps/server/src/routes/agentReads.ts`, and `apps/server/src/telemetry.ts`
* `apps/agent-worker/src/main.py`, `identity.py`, `telemetry.py`, `supervisor.py`, `tools.py`, and `gateway.py`
* `apps/server/migrations/0012_agent_control_plane.sql` and `0013_agent_control_recovery.sql`
* `apps/agent-worker/pyproject.toml`, `Dockerfile`, `README.md`, `apps/server/package.json`, and root `package.json`

## Requirement Comparison

| Phase 4 requirement | Current evidence | Result |
| --- | --- | --- |
| Independently deploy and scale the worker | `infra/bicep/main.bicep:156-186` wires the module into the ACA environment. `infra/bicep/modules/agent-worker.bicep:202-228` declares a separate Container App with `minReplicas` and `maxReplicas`; defaults are 1 and 2 at `infra/bicep/main.bicep:89-94`. | Implemented structurally |
| Managed identity, app-role, and Foundry authorization | The worker has a system-assigned identity at `infra/bicep/modules/agent-worker.bicep:205-207`; token acquisition uses `DefaultAzureCredential` at `apps/agent-worker/src/identity.py:40-49`. Server verification requires audience and `agent.runtime` at `apps/server/src/auth/tokenVerifier.ts:130-164`. No Bicep `roleAssignments`, API application-role assignment, Foundry RBAC assignment, or target resource IDs are present. | Missing deployment wiring |
| Restricted DSN/schema binding | Migration creates `agent_control_worker`, grants `agent_control` access, and revokes public-schema writes at `apps/server/migrations/0012_agent_control_plane.sql:235-255`; recovery grants sequences at `apps/server/migrations/0013_agent_control_recovery.sql:56-60`. Bicep accepts an opaque DSN and stores it as a secret at `infra/bicep/modules/agent-worker.bicep:96-100` and `184-186`; the PostgreSQL module only provisions an administrator and database at `infra/bicep/modules/postgresql.bicep:42-83`. | Partial; not deployment-enforced |
| Server route feature-gate activation | Server reads `FEATURE_AGENT_READS_ENABLED` with default false at `apps/server/src/index.ts:167`, and registers the protected route at `apps/server/src/index.ts:870-879` and `972`. The Bicep setting with the same name is emitted only in the worker container at `infra/bicep/modules/agent-worker.bicep:134-136`; no server Container App configuration is present. | Partial; no server activation path |
| Azure Monitor telemetry export | Server initializes Azure Monitor from its connection string at `apps/server/src/telemetry.ts:21-31`, and route spans are present at `apps/server/src/telemetry.ts:34-57`. The worker receives `APPLICATIONINSIGHTS_CONNECTION_STRING` at `infra/bicep/modules/agent-worker.bicep:106-108`, but `apps/agent-worker/src/main.py:20-23` only configures standard logging and `apps/agent-worker/src/telemetry.py:10-27` only emits JSON to a logger. Worker package metadata has no Azure Monitor/OpenTelemetry exporter dependency at `apps/agent-worker/pyproject.toml:8-13`. | Partial; server only |
| Safe defaults and mutation exclusion | Bicep defaults model-free enabled and Foundry/structured proposals disabled at `infra/bicep/main.bicep:57-73` and `infra/bicep/main.bicepparam:37-41`. The worker emits `AGENT_CANONICAL_DB_ACCESS=disabled`, `AGENT_MUTATIONS_ENABLED=false`, and `AGENT_MEMORY_ENABLED=false` at `infra/bicep/modules/agent-worker.bicep:158-168`; production startup requires a durable DSN at `apps/agent-worker/src/main.py:38-45`. | Implemented, subject to access wiring |
| Fresh validation evidence | `npm --prefix apps/server run build` passed. `python3 -m py_compile apps/agent-worker/src/*.py` passed. Docker build and `az bicep build --file infra/bicep/main.bicep` were attempted but interrupted before completion. The changes log states Docker/Bicep passed, but no reproducible output was available in this revalidation. | Partial |

## Findings

### Critical

#### P4-001: Managed identity is not assigned the server app role or Foundry permissions

The worker can acquire a token through `DefaultAzureCredential`, and the
server has a separate app-token verifier that checks the configured audience
and `agent.runtime` role. However, the Bicep deployment stops at creating a
system-assigned identity. There is no app registration reference, API
application-role assignment, Foundry resource reference, or `Microsoft.Authorization/roleAssignments`
resource in the worker module or main deployment.

Evidence: `infra/bicep/modules/agent-worker.bicep:205-207`,
`apps/agent-worker/src/identity.py:30-55`,
`apps/agent-worker/src/main.py:47-55`,
`apps/server/src/auth/tokenVerifier.ts:130-164`, and
`infra/bicep/main.bicep:159-186`.

This prevents the deployed worker from making the authenticated server reads
required by the phase. It also leaves Foundry activation without the required
RBAC boundary. The changes log and planning log correctly classify this as a
deployment-specific blocker.

### Major

#### P4-002: Worker DSN is not proven to use the restricted control-plane role

The authored SQL creates the restricted `agent_control_worker` role and
removes its public-schema write privileges. The deployment, however, accepts
`agentControlPlaneDsn` as an opaque caller-supplied value, stores it as a
secret, and passes it to the worker. It does not create a login/password for
that role, bind the ACA identity to PostgreSQL, validate the DSN role, or
prevent an administrator or canonical application DSN from being supplied.

Evidence: `apps/server/migrations/0012_agent_control_plane.sql:235-255`,
`apps/server/migrations/0013_agent_control_recovery.sql:56-60`,
`infra/bicep/modules/agent-worker.bicep:96-100` and `184-186`,
`infra/bicep/modules/postgresql.bicep:42-83`, and
`apps/agent-worker/src/main.py:38-45`.

The process flag `AGENT_CANONICAL_DB_ACCESS=disabled` is useful telemetry and
configuration, but it is not a PostgreSQL authorization control. This remains
the DR-04/WI-09 deployment blocker recorded in the planning log.

#### P4-003: Server worker-read route activation is not wired to server deployment

The server route is correctly protected by the app-token verifier and is
disabled by default. The Bicep module emits
`FEATURE_AGENT_READS_ENABLED` only into the worker container, not into any
server Container App configuration. Therefore setting the worker parameter
does not activate the server route, and the deployment has no documented
environment-level switch for enabling the matching server feature after
evidence review.

Evidence: `apps/server/src/index.ts:167`, `apps/server/src/index.ts:870-879`,
`apps/server/src/index.ts:972`, and
`infra/bicep/modules/agent-worker.bicep:134-136`.

#### P4-004: Worker Application Insights connection string is unused

The worker receives `APPLICATIONINSIGHTS_CONNECTION_STRING`, but worker
startup does not initialize an Azure Monitor/OpenTelemetry exporter. Worker
telemetry is standard-library logging only. As a result, the deployment's
connection string cannot export worker lifecycle, lease, checkpoint, tool, or
gateway events to the monitored path.

Evidence: `infra/bicep/modules/agent-worker.bicep:106-108`,
`apps/agent-worker/src/main.py:20-23`,
`apps/agent-worker/src/telemetry.py:10-27`, and
`apps/agent-worker/pyproject.toml:8-13`.

Server-side export is present at `apps/server/src/telemetry.ts:21-57`, so this
finding is specifically about the worker half of the Phase 4 telemetry
requirement.

#### P4-005: Deployment parameters still contain non-deployable identity and endpoint placeholders

`infra/bicep/main.bicepparam:23-34` uses the example worker image, a placeholder
principal ID, a placeholder tenant in the issuer, and a placeholder restricted
DSN fallback. The internal server URL is also the example value
`http://zzyix-server` at `infra/bicep/main.bicepparam:24`.

These are acceptable safe defaults for a non-activated template, but they are
not fresh deployment evidence and cannot satisfy the phase's operational
identity, ingress, or route-activation criteria without an environment overlay.

### Minor

#### P4-006: Phase 4 operational contracts lack focused worker telemetry tests

The worker has redaction and lifecycle instrumentation. The changes log lists
worker tests for identity, gateway, tools, supervisor, and workflow, but there
is no focused test proving that `APPLICATIONINSIGHTS_CONNECTION_STRING` is
consumed or that the complete Phase 4 gate state is exported through the
configured telemetry backend. This is a coverage gap rather than the primary
deployment blocker.

Evidence: `apps/agent-worker/src/telemetry.py:10-27`,
`apps/agent-worker/src/main.py:61-77`, and
`apps/agent-worker/pyproject.toml:16-19`.

## Verified Strengths

* Independent worker Container App and replica bounds are present.
* Token acquisition code refreshes managed-identity tokens and the server
	app-token verifier requires the configured application role.
* The control-plane migration has a dedicated schema, restricted role grants,
	public-schema write revocations, and recovery sequence grants.
* Model-free execution defaults on; Foundry and structured proposals default
	off; canonical database access, mutation, and memory flags default disabled.
* Worker telemetry excludes prompt, tool context, payload, response, and
	structured-output fields and hashes selected identifiers.
* Fresh TypeScript server build and Python worker syntax compilation passed.

## Coverage Assessment

Phase 4 coverage is **partial, approximately 50% by requirement area**:

* Deployment resource and independent scaling: covered.
* Safe defaults and mutation exclusion: covered in configuration, not a
	substitute for database grants.
* App-role and Foundry authorization: not wired in deployment.
* Restricted DSN/schema binding: migration covered, deployment binding absent.
* Server route activation: server code covered, deployment wiring absent.
* Azure Monitor export: server covered, worker export absent.
* Fresh validation: server/Python checks covered; Docker/Bicep completion and
	full worker pytest evidence remain unavailable.

## Recommended Next Validations

* Add or identify the deployment resources that assign `agent.runtime` to the
	worker identity and grant the required Foundry data-plane role.
* Prove the worker DSN authenticates as `agent_control_worker` and add a
	negative connection test for canonical-table writes.
* Wire `FEATURE_AGENT_READS_ENABLED`, server auth settings, and the internal
	server origin into the actual server Container App deployment.
* Add a worker Azure Monitor/OpenTelemetry exporter and verify an emitted
	lifecycle event reaches the configured Application Insights resource.
* Re-run `docker build -f apps/agent-worker/Dockerfile apps/agent-worker` and
	`az bicep build --file infra/bicep/main.bicep` to completion.
* Install the declared worker test tooling and run
	`python -m pytest apps/agent-worker/tests`.

## Clarifying Questions

* Is Entra app-role assignment and Foundry RBAC managed by an external
	platform repository? If so, which resource IDs and output contract should
	be included in this validation?
* Is the TypeScript server deployed outside `infra/bicep`? If so, where are
	its `FEATURE_AGENT_READS_ENABLED`, issuer, audience, and internal ingress
	settings provisioned?
* Does the target PostgreSQL deployment use password-based restricted-role
	DSNs or Entra identity authentication, and where is that role binding
	created and rotated?
---
title: Fantome Resident Agent Phase 4 Validation
description: Evidence-based validation of deployment, telemetry, and feature-gate requirements
ms.date: 2026-08-07
ms.topic: validation
---

## Scope and Status

Validation scope is Implementation Phase 4 only: independently deployed worker
Container App, managed identity and restricted access, disabled-by-default
feature gates, redacted telemetry, operational evidence, and Bicep validity.

**Status: Partial.** The worker Container App, safe runtime defaults, control
plane role migration, and redacted logging are present. The deployed worker
cannot obtain the app-only token required by the protected server read routes,
and the deployment does not prove or enforce restricted database access.
These defects prevent the claimed deployment from operating end to end.

## Inputs Reviewed

* Plan: `.copilot-tracking/plans/2026-08-07/fantome-resident-agent-implementation-plan.instructions.md`
* Changes log: `.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md`
* Research: `.copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md`
* Planning log: `.copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md`
* Live Phase 4 infrastructure and worker/server implementation, including the
	recently changed `infra/bicep/modules/agent-worker.bicep`

## Requirement Comparison

| Plan item | Changes-log claim | Verified evidence | Result |
| --- | --- | --- | --- |
| Independently deploy a scalable ACA worker | Added `agent-worker.bicep` and wired it from `main.bicep` | The module declares `Microsoft.App/containerApps` at `infra/bicep/modules/agent-worker.bicep:166`, uses the existing managed environment, and has independent minimum and maximum replica parameters. The entry deployment wires it at `infra/bicep/main.bicep:135`. | Partial |
| Configure managed identity and app-only worker access | Worker deployment has managed identity and restricted configuration | A system-assigned identity exists at `infra/bicep/modules/agent-worker.bicep:170`. The only worker HTTP credential path is `AGENT_SERVER_BEARER_TOKEN` from `apps/agent-worker/src/main.py:49`; Bicep supplies neither that variable nor token acquisition. The server mounts its app-token-protected route at `apps/server/src/index.ts:1008`. | Missing required integration |
| Restrict PostgreSQL access to the control plane | Restricted configuration and no broad canonical credentials | Migration `apps/server/migrations/0012_agent_control_plane.sql:235-255` creates `agent_control_worker`, grants DML only on `agent_control`, and revokes public-schema writes. Bicep accepts an opaque optional DSN at `infra/bicep/modules/agent-worker.bicep:24` and stores it as a secret at lines 73-80 and 146-151; it neither provisions nor validates use of `agent_control_worker`. | Partial |
| Default activation gates to safe behavior | Model-free or disabled defaults | Bicep emits Foundry and structured-proposal flags at `infra/bicep/modules/agent-worker.bicep:106-114`; parameters default to `false` in `infra/bicep/main.bicep:45-51` and `infra/bicep/main.bicepparam:28-31`. It explicitly disables canonical database access, mutations, and memory at `infra/bicep/modules/agent-worker.bicep:122-130`. | Implemented |
| Instrument operational states without raw payloads | Added worker and server telemetry | Worker events omit `prompt`, `tool_context`, `payload`, `response`, and `structured_output` at `apps/agent-worker/src/telemetry.py:12-27`. Supervisor emits trigger, lease-loss, checkpoint, failure, and release events at `apps/agent-worker/src/supervisor.py:42-89`; gateway fallbacks and rate limiting are emitted at `apps/agent-worker/src/gateway.py:102-182`. Server route spans are implemented in `apps/server/src/telemetry.ts:24-45`. | Partial |
| Validate Bicep, container, and server build | Changes log says Bicep and Docker validation passed | VS Code diagnostics report no errors for `infra/bicep/main.bicep`, `infra/bicep/modules/agent-worker.bicep`, server telemetry/routes, or worker telemetry/main. The requested terminal validation command returned an unrelated interrupted terminal stream, so a fresh `az bicep build`, Docker build, and server build result could not be confirmed in this session. | Partial |

## Findings

### Critical

#### P4-001: Managed identity cannot authenticate worker reads

The worker is deployed with a system-assigned identity, but no code or Bicep
configuration exchanges that identity for an Entra access token. The worker
only forwards an externally supplied `AGENT_SERVER_BEARER_TOKEN`
(`apps/agent-worker/src/main.py:49`), while the module supplies no such
environment variable. The target server route is registered behind
`requireAgentHttpPrincipal` at `apps/server/src/index.ts:1008` and the server
feature defaults disabled at `apps/server/src/index.ts:165`.

This fails the Phase 4 requirement for managed-identity worker access and the
research requirement for app-only managed-identity authentication. A deployed
worker will issue unauthenticated requests unless an out-of-band secret is
added, which would not satisfy the managed-identity design.

Required remediation: acquire an app-only token using the worker identity,
configure the intended audience and required role, assign that role to the
identity, and pass the token on each worker read request.

### Major

#### P4-002: Infrastructure does not provide an activation path for server worker-read routes

The server evaluates `FEATURE_AGENT_READS_ENABLED` as false by default at
`apps/server/src/index.ts:165`, then registers the internal route only when
the flag is true at `apps/server/src/index.ts:1007-1009`. No Bicep file
contains `FEATURE_AGENT_READS_ENABLED`; the infrastructure search found only
worker `AGENT_*` settings. `agentServerBaseUrl` defaults to the placeholder
`http://zzyix-server` at `infra/bicep/main.bicep:28`.

Disabled-by-default is correct, but no environment-specific deployment
parameter or documented prerequisite enables the matching server route after
evidence review. The worker deployment therefore has no functional
model-free activation path.

#### P4-003: Restricted database access is conventional, not enforced by the deployment

The migration has a correct least-privilege role boundary: it creates
`agent_control_worker` at `apps/server/migrations/0012_agent_control_plane.sql:235-239`,
grants only `agent_control` DML at lines 242-247, and revokes public-schema
writes at lines 250-255. However, the Bicep module accepts any optional DSN
at `infra/bicep/modules/agent-worker.bicep:24` and does not create a database
principal, bind the ACA identity to PostgreSQL, or verify that the DSN uses
the restricted role. This is the unresolved DR-04 topology called out in the
planning log at `.copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md:22`
and again as WI-09 at line 110.

The deployment can receive a broad canonical credential despite the
`AGENT_CANONICAL_DB_ACCESS=disabled` process flag. That flag is not a database
authorization control.

#### P4-004: Bicep publishes a control-plane schema name that differs from the implementation

All deployment defaults set `agent_control_plane`:
`infra/bicep/main.bicep:54`, `infra/bicep/main.bicepparam:32`, and
`infra/bicep/modules/agent-worker.bicep:43`. The migration creates
`agent_control` at `apps/server/migrations/0012_agent_control_plane.sql:1`,
the Drizzle schema selects it at `apps/server/src/db/schema.ts:41`, and the
worker SQL hard-codes it, beginning at
`apps/agent-worker/src/control_plane.py:215`.

`AGENT_CONTROL_PLANE_SCHEMA` is emitted at
`infra/bicep/modules/agent-worker.bicep:118` but is not read by the worker.
This is a misleading deployment contract and will break any operational setup
that consumes the advertised schema setting.

#### P4-005: The worker does not export the configured Application Insights telemetry

Bicep provides `APPLICATIONINSIGHTS_CONNECTION_STRING` at
`infra/bicep/modules/agent-worker.bicep:90-92`, but the worker only configures
standard logging in `apps/agent-worker/src/main.py:17-19`. Its dependencies
are limited to `agent-framework` and `psycopg` in
`apps/agent-worker/pyproject.toml:10-13`, and `emit_event` writes JSON to a
Python logger at `apps/agent-worker/src/telemetry.py:12-26`.

The redacted log records cover required lifecycle events, but there is no
worker Azure Monitor exporter, trace, or metric implementation. This does not
meet the requested trace, metric, and log operational evidence surface, and
the deployed connection string is currently unused by worker code.

### Minor

#### P4-006: Phase 4 telemetry and deployment contracts lack focused tests

There are no telemetry or feature-gate tests under `apps/agent-worker/tests`.
The existing gateway tests exercise fake mode, limits, and fallback in
`apps/agent-worker/tests/test_gateway.py:14-67`; tool testing confirms event
payload redaction in `apps/agent-worker/tests/test_tools.py:42-65`. Neither
proves that feature-gate state is emitted safely, that a deployment environment
is accepted, nor that the Application Insights connection is consumed.

The plan specifically requires operational evidence for gate-disabled states,
trigger processing, lease outcomes, tools, budgets, fallback, and checkpoints.
Source instrumentation provides most events, but test coverage does not verify
the telemetry contract or infrastructure parameters.

## Verified Strengths

* The worker is a separate Container App with independently configurable
	replica bounds and a system-assigned identity.
* Foundry calls and structured proposals default to disabled, while the
	deterministic model-free runtime defaults enabled. Mutation, memory, and
	canonical database process flags default disabled.
* Worker telemetry removes prompt and tool payload fields and hashes selected
	identifier fields before logging.
* The server and worker include named lifecycle, fallback, and tool-failure
	events needed for operational diagnosis.
* Current editor diagnostics found no errors in the changed Bicep or touched
	telemetry and route sources.

## Coverage Assessment

Phase 4 requirement coverage is estimated at **45% complete**.

* Deployment resource structure and safe worker gates are implemented.
* Control-plane restriction exists in database migration but is not tied to the
	deployed identity or DSN.
* Redacted log instrumentation exists, but Azure Monitor trace and metric
	export is absent.
* Identity-based server access and server-route activation are missing.
* Full command evidence for Bicep, Docker, and server compilation is not
	independently reproducible from this validation session.

## Unmet Requirements

* Bind the worker managed identity to the Entra app role and implement token
	acquisition for server reads.
* Configure an internal server origin and a controlled way to enable
	`FEATURE_AGENT_READS_ENABLED` only after evidence review.
* Provision or validate the `agent_control_worker` connection and prevent a
	canonical database DSN from being supplied to the worker.
* Align the Bicep schema default with `agent_control`, or make the worker SQL
	consume a validated schema setting.
* Export worker traces and metrics through Azure Monitor, and test redaction
	and feature-gate telemetry behavior.
* Re-run `az bicep build --file infra/bicep/main.bicep`,
	`docker build -f apps/agent-worker/Dockerfile apps/agent-worker`, and
	`npm --prefix apps/server run build` in a non-interrupted terminal session.

## Clarifying Questions

* Is managed-identity token acquisition and app-role assignment provisioned by
	an external platform repository? If so, provide the deployment contract and
	the target API audience so P4-001 can be revalidated.
* Is the TypeScript server deployed by infrastructure outside `infra/bicep`?
	If so, identify the owner of `FEATURE_AGENT_READS_ENABLED` and the internal
	service-discovery origin for `agentServerBaseUrl`.
* Which PostgreSQL authentication mechanism should connect the ACA worker to
	`agent_control_worker`, and where is its rotation or identity binding
	provisioned?