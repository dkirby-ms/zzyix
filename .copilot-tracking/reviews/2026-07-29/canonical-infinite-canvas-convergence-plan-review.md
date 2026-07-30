<!-- markdownlint-disable-file -->

# Canonical Infinite Canvas Convergence Implementation Review

## Review Metadata

* Date: 2026-07-30
* Plan: `.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md`
* Changes log: `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md`
* Research: `.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md`
* Reviewer: Task Reviewer
* Scope: Full implementation review across Phases 0 through 7, resumed after Phase 7 remediation

## Prior Review Context

The earlier planning review found the discovery and planning artifacts complete and identified
the Phase 0 product decisions and ADR amendment as implementation prerequisites. This review
replaces that planning-only status with implementation validation.

## Findings Summary

* Critical: 1
* Major: 5
* Minor: 1

Phase 7 closes IV-003, IV-013, and IV-014. Release readiness remains blocked because child
attempts are not bound to server-observed reconnect or resubscribe cycles, entry lineage
expires during long-lived sessions, session-era public contracts remain compiled, required
live product boundaries remain helper-tested, standard Playwright is order-dependent, and
release artifacts overstate closure. Current evidence is recorded in
`.copilot-tracking/reviews/2026-07-29/canonical-infinite-canvas-convergence-plan-quality-phase7.md`.

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
through `canonical-infinite-canvas-convergence-plan-007-validation.md`.

## Phase 6 RPI Validation

* Step 6.1: Partial. Mandatory evidence, derived report conclusions, and final canary removal
	are present, but the existing-app CD branch references the retirement-report secret without
	installing its current value.
* Step 6.2: Failed. HTTP fallback attempt IDs remain caller-controlled, and reconnect cycles
	do not have unique server-bound child lineage.
* Step 6.3: Partial. Activation provenance and lease-loss handling are corrected, but retired
	session contracts remain compiled and the ADR indentation defect remains.
* Step 6.4: Failed. The full Socket.IO authentication chain and live product boundaries are
	not composed in integration tests, release claims remain inaccurate, and standard E2E fails.

Closed prior findings: IV-001, IV-002, IV-005, IV-006, IV-008, and IV-009.

## Phase 7 RPI Validation

* Step 7.1: Partial. Both deployment branches install immutable evidence and branch-specific
	release contracts pass, but the ADR keyword indentation remains malformed.
* Step 7.2: RPI Passed, quality review Failed. Entry attempts and child lineage are shared,
	principal-bound, and single-use, but the public child-attempt endpoint can issue unlimited
	children without a server-observed reconnect or resubscribe cycle. The original entry
	lineage also expires after ten minutes and rejects later reconnects.
* Step 7.3: Failed. Snapshot handlers are removed and socket authentication is composed, but
	session-era public contracts remain compiled and navigation, claim, and presence coverage
	still calls helpers instead of live product boundaries.
* Step 7.4: Failed. The original authenticated placement defect is corrected, but the full
	standard Playwright suite failed twice at 13 of 14 because the multi-user case is
	order-dependent. Release artifacts still claim complete closure.

Closed resumed findings: IV-003, IV-013, and IV-014. IV-004 is reopened by the independent
quality review. IV-007, IV-010, IV-011, and IV-012 remain open. IV-015 and IV-016 are new.

## Implementation Quality

The Phase 7 full-quality review found seven open issues:

* Critical IV-004: child attempts can be issued without a server-observed cycle and can pad
	promotion evidence.
* Major IV-016: ten-minute entry-attempt expiry rejects reconnects for long-lived sessions.
* Major IV-007: session-era public contracts remain compiled.
* Major IV-010: navigation, claim, and presence boundaries remain helper-tested.
* Major IV-015: standard Playwright acceptance is order-dependent.
* Major IV-011: planning and release artifacts overstate readiness.
* Minor IV-012: ADR keyword frontmatter indentation remains malformed.

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

## Fresh Phase 6 Validation

* Focused server and client remediation suites: Passed.
* `npm run test:release-contract`: Passed, 9 tests.
* `npm run lint`: Passed.
* `npm run build`: Passed with the existing Vite chunk-size warning.
* `npm test`: Passed, 368 tests with 9 skipped across 66 files.
* `npm run test:e2e`: Failed, 13 passed and 1 failed. The authenticated product workflow
	remained at `0 placed` after placement.
* Isolated failed Playwright test: Failed again with the same missing `1 placed` assertion.
* Multi-replica Playwright: Passed, 1 test.
* Migration rehearsal: Passed, 10 tests.
* `git diff --check`: Passed before review artifact updates.
* VS Code diagnostics: Passed on reviewed source, workflow, and ADR files.
* Ports 3001 and 5173: Clear. PostgreSQL was preserved.

## Fresh Phase 7 Validation

* `npm run test:release-contract`: Passed, 9 of 9.
* Focused Phase 7 server tests: Passed, 64 tests.
* Focused Phase 7 client tests: Passed, 25 tests with 16 skipped.
* `npm run lint`: Passed.
* `npm run build`: Passed with the existing Vite chunk-size warning.
* `npm test`: Passed, 367 tests with 17 skipped across 147 files.
* Focused authentication Playwright: Passed, 7 of 7, including `1 placed`.
* Focused multi-user Playwright: Passed, 1 of 1.
* Full standard Playwright: Failed twice, 13 passed and 1 failed at the same multi-user test.
* Multi-replica Playwright: Passed, 1 of 1.
* Migration and recovery rehearsal: Passed, 10 of 10.
* `git diff --check`: Passed.
* VS Code diagnostics: Passed on review artifacts and reviewed source surfaces.
* Ports 3001 and 5173: Clear after validation. PostgreSQL was preserved.

## Missing Work and Deviations

* Bind child attempts to server-observed, single-use reconnect and resubscribe cycles.
* Preserve or rotate reconnect lineage beyond the ten-minute attempt lifetime.
* Remove compiled session-era public contracts and `/me` command fields.
* Add live authenticated navigation, claim, and presence lifecycle coverage.
* Eliminate standard Playwright cross-test state leakage and rerun the full suite repeatedly.
* Correct release claims and ADR frontmatter.

## Follow-Up Work

### Deferred From Scope

* Retention-approved deletion of additive legacy database structures remains separate from
	product compatibility retirement.

### Discovered During Review

* Preserve machine-readable PostgreSQL, Playwright, and migration-rehearsal results for
	independent release verification.
* Add retention or cleanup policy for consumed and expired canonical-attempt rows.
* Distinguish expired attempt lineage from unsupported-client compatibility failures.

## Overall Status

Needs Rework. One Critical finding permits authenticated callers to manufacture child
terminal volume without an observed reconnect or resubscribe cycle. Five Major findings
leave long-lived reconnects, runtime retirement, composed integration coverage, full-suite
isolation, and release reporting incomplete. Correct all Critical and Major findings, then
rerun focused suites, release contracts, full workspace tests, repeated standard Playwright,
multi-replica Playwright, and migration rehearsal before treating the implementation as
release-ready.
