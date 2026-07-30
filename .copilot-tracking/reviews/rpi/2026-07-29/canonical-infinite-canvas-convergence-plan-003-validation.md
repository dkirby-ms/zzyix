<!-- markdownlint-disable-file -->

# RPI Validation: Canonical Infinite Canvas Convergence Phase 3

## Validation Scope

* Phase: 3, Harden Runtime and Complete Canonical UX
* Status: Partial
* Finding counts: 0 Critical, 1 Major, 0 Minor
* Plan: `.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md`
* Changes: `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md`
* Research: `.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md`
* Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md`

## Plan Coverage

| Requirement | Status | Verified evidence |
|-------------|--------|-------------------|
| Bounded ordinary reconnect | Implemented | `apps/client/src/network/useSocketConnection.ts:97` limits Socket.IO reconnects to five attempts; recovery and exhaustion terminals are tested in `apps/client/src/network/useSocketConnection.test.ts:116` |
| Token renewal and terminal authentication loss | Implemented | `apps/client/src/network/useSocketConnection.ts:103-124` permits one forced refresh before terminal auth loss; `apps/client/src/network/useSocketConnection.test.ts:369-391` verifies the behavior |
| Connection epoch and cursor resubscription | Implemented | `apps/client/src/network/useSocketConnection.ts:128-141` advances the epoch; `apps/client/src/App.tsx:1178-1199` resubscribes visible rooms with retained cursors; `e2e/quilt-reconnect.spec.ts:250-277` verifies cursor recovery after reconnect |
| Canonical generation rediscovery | Implemented | `apps/client/src/App.tsx:645-669` rediscovers on later connection epochs and clears protected state when generation changes or discovery fails |
| Replica-wide lease presence | Implemented | `apps/server/src/db/repository.ts:1578-1687` serializes first- and last-lease decisions with a PostgreSQL advisory lock; `apps/server/src/index.ts:2360-2380` acquires and renews leases; `apps/server/src/index.ts:3314-3324` releases them symmetrically |
| Eligible patch discovery | Implemented | `apps/server/src/db/repository.ts:3003-3044` applies principal eligibility and row-major ordering; `apps/server/src/db/canonicalWorld.postgres.integration.test.ts:197-221` covers ordering, stable identity, navigation, and ownership eligibility |
| Durable navigation | Implemented | `apps/client/src/network/session.ts:70-98` stores durable quilt and patch IDs in the URL and resolves them through the authenticated route; `apps/client/src/App.test.tsx:339-385` verifies deep-link resolution and focus |
| Claim UX | Implemented | `apps/client/src/App.tsx:672-684` claims by stable patch ID, focuses the claimed patch, and refreshes eligibility; controls render at `apps/client/src/App.tsx:1888-1902`; `e2e/authentication.spec.ts:43` exercises the claim action |
| Canonical fixtures | Implemented | `apps/server/src/index.ts:1882-1899` provisions and activates a complete 32-by-32 canonical fixture; `e2e/support/testState.ts:28-44` requests isolated canonical state and `e2e/support/multiUser.ts:351-369` isolates multi-user ownership |
| Runtime and UX acceptance coverage | Partial | Client acceptance passed locally. Database and Playwright execution was blocked by unavailable loopback PostgreSQL and disabled Docker Desktop WSL integration. Static E2E coverage exists at `e2e/quilt-reconnect.spec.ts:100-286`, `e2e/authentication.spec.ts:11-43`, `e2e/multi-user-fixtures.spec.ts:43-87`, and `e2e/smoke.spec.ts:4-15` |

All ten requested implementation surfaces have corresponding product code. Nine have direct
static and test evidence. Acceptance execution and one claimed server integration-test layer
remain incomplete, so the phase cannot receive a Passed status in this session.

## Findings

### Major

#### F-001: Changes log overstates server integration coverage

The changes log claims that `apps/server/src/index.integration.test.ts` covers canonical
navigation, claims, and presence lifecycle at
`.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:82`.
The file contains no references to the eligible-patch route, navigation route, or lease
repository operations. Its nearby collaborator test at
`apps/server/src/index.integration.test.ts:738-757` verifies only event payload forwarding.
The actual HTTP handlers are at `apps/server/src/index.ts:1663-1703`, while lease behavior is
covered one layer lower at `apps/server/src/db/ownership.postgres.integration.test.ts:60-96`
and through E2E at `e2e/quilt-reconnect.spec.ts:118-131`.

Impact: route authentication, status mapping, and handler-to-repository wiring can regress
without the focused server integration suite required by Steps 3.1 and 3.2. Add direct
integration assertions for eligible discovery, durable navigation, claim routing, and
first/last lease event emission, then correct the changes log or cite the added tests.

### Critical

None.

### Minor

None.

## Acceptance Coverage

### Executed

* Client Phase 3 suite passed: 3 files, 41 passed, 8 skipped
* Server non-database tests passed: `src/index.integration.test.ts` and `src/jobs/retention.test.ts`
* Initial server command reported 52 passed and 20 skipped across 4 files; the ownership and recovery suites could not create their PostgreSQL databases because `127.0.0.1:5432` refused the connection
* No validation listeners remained on ports 3001, 5173, 3101, 4173, 3199, 3201, 3202, or 3299

### Not Independently Completed

* `src/db/ownership.postgres.integration.test.ts`
* `src/db/recovery.postgres.integration.test.ts`
* `npm run test:e2e:multi-replica`
* `npm run test:e2e`

Docker Desktop is installed on the Windows side, but invoking it from this WSL 2 distro
reported that WSL integration is disabled. The database service therefore could not be
started for the remaining acceptance commands. The changes log records an earlier complete
run at `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:144-162`,
but this validation did not independently reproduce that evidence.

## Recommended Next Validations

* Enable Docker Desktop integration for this WSL distro or provide loopback PostgreSQL, then rerun both PostgreSQL suites
* Run `TEST_DATABASE_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npm run test:e2e:multi-replica`
* Run `npm run test:e2e`
* Add and run focused HTTP and presence lifecycle integration tests for F-001

## Clarifying Questions

* Is a CI run URL or immutable test artifact available for the 420-test and Playwright results claimed in the changes log?
