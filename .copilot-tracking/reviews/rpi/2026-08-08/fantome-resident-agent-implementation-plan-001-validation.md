---
title: Fantome Resident Agent Implementation Phase 1 Validation
description: Evidence-based validation of Phase 1 server identity and read contracts.
ms.date: 2026-08-08
---

## Validation Status

**Partial**

Phase 1 is implemented for principal modeling, app-only token verification,
startup route registration, active-status mapping, server-owned reads, and
response-size controls. It is not fully compliant with the planned
assigned-patch boundary because the persisted assignment is quilt-scoped and
therefore authorizes every patch in that quilt. Durable worker-read audit
records are also not implemented or evidenced.

No product source, test, plan, changes log, or research file was modified.

## Scope And Sources

This validation covers only Implementation Phase 1, Server Identity and Read
Contracts, including Steps 1.1 through 1.4. The plan, changes log, research,
planning log, implementation details, prior Phase 1 validation, current server
source, and focused tests were read and compared.

The prior Phase 1 validation reported **Partial**, with the same two substantive
gaps: quilt-wide assignment instead of patch-specific assignment and missing
worker-read audit behavior. It also identified missing live app-token route
evidence and incomplete response-bound tests. The changes log claims that the
startup registration, active assignment checks, response bounds, app-role
coverage, and live route coverage were added afterward.

## Plan Item Comparison

| Plan item | Evidence | Result |
| --- | --- | --- |
| 1.1 Extend principal model for agents | `agent` is present in the TypeScript principal-kind values and migration; active, unknown, and inactive agent mapping cases are covered | Pass |
| 1.2 Add app-only authentication branch | Separate app verifier validates app issuer, audience, algorithm, expiry, application identity, and configured role in `roles`; delegated scopes do not substitute for the role | Pass |
| 1.3 Create worker-only HTTP reads | Versioned routes use server repository reads, app-only middleware, active assignment predicates, typed inputs, replay limits, tile/patch limits, and a total JSON byte bound; patch assignment granularity and durable audit remain deficient | Partial |
| 1.4 Validate server phase changes | Focused auth, route, startup, live app-role, principal integration, and build checks passed in this validation | Pass |

## Verified Passes

### Startup Route Registration

The route is mounted by `registerAgentReadRoutes` with app-only middleware and
the feature gate in [apps/server/src/index.ts](../../../../apps/server/src/index.ts#L866-L882).
The application calls `registerAgentReadRoutes()` during initialization before
the health and canonical discovery handlers in
[apps/server/src/index.ts](../../../../apps/server/src/index.ts#L948-L975).
The startup test requests the route before any canonical discovery and receives
the expected authentication response in
[apps/server/src/index.test.ts](../../../../apps/server/src/index.test.ts#L13-L29).

The live integration test provisions an active agent, maps its app identity,
creates an active assignment, issues an app-role token, and successfully reads
the startup-registered context route in
[apps/server/src/index.integration.test.ts](../../../../apps/server/src/index.integration.test.ts#L297-L327).

### App-Role Authentication

The app verifier requires the configured app issuer, audience, accepted
algorithm, required claims, and `agent.runtime` role. It derives the application
identity from `azp` or `appid` and returns an `app_agent` identity in
[apps/server/src/auth/tokenVerifier.ts](../../../../apps/server/src/auth/tokenVerifier.ts#L55-L96)
and [apps/server/src/auth/tokenVerifier.ts](../../../../apps/server/src/auth/tokenVerifier.ts#L129-L155).
The route uses that verifier rather than the delegated-user verifier in
[apps/server/src/index.ts](../../../../apps/server/src/index.ts#L859-L881).

Tests cover app-role success, wrong-role rejection even with delegated scope,
issuer, audience, expiry, signature, and algorithm failures in
[apps/server/src/auth/tokenVerifier.test.ts](../../../../apps/server/src/auth/tokenVerifier.test.ts#L126-L203).
The route-auth tests also reject delegated tokens and accept app-role tokens in
[apps/server/src/routes/agentReads.auth.test.ts](../../../../apps/server/src/routes/agentReads.auth.test.ts#L97-L119).

### Active Pre-Provisioned Principal Mapping

`resolveAgentPrincipal` rejects non-app identities and accepts only a mapped
principal whose kind is `agent` and status is `active`; it does not call the
human auto-provisioning path in
[apps/server/src/auth/principalContext.ts](../../../../apps/server/src/auth/principalContext.ts#L117-L151).
The PostgreSQL integration test covers active acceptance, unknown rejection
without row creation, and inactive rejection in
[apps/server/src/auth/principalContext.postgres.integration.test.ts](../../../../apps/server/src/auth/principalContext.postgres.integration.test.ts#L134-L181).

### Bounded Read Responses And Server Authority

The router validates UUIDs and surface values, caps replay requests at 500
events, caps context patches at 256, caps snapshot tiles at 2,000, and rejects
any serialized response over 256 KiB in
[apps/server/src/routes/agentReads.ts](../../../../apps/server/src/routes/agentReads.ts#L22-L81).
The snapshot and event handlers enforce active-assignment checks and pass the
mapped principal ID into the repository reads in
[apps/server/src/routes/agentReads.ts](../../../../apps/server/src/routes/agentReads.ts#L161-L203)
and [apps/server/src/routes/agentReads.ts](../../../../apps/server/src/routes/agentReads.ts#L206-L249).
The repository snapshot and event methods perform authorization-aware read
transactions in [apps/server/src/db/repository.ts](../../../../apps/server/src/db/repository.ts#L3483-L3658).
The route module exposes no canonical mutation dependency.

## Findings

### Critical

None identified for Phase 1. The prior critical startup-registration finding
is resolved and has both a startup test and a live app-role route test.

### Major

#### M1: Assignment enforcement is quilt-scoped, not patch-scoped

The plan and research specify an agent's assigned patch as the read boundary.
The control-plane assignment table stores only `quilt_id` and
`agent_principal_id`, with a unique quilt assignment, in
[apps/server/migrations/0012_agent_control_plane.sql](../../../../apps/server/migrations/0012_agent_control_plane.sql#L4-L21).
The production predicate joins any patch in that quilt to the active
assignment in [apps/server/src/db/repository.ts](../../../../apps/server/src/db/repository.ts#L3661-L3674).
Consequently, an active assignment for one quilt authorizes snapshot and event
reads for every patch in that quilt. The route-level predicate is present, but
it does not enforce a one-patch assignment boundary. The live integration test
also expects both `PATCH_A` and `PATCH_B` from the quilt context, confirming the
current broader contract in
[apps/server/src/index.integration.test.ts](../../../../apps/server/src/index.integration.test.ts#L297-L327).

#### M2: Worker-read authorization audit is not durable or evidenced

The route emits OpenTelemetry annotations and spans, but the route module does
not write the existing authorization audit store. The relevant implementation
uses `runWithWorkerReadTelemetry` and `annotateWorkerReadTelemetry` in
[apps/server/src/routes/agentReads.ts](../../../../apps/server/src/routes/agentReads.ts#L89-L103)
and [apps/server/src/routes/agentReads.ts](../../../../apps/server/src/routes/agentReads.ts#L116-L157).
The route tests assert HTTP outcomes and repository calls but no persisted audit
record for successful or denied worker reads in
[apps/server/src/routes/agentReads.test.ts](../../../../apps/server/src/routes/agentReads.test.ts#L65-L157).
This falls short of the research requirement for server-owned authorization
and audit behavior and leaves read accountability dependent on sampled/exported
telemetry.

### Minor

#### m1: Response-bound overflow tests are incomplete

The implementation has explicit context, snapshot, and total-byte checks in
[apps/server/src/routes/agentReads.ts](../../../../apps/server/src/routes/agentReads.ts#L22-L78)
and [apps/server/src/routes/agentReads.ts](../../../../apps/server/src/routes/agentReads.ts#L148-L201).
The focused route tests cover replay limits, invalid inputs, and assignment
denial, but do not construct oversized context, oversized snapshots, or an
oversized serialized JSON response in
[apps/server/src/routes/agentReads.test.ts](../../../../apps/server/src/routes/agentReads.test.ts#L106-L157).
This is a validation-evidence gap rather than an observed unbounded response.

## Validation Commands

| Command | Result |
| --- | --- |
| `npm --prefix apps/server test -- --run src/auth/tokenVerifier.test.ts src/routes/agentReads.test.ts src/routes/agentReads.auth.test.ts src/index.test.ts src/index.integration.test.ts` | Passed: 5 files, 64 tests |
| `npm --prefix apps/server test -- --run src/auth/principalContext.postgres.integration.test.ts` | Passed: 1 file, 10 tests |
| `npm --prefix apps/server run build` | Passed: TypeScript compilation succeeded |

## Coverage Assessment

Phase 1 coverage is **substantial but incomplete**. All four phase steps have
current implementation evidence, and the principal, auth, startup, live route,
focused route, and build validations pass. The phase cannot be marked Passed
because the implemented assignment boundary is broader than the specified
assigned-patch contract and durable worker-read auditing is absent. The missing
overflow tests reduce confidence but do not by themselves change the overall
status.

## Remaining Gaps And Recommended Next Validations

* Decide whether the intended contract is one patch per assignment or an entire
	quilt. If it is one patch, add `patch_id` to the assignment model and deny
	reads for sibling patches, then add a live denial test.
* Define the durable authorization-audit event required for worker reads and
	assert success, denial, not-found, and payload-too-large outcomes.
* Add explicit 413 tests for oversized context, snapshots, and serialized JSON
	responses.
* Re-run the complete Phase 1 command set in CI or a clean PostgreSQL-backed
	environment after the assignment and audit contracts are resolved.

## Clarifying Questions

* Should a Fantome assignment authorize one patch, as stated by the Phase 1
	research and details, or the whole quilt, as represented by the current
	control-plane schema and live context test?
* Which durable audit record and retention policy should be used for worker
	read success and denial events?
