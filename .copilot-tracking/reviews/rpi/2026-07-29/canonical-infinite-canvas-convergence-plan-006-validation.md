<!-- markdownlint-disable-file -->

# RPI Validation: Canonical Infinite Canvas Convergence Phase 006

## Validation Status

**Failed.** Phase 6 closes 6 of 12 implementation-review findings, but IV-003 and IV-004
remain Critical release blockers. IV-007, IV-010, and IV-011 remain Major, and IV-012
remains Minor. Step 6.1 is complete; Steps 6.2, 6.3, and 6.4 are incomplete.

## Scope

Validated Implementation Phase 6, Steps 6.1 through 6.4, including explicit closure
decisions for IV-001 through IV-012.

Inputs:

* `.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md`
* `.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md`
* `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md`
* `.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md`
* `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md`
* `.copilot-tracking/reviews/2026-07-29/canonical-infinite-canvas-convergence-plan-quality.md`

Validation used the current source and tests. Changes-log assertions were not treated as
proof without corresponding implementation or executable evidence.

## Plan-to-Change Comparison

### Step 6.1: Trustworthy retirement evidence and final-state deployment

Status: **Complete.** The changes log claims mandatory immutable evidence, derived report
decisions, CD propagation, and removal of final canary controls. Current source verifies
those claims:

* Production startup forces retirement evaluation instead of honoring an optional request
	at `apps/server/src/startup/rolloutGates.ts:38-43`.
* Report loading requires a path and digest, verifies the report bytes, parses the report,
	requires canonical serialization, and requires promotion at
	`apps/server/src/migration/quiltRollout.ts:98-114`.
* Parsing rebuilds the report from accepted events and rejects any caller-authored derived
	differences at `apps/server/src/operations/canonicalRetirementReportCli.ts:230-240`.
* CD requires the report secret and propagates evidence through deployment at
	`.github/workflows/cd.yml:274-280`, `.github/workflows/cd.yml:395-397`, and
	`.github/workflows/cd.yml:609-628`.
* The release contract asserts that canonical discovery and entry controls are absent at
	`scripts/release-contract.test.mjs:37-65`.

This closes IV-001, IV-002, and IV-005.

### Step 6.2: Telemetry identity and terminal observability

Status: **Failed.** Pre-world identity is corrected, but attempt ownership and reconnect
lineage remain exploitable or incomplete:

* Pre-world discovery failures use null world identity and are excluded from generation
	groups at `apps/server/src/operations/canonicalRetirementReportCli.ts:47-48` and
	`apps/server/src/operations/canonicalRetirementReportCli.ts:149-170`. This closes IV-008.
* The authenticated HTTP telemetry endpoint accepts `x-canonical-attempt-id` directly from
	the caller and supplies it as the authoritative entry attempt at
	`apps/server/src/index.ts:1005-1015`. Promotion volume counts distinct entry attempt IDs
	at `apps/server/src/operations/canonicalRetirementReportCli.ts:161-164`. One authenticated
	principal can therefore submit many `canonical_entry` terminals under invented UUIDs.
* The client reuses one entry attempt ID for reconnect terminals at
	`apps/client/src/network/useSocketConnection.ts:102-121` and
	`apps/client/src/network/useSocketConnection.ts:145-200`. The server keeps only one
	terminal per event name per socket at `apps/server/src/index.ts:1589-1599`, while report
	generation rejects a second terminal with the same name and attempt ID at
	`apps/server/src/operations/canonicalRetirementReportCli.ts:142-147`. Multiple reconnect
	cycles are either dropped or invalidate the evidence report instead of producing one
	observable terminal per reconnect attempt.

IV-003 and IV-004 remain open.

### Step 6.3: Provenance, lease loss, and runtime retirement

Status: **Partial.** Activation provenance and lease-loss behavior are corrected, but
compiled legacy contracts remain and the ADR indentation is still wrong:

* Activation requires the existing inactive generation-1 pointer, preserves its quilt ID,
	and applies the generation-1-to-2 CAS at `apps/server/src/db/repository.ts:3154-3184`.
	PostgreSQL coverage rejects repointing at
	`apps/server/src/db/canonicalWorld.postgres.integration.test.ts:151-189`. This closes
	IV-006.
* Missing and rejected presence renewals disconnect deterministically at
	`apps/server/src/index.ts:254-265`, with focused coverage at
	`apps/server/src/index.integration.test.ts:325-334`. This closes IV-009.
* Session-era public types remain exported from compiled server contracts at
	`apps/server/src/contracts.ts:83-109`, `apps/server/src/contracts.ts:168-171`, and
	`apps/server/src/contracts.ts:454-457`. The compiled client still accepts and handles
	`SessionSnapshotPayload` at `apps/client/src/network/useSocketConnection.ts:35` and
	`apps/client/src/App.tsx:692-699`. This does not satisfy the explicit requirement to
	delete retired contracts and imports from compiled runtime code.
* `canonical quilt` remains over-indented in ADR frontmatter at
	`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:7-10`.

IV-007 and IV-012 remain open.

### Step 6.4: Composed coverage and release validation

Status: **Partial.** The focused suites pass, but required boundary composition and release
claim correction are incomplete:

* Live HTTP coverage verifies 401, 403, and 426 ordering at
	`apps/server/src/index.integration.test.ts:152-189`.
* The live Socket.IO fixture installs only `enforceCanonicalSocketCompatibility` at
	`apps/server/src/index.integration.test.ts:192-200`; it does not compose
	`createSocketAuth`. The tests therefore do not verify the requested authentication,
	compatibility, and telemetry middleware chain together.
* Navigation, claim, and presence checks under
	`apps/server/src/index.integration.test.ts:278-461` exercise exported helpers rather than
	live HTTP and Socket.IO routes. They do not supply the requested composed boundary proof.
* The planning log says Phase 6 passed and corrected the findings at
	`.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md:32-33`
	and `.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md:53-55`.
	The changes log likewise declares all findings remediated at
	`.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:175-180`.
	Those statements conflict with the open Critical and Major findings above.

IV-010 and IV-011 remain open.

## Finding Closure Matrix

| Finding | Severity | Closure | Evidence and rationale |
|---------|----------|---------|------------------------|
| IV-001 | Critical | Closed | Production forces retirement gates and requires digest-bound evidence: `apps/server/src/startup/rolloutGates.ts:38-43`, `apps/server/src/migration/quiltRollout.ts:98-114`. |
| IV-002 | Critical | Closed | The parser rebuilds accepted-event calculations and compares the complete canonical report: `apps/server/src/operations/canonicalRetirementReportCli.ts:230-240`. |
| IV-003 | Critical | Open | Authenticated HTTP callers can mint arbitrary entry attempt IDs: `apps/server/src/index.ts:1005-1015`; those IDs count toward promotion: `apps/server/src/operations/canonicalRetirementReportCli.ts:161-164`. |
| IV-004 | Critical | Open | Reconnect cycles reuse one lineage, while collection drops or report generation rejects repeated terminals: `apps/client/src/network/useSocketConnection.ts:145-200`, `apps/server/src/index.ts:1589-1599`, `apps/server/src/operations/canonicalRetirementReportCli.ts:142-147`. |
| IV-005 | Critical | Closed | CD evidence is mandatory and release-contract coverage rejects final discovery and entry flags: `.github/workflows/cd.yml:274-280`, `scripts/release-contract.test.mjs:37-65`. |
| IV-006 | Major | Closed | Activation preserves the provisioned pointer identity and exact generation CAS: `apps/server/src/db/repository.ts:3154-3184`. |
| IV-007 | Major | Open | Session-era public contracts and client snapshot imports remain compiled: `apps/server/src/contracts.ts:83-109`, `apps/server/src/contracts.ts:454-457`, `apps/client/src/network/useSocketConnection.ts:35`. |
| IV-008 | Major | Closed | Pre-world failures use null identity, stay out of world groups, and block promotion: `apps/server/src/operations/canonicalRetirementReportCli.ts:47-48`, `apps/server/src/operations/canonicalRetirementReportCli.ts:149-170`. |
| IV-009 | Major | Closed | False or rejected renewal disconnects the socket: `apps/server/src/index.ts:254-265`, `apps/server/src/index.integration.test.ts:325-334`. |
| IV-010 | Major | Open | Live socket tests omit authentication middleware and navigation, claim, and presence checks are helper-level: `apps/server/src/index.integration.test.ts:192-200`, `apps/server/src/index.integration.test.ts:278-461`. |
| IV-011 | Major | Open | Release artifacts still claim all findings closed: `.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md:32-33`, `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:175-180`. |
| IV-012 | Minor | Open | ADR frontmatter retains the over-indented keyword: `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:7-10`. |

## Severity-Graded Findings

### Critical Findings

#### IV-003: HTTP telemetry can manufacture promotion attempts

The fallback endpoint is authenticated, but authentication does not bind the submitted UUID
to a server-issued socket attempt or principal-owned attempt record. The endpoint accepts a
caller-selected header and server-stamps the current world identity before recording any
allowed terminal. Because retirement eligibility counts unique entry attempt IDs, one
authenticated caller can manufacture the 100-attempt threshold.

Required correction: issue or persist attempt identity server-side, authorize fallback
delivery against that identity and principal, enforce one entry terminal, and add an abuse
test that submits many UUIDs from one principal.

#### IV-004: Reconnect lineage cannot represent every terminal outcome

Entry and reconnect terminals share one attempt ID. One server socket drops a second
reconnect terminal by name; a reconnect that creates another server socket can emit a second
terminal that causes offline report generation to fail as a duplicate. This violates the
one-deliverable-terminal requirement for each reconnect attempt and can invalidate otherwise
legitimate release evidence.

Required correction: define a server-bound entry attempt plus unique reconnect child IDs,
validate parent-child lineage, and test at least two recovery or exhaustion cycles.

### Major Findings

#### IV-007: Legacy contracts remain in compiled runtime modules

Retired handlers have been replaced by the deterministic 426 boundary, but session-era
types, comments, snapshot payloads, callback parameters, and App handling remain in compiled
server and client modules. Database schema residue is permitted; public runtime contracts
and imports are not.

Required correction: remove the unused session snapshot callback and session-era public
contract exports, or move narrowly required persistence-only shapes behind internal database
types with no supported runtime exposure.

#### IV-010: Required live middleware and product boundaries are not composed

The HTTP retirement test is live, and the socket compatibility test is live, but the socket
fixture bypasses authentication middleware. Navigation, claim, and presence tests do not run
through the live route and socket stack. Passing helper tests cannot detect middleware-order,
principal-context, serialization, or side-effect defects at the composed boundary.

Required correction: test the actual authenticated Socket.IO chain and add live navigation,
claim, and presence lifecycle coverage using isolated persistence.

#### IV-011: Release artifacts overstate closure

The current planning and changes artifacts say all findings are corrected even though
Critical telemetry integrity defects remain. Release readiness must stay blocked until a
subsequent validation closes every Critical and Major finding.

Required correction: mark Phase 6 and release readiness blocked or partial, then update the
claims only after revalidation.

### Minor Finding

#### IV-012: ADR keyword indentation remains malformed

The `canonical quilt` keyword uses one extra leading space relative to adjacent YAML sequence
items. Align it with the other entries and validate the frontmatter with a YAML parser.

## Coverage Assessment

| Area | Assessment |
|------|------------|
| Step 6.1 | Complete. Mandatory evidence, report derivation, CD propagation, and final control removal are verified. |
| Step 6.2 | Failed. Pre-world grouping is corrected, but attempt ownership and reconnect terminal lineage are not trustworthy. |
| Step 6.3 | Partial. Provenance and lease-loss behavior are correct; runtime contract retirement and ADR formatting are incomplete. |
| Step 6.4 | Partial. Focused checks pass; required composed coverage and truthful release claims are incomplete. |
| IV closure | 6 of 12 closed: IV-001, IV-002, IV-005, IV-006, IV-008, and IV-009. |

Overall requirement coverage is approximately 50 percent by finding count. The open findings
include two Critical release gates, so numerical coverage does not justify release readiness.

## Validation Evidence

Current-session checks:

* Phase 6 focused server Vitest command passed
* Phase 6 focused client Vitest command passed
* `npm run test:release-contract` passed
* `git diff --check` passed
* Editor diagnostics reported no ADR error, but direct source inspection found the unresolved
	indentation mismatch at `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:9`

The current working tree has no matching uncommitted Phase 6 product source or test changes.
The plan, planning log, changes log, and this validation document are modified or untracked.

Not independently rerun in this session:

* Full workspace lint, build, and test
* PostgreSQL-backed canonical integration beyond the focused command result
* Standard Playwright suite
* Multi-replica Playwright suite
* Migration and recovery rehearsal

The planning log and changes log record historical passes for these checks, but no immutable
raw output was identified during this validation. Those claims do not close the source-level
findings.

## Recommended Next Validations

* Verify that one authenticated principal cannot submit multiple server-accepted entry
	attempts by changing `x-canonical-attempt-id`
* Verify two reconnect cycles under one entry produce two valid child terminals and a valid
	retirement report
* Exercise `createSocketAuth`, canonical compatibility, and telemetry binding in one live
	Socket.IO server
* Exercise canonical navigation, claim mutation, and first/last presence lease behavior
	through live routes and sockets
* Compile after removing session-era public contracts and confirm no product imports remain
* Parse the corrected ADR frontmatter as YAML
* Rerun PostgreSQL, both Playwright suites, and migration rehearsal after fixes

## Unresolved Questions

* What server-side artifact is intended to authorize HTTP fallback delivery for a specific
	authenticated entry attempt? No attempt registry, signed token, or socket-issued nonce is
	evident in the current implementation.
* Where are the immutable raw outputs for the claimed Phase 6 PostgreSQL, Playwright,
	multi-replica, and migration runs retained?
