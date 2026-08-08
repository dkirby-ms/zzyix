---
title: Fantome Resident Agent Phase 1 Validation
description: Current-workspace RPI validation of Phase 1 server identity and read contracts
ms.date: 2026-08-07
ms.topic: validation
---

## Scope And Sources

Phase reviewed: Implementation Phase 1, Server Identity and Read Contracts.

Sources reviewed in full:

* `.copilot-tracking/plans/2026-08-07/fantome-resident-agent-implementation-plan.instructions.md`
* `.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md`
* `.copilot-tracking/research/2026-08-07/fantome-resident-agent-implementation-research.md`
* `.copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md`
* `.copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md`
* Current workspace implementation and focused test files

The plan marks Steps 1.1 through 1.4 complete. The changes log claims the
agent-principal migration, app-only verification, pre-provisioned principal
resolution, internal typed reads, route registration, and corresponding tests.
The planning log retains Entra topology, provisioning operations, and
environment-specific app-only configuration as deployment prerequisites.

## Status

**Partial**. Principal modeling, app-only verification, active pre-provisioned
agent mapping, startup route registration, server-authority repository reuse,
and response bounds are present in the current code. The exact research
contract for an agent-assigned patch is not met because assignments are
quilt-scoped and authorize every patch in the assigned quilt. Required worker
read audit behavior and live end-to-end app-auth route coverage are also not
demonstrated.

## Plan Item Comparison

| Plan item | Current workspace evidence | Result |
|-----------|-------------------|--------------------|--------|
| 1.1 Extend the principal model for agents | `agent` principal kind, migration, and active/unknown/inactive integration cases are present | Complete |
| 1.2 Add app-only authentication | Separate app verifier requires issuer, audience, algorithm, expiry, application identity, and configured role in `roles` | Complete |
| 1.3 Create worker-only HTTP reads | Startup registration, app-only middleware, typed routes, assignment checks, and response bounds are present; patch assignment granularity and audit behavior remain incomplete | Partial |
| 1.4 Validate server changes | Focused tests exist; the requested combined run was interrupted and no live app-token route test is present | Partial |

## Verified Evidence

### Principal Model And Resolution

* `apps/server/src/db/types.ts:16,42` adds `agent` to the principal-kind values
	and exported type.
* `apps/server/src/db/schema.ts:70-89` uses the principal-kind values in the
	persisted `principals` check constraint while retaining `status`.
* `apps/server/migrations/0011_agent_principal_kind.sql:1-2` drops and recreates
	that constraint with `human`, `system`, and `agent`; the migration journal
	records it as entry 11.
* `apps/server/src/auth/principalContext.ts:117-143` rejects non-app identities,
	queries the existing mapping, and rejects unknown, non-agent, or inactive
	principals without calling the human auto-provisioning path.
* `apps/server/src/auth/principalContext.postgres.integration.test.ts:134-181`
	covers active pre-provisioned acceptance, unknown-agent rejection without row
	creation, and inactive-agent rejection.

### App-Only Authentication

* `apps/server/src/auth/config.ts:82-98` provides separately configurable
	issuer, audience, and required application role, defaulting the role to
	`agent.runtime`.
* `apps/server/src/auth/tokenVerifier.ts:73-96` derives the application identity
	from `azp` or `appid`, requires the configured value in `roles`, and returns
	an `app_agent` identity with no delegated scopes.
* `apps/server/src/auth/tokenVerifier.ts:130-155` uses `jwtVerify` with the app
	issuer, audience, accepted algorithm, and required token claims.
* `apps/server/src/index.ts:845-866` creates a separate app verifier and passes
	it with `resolveAgentPrincipal` to immutable HTTP principal middleware.
* `apps/server/src/auth/tokenVerifier.test.ts:126-188` covers success, role
	failure despite delegated scope, issuer, audience, expiry, and algorithm
	failures.

### Canonical Authority Reuse

* `apps/server/src/routes/agentReads.ts:81-86` injects only three server
	repository read dependencies. It exposes no mutation dependency.
* `apps/server/src/routes/agentReads.ts:148-158` and `176-190` pass the mapped
	principal ID into snapshot and event-replay reads.
* `apps/server/src/db/repository.ts:3483-3594` authorizes snapshots inside a
	read-only transaction. `apps/server/src/db/repository.ts:3607-3656`
	authorizes durable-event replay before selecting operations.

## Findings

### Critical

* None identified. The prior startup-registration finding is fixed: the route
  is mounted by `registerAgentReadRoutes` at
  [apps/server/src/index.ts](../../../../apps/server/src/index.ts#L868-L883),
  invoked during initialization at
  [apps/server/src/index.ts](../../../../apps/server/src/index.ts#L972-L974),
  and covered before canonical discovery by
  [apps/server/src/index.test.ts](../../../../apps/server/src/index.test.ts#L13-L29).

### Major

* **Patch assignment is broader than the required assigned-patch contract.**
  The assignment table stores only quilt and agent identifiers in
  [apps/server/migrations/0012_agent_control_plane.sql](../../../../apps/server/migrations/0012_agent_control_plane.sql#L4-L21).
  `isAgentAssignedPatch` joins any patch in that quilt and accepts it for an
  active assignment in
  [apps/server/src/db/repository.ts](../../../../apps/server/src/db/repository.ts#L3661-L3672).
  The route does enforce this predicate, but an assigned agent can therefore
  read every patch in its assigned quilt rather than only one assigned patch.

* **Worker-read audit behavior is not implemented or evidenced.** The route
  emits telemetry but does not write the existing authorization audit store in
  [apps/server/src/routes/agentReads.ts](../../../../apps/server/src/routes/agentReads.ts#L91-L122).
  No audit record is asserted by the route tests in
  [apps/server/src/routes/agentReads.test.ts](../../../../apps/server/src/routes/agentReads.test.ts#L125-L157).

### Minor

* Response bounds are implemented, but direct oversized context, snapshot, and
  JSON-byte tests are absent. Current route tests cover replay limits and input
  validation in [apps/server/src/routes/agentReads.test.ts](../../../../apps/server/src/routes/agentReads.test.ts#L106-L157).

* No test sends a valid app-only token through the mounted route to an active
  pre-provisioned agent assignment. Verifier, principal, startup, and router
  tests remain separate.

## Validation Executed

| Check | Result |
|---|---|
| Existing workspace `npm run test` | Passed in the provided terminal context, exit code 0 |
| Focused server command including PostgreSQL integration | Interrupted, exit code 130 |
| Focused non-integration server command | Interrupted, exit code 130 |
| Current source and test inspection | Completed |

The interrupted commands prevent claiming a fresh passing execution of every
Phase 1 command in this session. They do not disprove the current source
implementation.

## Coverage Assessment

Phase 1 has current implementation evidence for principal modeling, app-only
role validation, active pre-provisioned mapping, startup route registration,
server-owned repository reads, and response bounds. It is **Partial** because
assignment granularity and audit behavior remain Major gaps, while overflow and
live app-token route tests remain Minor validation gaps.

## Clarifying Questions

* Is the intended assignment unit a whole quilt or one patch? Research and
  Phase 1 details say assigned patch, while the current schema is quilt-scoped.
* What durable audit record is required for worker reads? Current code emits
  telemetry but has no route-level authorization-audit contract.

## Recommended Next Validations

* Add a patch-specific assignment key or document the quilt-scoped contract and
  test denial outside the assigned scope.
* Define and test the worker-read audit record for success and denial outcomes.
* Add overflow tests and a live valid app-token route integration test.
* Re-run the focused Phase 1 commands in an environment where PostgreSQL test
  setup and the test runner complete without interruption.