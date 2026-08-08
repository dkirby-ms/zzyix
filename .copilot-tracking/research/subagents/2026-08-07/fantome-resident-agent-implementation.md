---
title: Fantome Resident Agent Implementation Research
description: Verified repository implementation implications for the accepted Fantome resident-agent architecture
ms.date: 2026-08-07
ms.topic: concept
keywords:
  - fantome
  - resident agents
  - implementation research
  - agent framework
---

## Research Scope

Investigate the implementation implications of the accepted Fantome resident-agent architecture for this repository. Scope is limited to existing authentication and principal handling, PostgreSQL and Drizzle persistence, server contracts, client and test patterns, telemetry and deployment, Python and Microsoft Agent Framework availability, and official Microsoft documentation where required.

## Working Hypothesis

The current TypeScript server already centralizes canonical quilt authority and is therefore the integration boundary for agent calls. The missing implementation surface is expected to be a Python worker plus durable agent-control-plane schema, with server extensions for app-only agent principals and typed read-only contracts.

## Verification Plan

Confirm whether existing server boundaries expose authenticated, revision-safe read contracts and whether Drizzle migrations, observability, and Container Apps infrastructure can host a separate Python worker without direct canonical-table writes.

## Verified Architecture Requirements

The accepted architecture mandates a durable, one-workflow-per-quilt Python
runtime. It must acquire and renew a PostgreSQL lease, checkpoint at controlled
workflow boundaries, deduplicate bounded triggers, and stop when its lease is
lost. The TypeScript server remains the authority for authentication, principal
resolution, authorization, ownership, revisions, collision checks,
idempotency, and event ordering.

V1 is read-only. The model may use fixed typed read tools and return structured
proposals or conversational output. The model cannot mutate a canvas or make
authority decisions. The Python service must call Foundry only through a
governed gateway and must use a managed-identity app-only token to call the
server as a pre-provisioned agent principal.

Sources: `docs/fantome-resident-agent-architecture.md` lines 43-76, 80-124,
128-185, 188-283, and 302-336.

## Repository Findings

### Authentication And Principals

The present server authentication path is delegated-user-only.

* `apps/server/src/auth/tokenVerifier.ts` lines 14-20 define an identity with
  `scope` but no application-role or caller-kind information.
* `apps/server/src/auth/tokenVerifier.ts` lines 22-60 extract `scp` or `scope`
  and require `AUTH_REQUIRED_SCOPE`; no branch accepts an app-only `roles`
  claim.
* `apps/server/src/auth/principalContext.ts` lines 36-82 resolve an external
  issuer and subject mapping, update human profile metadata, and provision a
  new principal with `kind: 'human'` when missing. This conflicts with the
  requirement to reject unknown agent identities.
* `apps/server/src/auth/httpAuth.ts` lines 38-62 verifies the bearer token and
  attaches an immutable server-derived principal context. This is the correct
  extension point for a distinct agent request path.
* `apps/server/src/auth/socketAuth.ts` lines 38-75 has the same delegated-token
  verifier and resolver pattern. It does not need to be opened to agents in V1,
  because the approved tooling is read-only HTTP, not arbitrary Socket.IO.
* `apps/server/src/db/types.ts` lines 12-18 permit principal kinds only as
  `human` and `system`. `apps/server/src/db/schema.ts` lines 68-97 enforces
  that closed set with a database check constraint.
* `apps/server/src/db/repository.ts` lines 348-468 and 3013-3030 expressly
  require `kind === 'human'` to claim or receive an automatic patch. Retaining
  that restriction protects the V1 no-mutation boundary.

Implementation implication: add `agent` to the principal-kind enum and
migration, but do not reuse auto-provisioning. Add a separate app-token
verifier and an agent-principal resolver that validates issuer, audience,
algorithm, expiry, required `agent.runtime` role, stable app identity, and
active pre-provisioned agent mapping. Reuse the immutable `PrincipalContext`
after this resolution. The agent path must reject both unknown mappings and
inactive principals.

### Canonical Authority And Tool Contracts

The authority boundary already exists in server repositories, not in an
independent public API contract.

* `apps/server/src/db/repository.ts` lines 1784-2017 and 2018-2150 implement
  canonical placement and removal, including transactions, revision handling,
  authorization, operation binding, audit events, and persisted operations.
* `apps/server/src/index.ts` lines 1921-2016 invokes those mutation functions
  only from authenticated Socket.IO handlers.
* `apps/server/src/db/repository.ts` lines 3360-3436 builds a
  principal-aware quilt delivery context from topology, patch membership, and
  visibility policy.
* `apps/server/src/db/repository.ts` lines 3483-3605 supplies a read-only,
  repeatable-read snapshot after server-side authorization. It supports fine
  and aggregate views and scoped chunks.
* `apps/server/src/db/repository.ts` lines 3607-3668 supplies authorized,
  ordered durable-event replay after a cursor.
* `apps/server/src/index.ts` lines 2113-2210 exposes those reads only within
  the `subscribe_quilt_area` Socket.IO lifecycle. Its public HTTP reads are
  canonical discovery, eligible patches, occupancy, and navigation at lines
  1025-1185. There is no HTTP patch snapshot or recent patch-events endpoint.

Implementation implication: preserve the repositories as the canonical read
implementation, but expose narrow authenticated HTTP endpoints for the worker:
agent status, assigned patch metadata, authorized patch snapshot, authorized
recent events, and quilt metadata. These endpoints must call the existing
authorization-aware repository functions, apply payload and cursor limits, and
return stable versioned contracts. Do not let Python connect to Socket.IO or
import server code.

### Durable State And Migrations

The database is PostgreSQL through Drizzle and already uses leases,
transactions, advisory locks, idempotency, and checked constraints.

* `apps/server/src/db/schema.ts` lines 205-229 defines expiring
  `quilt_presence_leases`, with quilt-principal expiry indexes.
* `apps/server/src/db/repository.ts` lines 1581-1736 uses PostgreSQL advisory
  locks and lease rows to serialize presence changes across replicas.
* `apps/server/src/db/migrate.ts` lines 13-106 applies ordered SQL migrations
  in development, but production startup only verifies that all authored
  migrations are already applied.
* `apps/server/migrations/0006_authentication_authorization.sql` lines 1-165
  demonstrates the authored SQL style for constrained tables, foreign keys,
  audit records, and indexes. Its generated snapshots are under
  `apps/server/migrations/meta/`.
* `apps/server/src/db/schema.ts` lines 401-548 contains
  `authorization_audit_events`, including actor and subject principals, quilt,
  patch, operation ID, source channel, policy version, before/after JSON, and
  outcome indexes.

Implementation implication: create a migration and matching Drizzle tables for
agent assignments and lifecycle, per-quilt leases, runs/checkpoints, triggers,
tool-call results, model-call metadata, and agent audit history. Use a unique
active-work or lease key on quilt ID plus transactional compare-and-set lease
renewal. Lease acquisition should use `FOR UPDATE SKIP LOCKED` or an advisory
lock, expiry predicates, and a random lease owner/run ID. Keep checkpoint data
as versioned application JSON, not an opaque Agent Framework session dump.

The Python worker may connect directly to this new agent-control-plane schema
for atomic leases, checkpoints, and triggers. It must not receive write grants
to canonical quilt, patch, tile, ownership, or authorization tables. A
restricted database role is required to make that architectural boundary
enforceable.

### Telemetry, Deployment, And Runtime Availability

* `apps/server/src/telemetry.ts` lines 1-26 initializes Azure Monitor
  OpenTelemetry from `APPLICATIONINSIGHTS_CONNECTION_STRING` and makes
  telemetry optional on initialization failure.
* `infra/bicep/main.bicep` lines 32-80 provisions the Log Analytics-backed ACA
  environment, diagnostics, and private PostgreSQL server. It exports the
  Application Insights connection string at lines 83-90.
* `infra/bicep/modules/monitoring.bicep` lines 1-44 creates the workspace and
  Application Insights component. No Bicep resource declares a
  `Microsoft.App/containerApps` application or managed identity.
* `apps/server/package.json` lines 20-31 contains only TypeScript and Node
  runtime dependencies; repository-wide search found no Python project,
  `pyproject.toml`, lockfile, Agent Framework dependency, Foundry client, or
  worker container definition.

Implementation implication: introduce a dedicated Python service directory
with a pinned Python version, `pyproject.toml` or equivalent lockable manifest,
`agent-framework`, Foundry and Azure identity dependencies, a Dockerfile, and
contract tests. Add a Container App to the existing environment with a
user-assigned or system-assigned managed identity, internal network access to
PostgreSQL, model-service egress as required, secretless workload identity, and
the existing Application Insights connection string. Use a separate worker
revision and scale rule from the public server.

### Existing Test Anchors

* `apps/server/src/auth/tokenVerifier.test.ts` lines 18-118 signs local JWTs
  and verifies issuer, audience, scope, expiry, algorithm, JWKS rotation, and
  outage behavior. Add app-role success and failure fixtures beside it.
* `apps/server/src/auth/principalContext.postgres.integration.test.ts` lines
  25-116 exercises concurrent provisioning and inactive-principal failure.
  Add pre-provisioned agent lookup and unknown-agent rejection tests here or in
  a peer integration suite.
* `apps/server/src/db/ownership.postgres.integration.test.ts` lines 94-369
  exercises serial ownership races, idempotency, and durable audit behavior.
  Use the same PostgreSQL integration harness for lease takeovers, trigger
  deduplication, checkpoint recovery, and restricted agent-state writes.
* `e2e/quilt-reconnect.spec.ts` lines 68-259 verifies cross-replica presence,
  authorization denial, snapshot subscription, stale revision rejection,
  event broadcasting, and reconnect replay. Extend it only after worker HTTP
  contracts exist, with an agent app-token fixture and a separate process or
  containerized worker.

## Microsoft Documentation Findings

Microsoft Agent Framework documents a Python package install as
`pip install agent-framework`. The Foundry Python client can use
`azure.identity.AzureCliCredential` locally and create an agent from a Foundry
project endpoint. Its overview distinguishes an agent for bounded
language-model behavior from a workflow for explicit multi-step control. Its
workflow documentation describes type-safe graph workflows, checkpoints,
executors, events, and Python functional workflows.

This supports the accepted design of a small supervisor plus explicit workflow
around the agent. The implementation should favor the graph workflow API for
fixed lifecycle checkpoints and typed message routing. The functional Python
workflow API is experimental, so it should not be the V1 control-plane
dependency.

Microsoft Entra documentation confirms that `scp` appears only in user tokens,
while client-credential application tokens receive application permissions in
the `roles` claim. It also requires validating audience, issuer, expiry, and
signature. This aligns with a separate app-only agent authentication branch and
rules out accepting `scp` and `roles` as interchangeable.

Sources:

* [Microsoft Agent Framework overview](https://learn.microsoft.com/en-us/agent-framework/overview)
* [Microsoft Agent Framework workflows](https://learn.microsoft.com/en-us/agent-framework/workflows/overview)
* [Microsoft identity platform access token claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference)
* [Configure protected web API apps](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-protected-web-api-app-registration)

## Alternatives And Recommendation

### Worker Runtime

| Option | Assessment |
| --- | --- |
| Integrate the resident loop into the TypeScript server | Reuses code and deployment, but conflicts with the accepted Python Agent Framework decision, couples public request serving to long-running lease work, and makes independent scaling, failure isolation, package pinning, and model egress harder. |
| Separate Python worker in the existing ACA environment | Matches the accepted architecture and framework, isolates lifecycle failures, permits independent autoscaling, and leaves server authority intact. It requires a new build, Container App, identity, and versioned cross-service contracts. |

Recommendation: use a separate Python worker. Treat the TypeScript server as
the security and canonical-domain service rather than a host for the workflow.

### State And Read Access

| Option | Assessment |
| --- | --- |
| Direct worker access to all canonical PostgreSQL tables | Lowest latency, but bypasses the server's authorization and delivery-policy implementation and violates the accepted authority boundary. |
| Application API for all state, including worker leases and checkpoints | Preserves a single domain API, but adds coordination endpoints and makes transactional lease/checkpoint handling unnecessarily remote for the control plane. |
| Direct PostgreSQL access only to a restricted agent-control-plane schema, server HTTP API for all canonical reads | Keeps lease/checkpoint transactions durable and efficient while preserving server-owned authorization and canonical state. Requires a restricted database role and typed server read contracts. |

Recommendation: use the third option. It is the smallest design that satisfies
the accepted authority boundary and the lease/crash-recovery requirements.

### Agent Framework Shape

| Option | Assessment |
| --- | --- |
| Agent Framework Harness | Explicitly deferred by the architecture and adds general planning, memory, context compaction, approvals, and file behavior outside the V1 threat model. |
| Agent inside graph workflow with a separate supervisor | Supports typed tool boundaries, explicit control flow, durable checkpoints, and bounded lifecycle policy. |
| Agent-only loop | Has less lifecycle control and makes lease, retry, and checkpoint policy implicit. |

Recommendation: use an Agent inside a graph workflow, invoked by a lightweight
supervisor that owns lease and trigger control.

## Phased Recommended Approach

1. Add the identity and schema foundation. Extend principal kinds with `agent`,
   add an auditable pre-provisioning mechanism, add the separate app-role JWT
   verifier and resolver, and author control-plane tables and migration tests.
2. Add server-owned read tools. Define versioned HTTP contracts and handlers for
   quilt metadata, agent assignment/status, patch metadata, bounded snapshots,
   and bounded recent events. Reuse the existing authorization-aware repository
   queries and add structured audit events for every call.
3. Create the Python runtime. Add a pinned worker project, a fake gateway,
   schema-validated read-only tool clients, structured proposal output, and an
   explicit graph workflow. Keep memory disabled and exclude user content from
   prompts.
4. Implement durable orchestration. Add per-quilt lease claim/renew/release,
   trigger idempotency and backpressure, versioned checkpoints, crash recovery,
   pause/drain/disable lifecycle transitions, and tests that simulate lease loss
   between each checkpoint.
5. Deploy and observe. Add the worker Container App and managed identity,
   grant only required database and app-role access, route telemetry through
   Azure Monitor, and add redaction plus model/tool/run metrics without raw
   prompts or raw responses by default.
6. Activate incrementally. Enable read-only runs, then feature-flag structured
   proposals. Require the architecture's activation evidence, including
   cross-replica recovery, tool authorization, malformed output, prompt
   injection, Foundry failure fallback, and cost/latency budget tests. Do not
   authorize model-driven mutations in this track.

## Remaining Questions

* Which Entra API registration and tenant model currently back
  `AUTH_TRUSTED_ISSUER` and `AUTH_API_AUDIENCE`, and can it safely define and
  assign the `agent.runtime` app role to a Container App identity?
* Should each agent own a dedicated pre-provisioned principal mapping, or should
  a shared worker application identity carry an additional immutable agent ID?
  The architecture favors an auditable one-agent-to-principal mapping, but the
  provisioning and rotation operation is not yet defined.
* Which component produces initial triggers, and which business event defines a
  meaningful new trigger versus a coalescible duplicate?
* What retention periods, redaction rules, cost budgets, retry budget, and
  maximum trigger queue size will govern the new tables and telemetry?
* Is a worker-to-server private internal ingress available in the intended ACA
  deployment, or must the worker call a public server endpoint protected by the
  app-only token?
