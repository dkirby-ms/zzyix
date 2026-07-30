<!-- markdownlint-disable-file -->
# RPI Validation: Canonical Infinite Canvas Convergence Phase 5

## Validation Scope

* Phase: 5, Final Validation
* Status: Failed
* Finding counts: 3 Critical, 2 Major, 1 Minor
* Plan: `.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md`
* Changes: `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md`
* Research: `.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md`
* Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md`

## Plan Coverage

| Requirement | Status | Verified evidence |
|-------------|--------|-------------------|
| Full lint | Passed | Fresh `npm run lint` completed with exit 0 for client and server and emitted no warnings. The root command delegates to both workspaces at `package.json:27`; workspace lint commands are defined at `apps/client/package.json:9` and `apps/server/package.json:9`. |
| Full build | Passed | Fresh `npm run build` completed with exit 0 for client and server. TypeScript and Vite completed; Vite reported only two chunks above 500 kB. The root command is `package.json:24`. |
| Full tests | Historically plausible, not independently passed | Fresh `npm test` passed all available client assertions (158 passed, 8 skipped) and all non-PostgreSQL server assertions (209 passed). Nine server suites failed during setup because `127.0.0.1:5432` refused connections; no implementation assertion failed. If the 53 database tests execute while the one intentional server skip remains, the observed inventory becomes the claimed 420 passed and 9 skipped. The historical success has no persisted result artifact and cannot be independently confirmed. |
| Standard E2E | Inventory verified, execution unverified | Fresh Playwright discovery found exactly 14 tests in four files, matching the claim. Execution requires the unavailable database configured at `playwright.config.ts:8`; no result artifact exists under `test-results` or `playwright-report`. |
| Multi-replica E2E | Inventory verified, execution unverified | Fresh Playwright discovery found exactly one test. Disposable database setup requires loopback PostgreSQL at `e2e/support/multiReplicaDatabase.ts:7-21`, and teardown removes the database and state file at `e2e/support/multiReplicaGlobalTeardown.ts:9-20`. No state-file residue exists, but historical execution cannot be proven. |
| Release-contract tests | Passed | Fresh `npm run test:release-contract` passed 9 of 9. The command is defined at `package.json:32`. The suite does not validate retirement evidence deployment; see F-001. |
| Migration rehearsal | Static checks passed, execution unverified | `bash -n scripts/verify-quilt-migration.sh` passed and required `psql` and `jq` are installed. PostgreSQL readiness returned no response. Cleanup is protected by an exit trap at `scripts/verify-quilt-migration.sh:401-429` and explicit removal at `scripts/verify-quilt-migration.sh:460-463`, but the claimed successful rehearsal and 10 recovery tests have no durable result artifact. |
| Cleanup | Current state clean, historical claim partly unverifiable | No relevant listener exists on ports 3001, 5173, 3101, 4173, 3199, 3201, 3202, 3299, or 4174. No Playwright database state file or test log remains. Docker is unavailable in this WSL environment, so the historical claim that no test containers remained cannot be independently queried. |
| Report unresolved issues | Failed | The planning log states that no gap remains at `.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md:30-32`, while current source still contains the critical and major defects below. |

Phase 5 ran or recorded every named validation category, and the fresh non-database checks are
healthy. It does not satisfy final-validation acceptance because current source contradicts
the required evidence-gated retirement and unconditional canonical product contract, while
the release artifacts report no unresolved issue.

## Findings

### Critical

#### F-001: Retired compatibility behavior is not coupled to mandatory promotion evidence

Production validates retirement evidence only when
`FEATURE_LEGACY_RETIREMENT_REQUESTED` is explicitly true at
`apps/server/src/startup/rolloutGates.ts:38-44`. The retired product behavior is already
unconditional: authenticated session routes always return 426 at
`apps/server/src/index.ts:1792-1799`, and legacy canvas handlers are disabled by a constant at
`apps/server/src/index.ts:155`.

CD exposes only protocol, discovery, and entry flags at `.github/workflows/cd.yml:273-275`
and validates that same list at `.github/workflows/cd.yml:363-370`. It does not propagate the
retirement request, immutable report path, or expected digest. The release-contract test
asserts only the older flag list at `scripts/release-contract.test.mjs:53-64`.

Impact: production can run the retired HTTP and socket contract without loading the required
24-hour, 100-attempt promotion report. Phase 5 should have failed and reported this blocker.
Make retirement startup mandatory for this retired build and propagate the report and digest
through CD before accepting final validation.

#### F-002: A digest-matched hand-authored report can still assert promotion

The report builder derives eligibility and recommendations at
`apps/server/src/operations/canonicalRetirementReportCli.ts:152-164`, but the parser validates
only shapes and scalar ranges before returning caller-supplied decision fields at
`apps/server/src/operations/canonicalRetirementReportCli.ts:166-214`. Startup trusts those
fields at `apps/server/src/migration/quiltRollout.ts:109-114`.

The production-gate test deliberately constructs `groups: []` with asserted
`eligible: true`, `measuredWindowApproved: true`, and `recommendation: promote` at
`apps/server/src/startup/rolloutGates.test.ts:29-45`, then treats that file as valid evidence
at `apps/server/src/startup/rolloutGates.test.ts:137-153`. The builder cannot produce such a
report because empty groups fail eligibility.

Impact: SHA-256 binds startup to a file but does not prove the decision was derived from
evidence. Recompute and compare decision fields from validated report metrics, or validate
against the retained immutable input, and add a negative empty-group promotion test.

#### F-003: Supported canonical entry remains disableable after required cutover

The final product must expose unconditional canonical entry after promotion. CD still defaults
both canonical discovery and entry to false at `.github/workflows/cd.yml:274-275`. Server
discovery remains independently gated at `apps/server/src/startup/rolloutGates.ts:46-49`, and
the client still parses a runtime entry boolean at `apps/client/src/config/runtimeConfig.ts:1-8`
and `apps/client/src/config/runtimeConfig.ts:64-71`. Canonical patch navigation is hidden when
that value is false at `apps/client/src/App.tsx:1862`.

Impact: the supported deployment can disable the only product experience or omit its patch
navigation and claim surface. Remove the Phase 2 canary controls after enforcing F-001, then
rerun client, startup, release-contract, and E2E acceptance.

### Major

#### F-004: Canvas-wide runtime code was disabled rather than retired

`registerRetiredCanvasHandlers` is hard-coded false at `apps/server/src/index.ts:155`, but
legacy placement handlers remain compiled behind it at `apps/server/src/index.ts:2394-2410`,
and legacy pointer handlers remain at `apps/server/src/index.ts:2758-2770`. Disconnect still
updates process-local session bookkeeping before the canonical lease path at
`apps/server/src/index.ts:3298-3337`.

Impact: Step 4.2's removal requirement remains incomplete, leaving a compiled legacy runtime
surface and process-local session coupling. Delete retired handlers, contracts, state, and
legacy-focused tests while preserving database records required by retention policy.

#### F-005: Final reporting suppresses known release blockers

The planning log declares `Passed` with no critical, major, or minor gap at
`.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md:30-32`.
The changes log likewise declares all five phases complete at
`.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:146-158`.
Those statements conflict with F-001 through F-004 in current source and fail Step 5.3's
requirement to report issues needing architecture or product follow-up.

Impact: release consumers receive a passed status despite unresolved promotion-safety and
product-cutover defects. Replace the passed declaration with blocked follow-on work until the
critical findings are corrected and independently revalidated.

### Minor

#### F-006: The final warning report includes a warning not reproduced by the build

The changes log reports existing Vite bundle-size and Three.js clock deprecation warnings at
`.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:159-163`.
Fresh `npm run build` reproduced the Vite warning for 822.94 kB and 1,026.16 kB chunks but did
not emit a Three.js clock deprecation warning.

Impact: the warning inventory is stale or lacks command attribution. Remove the Three.js
warning from final build reporting or identify the command that emits it.

## Coverage Assessment

### Freshly Executed

* Full lint: passed
* Full client and server build: passed
* Full workspace tests: database-blocked after all available assertions passed
* Release-contract tests: 9 passed
* Playwright dependency preflight: passed
* Standard Playwright discovery: 14 tests
* Multi-replica Playwright discovery: 1 test
* Migration script syntax: passed
* PostgreSQL readiness: unavailable at `127.0.0.1:5432`
* Validation artifact whitespace and UTF-8 checks: passed before finalization

### Not Independently Completed

* Successful PostgreSQL-backed unit and integration execution
* Standard Playwright execution
* Multi-replica Playwright execution
* Migration and 10-test recovery rehearsal
* Query of historical container cleanup because Docker is unavailable
* Verification of immutable E2E, migration, or full-test result artifacts because none are stored in the workspace

The failed fresh `npm test` is not graded as an implementation defect. Every failure was an
`ECONNREFUSED 127.0.0.1:5432` setup error, and the resulting inventory is consistent with the
historical 420-passed, 9-skipped claim if the 53 database tests run successfully. Those
historical results remain unverified, not disproved.

## Recommended Next Validations

* Require and deploy immutable retirement evidence for the already-retired build
* Reject internally inconsistent or empty-group promotion reports
* Remove canonical canary controls and retired canvas runtime code
* Add release-contract assertions for retirement report and digest propagation
* Rerun `npm test` with disposable loopback PostgreSQL and retain machine-readable output
* Rerun standard and multi-replica Playwright suites and retain result artifacts
* Rerun migration rehearsal and verify disposable databases are absent afterward
* Recheck all E2E ports, Playwright state files, processes, and containers after database-backed validation

## Clarifying Questions

* Are the claimed full-test, E2E, migration, and cleanup logs retained outside this workspace?
* Is retirement evidence injected through an out-of-band deployment mechanism not represented in `.github/workflows/cd.yml`?
