<!-- markdownlint-disable-file -->

# Canonical Infinite Canvas Convergence Quality Validation

## Status

Failed. The final implementation has 5 critical, 6 major, and 1 minor finding.

## Critical Findings

### IV-001: Retirement is not coupled to mandatory promotion evidence

Retired HTTP and socket behavior is unconditional in `apps/server/src/index.ts:1792-1799,2220-2273`, but evidence validation runs only when `FEATURE_LEGACY_RETIREMENT_REQUESTED` is true in `apps/server/src/startup/rolloutGates.ts:38-44`. `.github/workflows/cd.yml:272-275,590-614` does not deploy the report, digest, or retirement approvals.

Impact: production can retire compatibility without the required measured 24-hour evidence. Make evidence validation unconditional for the retired build and propagate immutable evidence through CD.

### IV-002: Startup trusts report conclusions not derived from evidence

`apps/server/src/operations/canonicalRetirementReportCli.ts:166-215` validates report shapes but does not recompute rates, eligibility, failed checks, or recommendation. `apps/server/src/migration/quiltRollout.ts:98-115` trusts those fields, and `apps/server/src/startup/rolloutGates.test.ts:29-51` accepts promotion with no groups.

Impact: a hand-authored, digest-matched file can authorize retirement. Recompute derived fields and reject empty or internally inconsistent promotion reports.

### IV-003: Authenticated sockets can manufacture entry-attempt counts

The handshake records `entryAttemptId` in `apps/server/src/index.ts:2220-2273`, but telemetry accepts any client UUID at `apps/server/src/index.ts:315-333,3049-3062`. Tests accept arbitrary IDs at `apps/server/src/index.integration.test.ts:1018-1048`.

Impact: one socket can fabricate the 100-attempt threshold. Bind entry telemetry to the authenticated socket attempt and validate reconnect lineage.

### IV-004: Failure telemetry is omitted or undeliverable

The client emits canonical-entry telemetry only for `ready` at `apps/client/src/network/useSocketConnection.ts:181-199`. Reconnect exhaustion is emitted over an already disconnected socket at lines 159-177, while `apps/server/src/contracts.ts:655-668` expects failure terminals.

Impact: measured success rates omit failures. Record server-observable failures server-side and add a deliverable authenticated channel for terminal client failures.

### IV-005: Canary controls remain after the claimed cutover

Server discovery remains gated in `apps/server/src/startup/rolloutGates.ts:46-49`; CD defaults discovery and entry false in `.github/workflows/cd.yml:272-275`; and `apps/client/src/App.tsx:1862-1905` hides navigation and claim controls when the entry flag is false despite unconditional discovery at lines 560-583.

Impact: the sole supported experience can be disabled or rendered incomplete. Remove Phase 2 controls after enforcing IV-001.

## Major Findings

### IV-006: Activation bypasses canonical provisioning provenance

The ADR fixes a newly provisioned 32-by-32 target at `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:37-56`, but `apps/server/src/db/repository.ts:3151-3188` can create or repoint the pointer to any structurally valid quilt and bypass exact CAS semantics.

Require activation of the existing inactive generation-1 pointer without changing quilt identity.

### IV-007: Legacy runtime and contracts are disabled rather than retired

Legacy handlers and process-local state remain compiled behind a constant in `apps/server/src/index.ts:138-155,2394-2425`; legacy REST and socket contracts remain exported in `apps/server/src/contracts.ts:176-203,738-786`.

Delete retired handlers, state, contracts, imports, and legacy-focused tests while retaining only required database residue.

### IV-008: Failure telemetry uses fabricated world identity

Discovery and old-client failures use an all-zero quilt ID and generation 1 in `apps/server/src/index.ts:1637-1655,1768-1781`, and reports group them as real generations in `apps/server/src/operations/canonicalRetirementReportCli.ts:139-150`.

Resolve server-owned identity or define a non-world group excluded from generation gates.

### IV-009: Presence heartbeat failures are unhandled

`apps/server/src/index.ts:2358-2366` ignores lease renewal rejection and a false result, while `apps/server/src/db/repository.ts:1642-1650` returns false when no lease is renewed.

Catch errors and treat missing renewal as lease loss under a defined disconnect or reacquisition policy.

### IV-010: Composed compatibility boundaries lack integration coverage

`apps/server/src/index.test.ts:29-80` tests helpers, not live `/sessions` routes or the Socket.IO middleware chain. Telemetry tests omit handshake-attempt binding.

Add live HTTP 401/403/426 ordering and side-effect tests plus live socket authentication and telemetry-binding tests.

### IV-011: Release artifacts report success despite blockers

`.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md:26-31` and `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:146-159` claim completion despite the critical release-gate defects.

Mark release readiness blocked until critical findings are corrected and revalidated.

## Minor Finding

### IV-012: ADR frontmatter is malformed

The `canonical quilt` keyword is over-indented at `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:9`. Align it with adjacent list entries.

## Validation Gaps

Database-backed tests, standard and multi-replica Playwright execution, and migration rehearsal were not independently completed because loopback PostgreSQL and Docker integration are unavailable. Live compatibility-boundary, immutable-evidence deployment, and failure-terminal delivery tests are also missing.
