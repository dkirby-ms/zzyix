<!-- markdownlint-disable-file -->

# Canonical Infinite Canvas Convergence Implementation Review

## Review Metadata

* Date: 2026-07-29
* Plan: `.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md`
* Changes log: `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md`
* Research: `.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md`
* Reviewer: Task Reviewer
* Scope: Full implementation review across Phases 0 through 5

## Prior Review Context

The earlier planning review found the discovery and planning artifacts complete and identified
the Phase 0 product decisions and ADR amendment as implementation prerequisites. This review
replaces that planning-only status with implementation validation.

## Findings Summary

* Critical: 5
* Major: 6
* Minor: 1

The controlling release blockers are optional retirement evidence enforcement, trust in
non-derived report conclusions, forgeable entry-attempt telemetry, missing failure terminals,
and residual canary controls in the final product path. Full evidence is recorded in
`.copilot-tracking/reviews/2026-07-29/canonical-infinite-canvas-convergence-plan-quality.md`.

## RPI Validation

* Phase 0, Fix the Canonical Product Contract: Partial. The ADR records the product contract,
	but activation can bypass the newly provisioned fixed-topology target. One minor ADR
	frontmatter defect also remains.
* Phase 1, Build the Canonical Control Plane: Partial. Schema, migration, provisioning,
	discovery, CLI, lint, and build are present; activation does not enforce the planned
	generation-1-to-2 transition, and concurrent activation coverage is missing.
* Phase 2, Make Canonical Entry the Product Entry: Passed as a historical canary phase. The
	focused checks pass. Planned Phase 4 supersession of the rollback lobby is not counted as
	a Phase 2 defect; residual final-state flags are counted under Phase 4.
* Phase 3, Harden Runtime and Complete Canonical UX: Partial. All requested runtime and UX
	behaviors exist, but the changes log overstates direct server integration coverage for
	navigation, claims, and presence lifecycle.
* Phase 4, Retire Session Compatibility: Failed. Measured evidence is bypassable, telemetry
	can overstate promotion safety, canary controls remain, and legacy runtime code is disabled
	rather than removed.
* Phase 5, Final Validation: Failed. Fresh non-database checks pass, but the release artifacts
	report completion despite unresolved critical defects, and database-backed acceptance could
	not be independently reproduced.

Phase artifacts are stored under
`.copilot-tracking/reviews/rpi/2026-07-29/canonical-infinite-canvas-convergence-plan-000-validation.md`
through `canonical-infinite-canvas-convergence-plan-005-validation.md`.

## Implementation Quality

The independent full-quality review found 12 unique issues after duplicate phase findings
were merged:

* Retirement behavior is not coupled to mandatory immutable promotion evidence.
* Report parsing trusts caller-supplied decisions instead of deriving them from evidence.
* Socket telemetry does not bind entry attempts to authenticated handshake identity.
* Failure terminals are omitted or emitted over a disconnected socket.
* Phase 2 discovery and entry controls remain in the final deployment and UI path.
* Activation can adopt or repoint to a target outside the fixed provisioning contract.
* Legacy handlers, state, and public contracts remain compiled.
* Failure telemetry uses a fabricated quilt identity and generation.
* Presence heartbeat renewal failures and missing leases are ignored.
* Live HTTP and Socket.IO compatibility boundaries lack composed integration coverage.
* Planning and release artifacts overstate readiness.
* ADR keyword frontmatter indentation is malformed.

## Validation Commands

* `npm run lint`: Passed for client and server.
* `npm run build`: Passed for client and server with the existing Vite chunk-size warning.
* `npm run test:release-contract`: Passed, 13 of 13 checks.
* `npm test`: Environment-blocked. Client and non-PostgreSQL server assertions passed; Vitest
	reported 209 passed and 54 skipped, with nine files failing setup on
	`ECONNREFUSED 127.0.0.1:5432`. No independent assertion failure was observed.
* `git diff --check`: Passed.
* `bash -n scripts/verify-quilt-migration.sh`: Passed.
* VS Code diagnostics: Passed on reviewed source, workflow, script, and ADR surfaces.
* Ports 3001 and 5173: Clear after validation.

Standard Playwright, multi-replica Playwright, PostgreSQL-backed suites, and the migration
rehearsal were not rerun because loopback PostgreSQL and Docker integration are unavailable.

## Missing Work and Deviations

* Enforce and deploy immutable retirement evidence before compatibility can be retired.
* Recompute report decisions and reject empty or inconsistent promotion reports.
* Bind telemetry to server-authenticated attempt identity and capture every terminal failure.
* Remove final-state canary controls and compiled legacy runtime surfaces.
* Restrict activation to the provisioned pointer and fixed topology contract.
* Handle presence renewal failure and lease loss.
* Add composed HTTP, Socket.IO, navigation, claim, and presence integration coverage.
* Correct release claims and ADR frontmatter.

## Follow-Up Work

### Deferred From Scope

* Retention-approved deletion of additive legacy database structures remains separate from
	product compatibility retirement.

### Discovered During Review

* Preserve machine-readable PostgreSQL, Playwright, and migration-rehearsal results for
	independent release verification.
* Define server-owned identity semantics for pre-discovery and old-client telemetry.
* Define reconnect and resubscribe attempt lineage for promotion metrics.
* Add a lease-loss policy for connected sockets whose heartbeat no longer renews a row.

## Overall Status

Needs Rework. Five critical findings permit compatibility retirement without trustworthy
promotion evidence or produce misleading promotion metrics. Correct the critical and major
findings, then rerun PostgreSQL-backed tests, both Playwright suites, and migration rehearsal
before treating the implementation as release-ready.
