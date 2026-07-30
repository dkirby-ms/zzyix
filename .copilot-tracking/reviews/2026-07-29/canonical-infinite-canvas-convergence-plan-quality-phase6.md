<!-- markdownlint-disable-file -->

# Canonical Infinite Canvas Convergence Phase 6 Quality Validation

## Status

Failed with 3 Critical, 4 Major, and 1 Minor finding. Phase 6 closes IV-001,
IV-002, IV-005, IV-006, IV-008, and IV-009. Release readiness remains blocked.

## Critical Findings

### IV-013: Existing deployments do not install retirement evidence

The create branch installs `legacy-retirement-report` at `.github/workflows/cd.yml:620-636`,
but the existing-app branch sets only `database-url` at `.github/workflows/cd.yml:588-592`
and then references `secretref:legacy-retirement-report` at `.github/workflows/cd.yml:604`.
An update therefore depends on stale external state or fails despite the workflow requiring
fresh immutable evidence. The release-contract suite passes because it does not distinguish
the create and update branches.

Impact: the normal production update path does not reliably deploy the digest-bound evidence
required for startup. Install the retirement-report secret in the update branch and add a
release-contract assertion for both branches.

### IV-003: HTTP telemetry can manufacture promotion attempts

The authenticated fallback endpoint accepts caller-selected `x-canonical-attempt-id` values
at `apps/server/src/index.ts:1005-1015`. Promotion counts distinct entry attempt IDs at
`apps/server/src/operations/canonicalRetirementReportCli.ts:161-164`. No server-issued nonce,
attempt registry, or principal ownership check binds the submitted UUID to an authenticated
socket attempt.

Impact: one authenticated principal can manufacture the 100-attempt promotion threshold.
Issue attempt identity server-side and authorize one fallback terminal against that identity.

### IV-004: Reconnect lineage cannot represent every terminal outcome

The client reuses the entry attempt ID for reconnect terminals in
`apps/client/src/network/useSocketConnection.ts:102-121,145-200`. The server retains one
terminal per event name per socket at `apps/server/src/index.ts:1589-1599`, while report
generation rejects repeated terminal names for the same attempt at
`apps/server/src/operations/canonicalRetirementReportCli.ts:142-147`.

Impact: later reconnect cycles are dropped or invalidate evidence. Define unique server-bound
child attempts for reconnect and resubscribe cycles and test multiple cycles.

## Major Findings

### IV-007: Session-era contracts remain compiled

Session and snapshot types remain exported at `apps/server/src/contracts.ts:83-109` and
`apps/server/src/contracts.ts:454-457`. The client still imports and handles the session
snapshot contract. This does not satisfy Step 6.3's requirement to remove retired public
runtime contracts and imports.

### IV-010: Required live boundaries are not composed

The HTTP retirement tests are live, but the Socket.IO fixture installs compatibility
middleware without the real authentication middleware at
`apps/server/src/index.integration.test.ts:192-200`. Navigation, claim, and presence checks
at `apps/server/src/index.integration.test.ts:278-461` exercise exported helpers rather than
the live route and socket stack.

### IV-014: Standard product placement acceptance fails

`npm run test:e2e` passed 13 tests and failed the authenticated product workflow. An isolated
rerun of `e2e/authentication.spec.ts:34-56` failed again after placement: the UI displayed a
tile but remained at `0 placed`, and `1 placed` never appeared. The deterministic failure
contradicts the changes log's 14-test pass claim and leaves the primary claim-and-place flow
without passing release acceptance.

### IV-011: Release artifacts overstate closure

The planning and changes artifacts declare all Phase 6 findings remediated even though the
Critical telemetry findings, deployment defect, and standard E2E failure remain. Release
readiness must remain blocked until every Critical and Major finding is corrected and rerun.

## Minor Finding

### IV-012: ADR keyword indentation remains malformed

`canonical quilt` has one extra leading space at
`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:7-10`.

## Closed Prior Findings

* IV-001: Production startup requires digest-bound retirement evidence
* IV-002: Report decisions are recomputed from accepted evidence
* IV-005: Final canonical discovery and entry canary controls are removed
* IV-006: Activation preserves the provisioned generation-1 pointer identity
* IV-008: Pre-world failures use null world identity and do not form generation groups
* IV-009: Missing or rejected presence renewal disconnects the affected socket

## Validation Evidence

* Focused Phase 6 server tests: Passed
* Focused Phase 6 client tests: Passed
* `npm run test:release-contract`: Passed, 9 tests
* `npm run lint`: Passed
* `npm run build`: Passed with the existing Vite chunk-size warning
* `npm test`: Passed, 368 tests with 9 skipped across 66 files
* `npm run test:e2e`: Failed, 13 passed and 1 failed
* Isolated failed Playwright test rerun: Failed with the same `1 placed` assertion
* Multi-replica Playwright: Passed, 1 test
* Migration rehearsal: Passed, 10 tests
* `git diff --check`: Passed before review artifact updates
* VS Code diagnostics: Passed on reviewed source, workflow, and ADR files
* Ports 3001 and 5173: Clear after validation

## Overall Assessment

Needs Rework. Mandatory evidence computation and several Phase 6 controls improved, but the
normal deployment path, promotion telemetry, reconnect accounting, runtime retirement, live
boundary coverage, and primary product acceptance are not release-ready.