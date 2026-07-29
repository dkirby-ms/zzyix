---
title: Infinite Canvas Authentication and Authorization Phase 3 Validation
description: Validation of protected HTTP, Socket.IO, and visibility boundaries
author: GitHub Copilot
ms.date: 2026-07-29
ms.topic: reference
---

## Validation Scope

* Plan: `.copilot-tracking/plans/2026-07-28/infinite-canvas-authentication-authorization-plan.instructions.md`
* Changes: `.copilot-tracking/changes/2026-07-28/infinite-canvas-authentication-authorization-changes.md`
* Research: `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md`
* Details: `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md`
* Through-line: Implementation Phase 3 only
* Repository branch: `infinite-canvas`, tracking `origin/infinite-canvas`
* Repository state: Unrelated tracked review artifacts are modified under
	`.copilot-tracking/reviews/`. No Phase 3 implementation file was modified during validation.

## Executive Status

Status: **Partial**

The current repository implements the principal HTTP middleware, protected HTTP routes, safe
`/me` projection, authenticated Socket.IO middleware, expiry disconnect, persisted visibility
model, policy-backed catalog and delivery queries, and room authorization claimed for Phase 3.
The earlier blocked assessment is obsolete. Phase 3 is not fully compliant because the central
policy still permits anonymous access to `public` aggregate data, contrary to the authenticated-only
product decision and explicit Step 3.3 success criterion. Socket.IO also lacks explicit WebSocket
origin enforcement and the named integration test does not contain the required polling,
WebSocket, invalid-origin, expiry, or fresh-token reconnect matrix.

## Plan Comparison

| Plan item | Changes claim | Current repository evidence | Result |
|-----------|---------------|-----------------------------|--------|
| Step 3.1: Protect HTTP resources and expose safe principal context | Adds `httpAuth.ts`; modifies contracts, server routes, repository, and integration tests | Strict bearer parsing and immutable request context are implemented in `apps/server/src/auth/httpAuth.ts:16-64`. Health remains anonymous, while `/me`, ownership, account, and session routes use principal middleware in `apps/server/src/index.ts:1496-1583`. HTTP preflight allows `Authorization` at `apps/server/src/index.ts:1445-1468`. `/me` omits issuer, subject, and internal principal ID in `apps/server/src/auth/httpAuth.test.ts:82-100`. Hidden and unknown snapshots both raise `ResourceNotFoundError` in `apps/server/src/db/recovery.postgres.integration.test.ts:146-162`. | Implemented |
| Step 3.2: Authenticate Socket.IO and enforce expiry | Adds `socketAuth.ts`; modifies contracts, server middleware, and integration tests | The handshake requires `token` in `apps/server/src/contracts.ts:301-309`. Verification and principal resolution precede session lookup because `createSocketAuth` is installed at `apps/server/src/index.ts:1990`, while delivery context loads at `apps/server/src/index.ts:2053-2056`. Immutable principal ID and expiry plus scheduled disconnect are implemented in `apps/server/src/auth/socketAuth.ts:45-76`. No live implementation or test contract contains `testPrincipalId`. Explicit WebSocket origin enforcement and the claimed transport integration matrix are missing. | Partial |
| Step 3.3: Centralize persisted visibility policy | Adds `authorizationPolicy.ts`; modifies repository, room authorization, and tests | One evaluator defines existence, fine data, aggregate data, presence, search, and durable events in `apps/server/src/domain/authorizationPolicy.ts:4-64`. Catalog filtering is persisted-policy-backed at `apps/server/src/db/repository.ts:1393-1431`; snapshot and replay authorization use the evaluator at `apps/server/src/db/repository.ts:2462-2510`, `apps/server/src/db/repository.ts:2512-2527`, and `apps/server/src/db/repository.ts:2634-2643`. Room access consumes evaluator results in `apps/server/src/realtime/quiltRooms.ts:24-46`. The evaluator nevertheless permits anonymous `public` aggregate access, and the room test expects it. | Partial |
| Step 3.4: Validate protected-boundary phase | Claims policy, HTTP, socket, repository, and integration coverage | Focused auth, policy, room, and integration tests pass. Server lint and build pass. Unit and PostgreSQL tests cover bearer handling, safe `/me`, immutable socket context, expiry disconnect, fail-closed missing policy, catalog filtering, and hidden-versus-unknown snapshots. The named `index.integration.test.ts` has no server-level HTTP auth, polling, WebSocket, origin, expiry, or fresh-token reconnect cases. | Partial |

## Research Cross-Check

The implementation matches these primary research requirements:

* REST credentials terminate at server bearer middleware, and Socket.IO credentials use
	`auth.token` rather than a browser WebSocket authorization header.
* Durable authorization derives from the server-resolved principal. Client-controlled principal
	IDs are absent from the handshake and rejected from protocol-v2 mutation payloads.
* Token expiry schedules a server disconnect, and inactive principals fail before protected
	resource resolution.
* Missing or malformed persisted policy fails closed.
* Hidden and nonexistent patch snapshots use the same domain error.

The implementation deviates from these research requirements:

* The confirmed product decision states that anonymous users receive no quilt catalog or content
	beyond sign-in. Step 3.3 also explicitly requires anonymous aggregate access to be denied.
* The required REST and Socket.IO matrix includes exact origins, invalid origins, polling,
	WebSocket, expiry, and replica reconnect. Current Phase 3 server tests do not supply that matrix.
* Search is persisted as a policy dimension, but no callable server search route or event exists.
	There is therefore no current search transport to validate or exploit.

## Findings

### Critical

No Critical findings.

### Major

1. Anonymous `public` aggregate access contradicts the authenticated-only contract. The central
	 evaluator returns access for every `public` surface except presence
	 (`apps/server/src/domain/authorizationPolicy.ts:58-62`). The room resolver then admits an
	 anonymous aggregate subscription, and its test requires `accepted`
	 (`apps/server/src/realtime/quiltRooms.test.ts:62-75`). This conflicts with the confirmed
	 decision that anonymous users receive no quilt content and with Step 3.3's explicit criterion
	 that anonymous aggregate access is denied. Current socket authentication prevents this helper
	 path from being reached anonymously through the standard server connection, which limits the
	 immediate exposure, but the reusable policy decision remains incorrect and can reintroduce
	 anonymous delivery when used by another transport. Require an authenticated subject for all
	 quilt surfaces in this release, then change the room test to expect aggregate denial.

2. Socket.IO does not explicitly reject disallowed WebSocket origins. Its configuration supplies
	 only the CORS `origin` option at `apps/server/src/index.ts:1924-1934`; no `allowRequest` or
	 equivalent handshake-origin predicate exists. Browser CORS controls cover HTTP long-polling but
	 are not an authorization check for native WebSocket handshakes. This falls short of the
	 research matrix's invalid-origin requirement and leaves origin behavior dependent on transport.
	 Add an exact-origin handshake predicate shared with the HTTP origin policy and test both polling
	 and WebSocket transports.

### Minor

1. The claimed integration coverage is narrower than the plan requires. The focused middleware
	 tests verify missing bearer credentials, immutable principal context, inactive-principal
	 rejection, and timer-driven expiry (`apps/server/src/auth/httpAuth.test.ts:17-100` and
	 `apps/server/src/auth/socketAuth.test.ts:22-81`). The named
	 `apps/server/src/index.integration.test.ts` contains policy helper checks but no HTTP bearer,
	 `/me`, CORS preflight, polling, WebSocket, invalid-origin, expiry, or fresh-token reconnect
	 integration cases. Browser authentication E2E covers signed-token renewal and protected-state
	 retention (`e2e/authentication.spec.ts:18-57`), but it does not select both Socket.IO transports
	 or prove server-side rejection of stale credentials. Add the planned transport-level matrix so
	 middleware ordering and server configuration are tested together rather than inferred from
	 unit tests and source inspection.

## Validation Execution

| Validation | Result | Evidence |
|------------|--------|----------|
| Focused Phase 3 server tests | Passed | Seven discovered test files and 39 tests passed when run against the server root, including HTTP auth, socket auth, policy, room, and index integration coverage |
| Server lint | Passed | `npm run lint:server` completed without diagnostics |
| Server build | Passed | `npm run build:server` completed successfully; the repository wrapper also built the client and emitted only existing bundle-size warnings |
| Git diff validation | Passed with unrelated worktree changes | `git diff --check` reported no whitespace errors; separate review artifacts are also modified |

Some repeated `npm exec --workspace` attempts entered other workspaces because of npm workspace
resolution and shared terminal state. Those interrupted runs are excluded from pass/fail evidence.
The direct server-root run above is the focused executable result used for this assessment.

## Coverage Assessment

* Validation coverage: 4 of 4 Phase 3 plan items assessed (100%)
* Fully implemented plan items: 1 of 4
* Partially implemented plan items: 3 of 4
* Unimplemented plan items: 0 of 4
* Blocked plan items: 0 of 4
* Findings: 0 Critical, 2 Major, 1 Minor
* Estimated requirement coverage: 80%

Phase 3 has substantial working implementation and no evidence of an anonymous bypass through the
standard HTTP or socket bootstrap. It does not pass because the central policy's anonymous
aggregate decision violates an explicit release requirement, Socket.IO origin enforcement is not
transport-complete, and the claimed integration matrix is incomplete.

## Clarifying Questions

* Is `public` visibility intended for a later anonymous-read release? If so, should Phase 3 force an
	authenticated baseline above that persisted value until a separately approved rollout enables
	anonymous reads?
* Is there an infrastructure proxy that rejects disallowed WebSocket origins before Socket.IO? No
	repository configuration inspected here documents such enforcement. If one exists, its deployed
	policy and tests are needed to reassess Major finding 2.

## Recommended Next Validations

* Revalidate the policy evaluator and room resolver after anonymous aggregate access is denied
* Exercise allowed and disallowed origins over explicit polling and WebSocket transports
* Exercise token expiry followed by rejection of the stale token and acceptance of a fresh token
	through the real Socket.IO server boundary
* Add real HTTP integration cases for health, `/me`, session catalog, session creation, CORS
	preflight, inactive principal status, and hidden-versus-unknown responses
* Revalidate catalog, fine snapshot, aggregate snapshot, presence, durable replay, and room
	admission against one policy version in PostgreSQL-backed tests
* Validate search authorization when a callable search route or event is introduced