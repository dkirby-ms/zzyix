<!-- markdownlint-disable-file -->

# RPI Validation: Canonical Infinite Canvas Convergence Phase 007

## Validation Status

**Failed.** Phase 7 closes IV-003, IV-004, IV-013, and IV-014. IV-007, IV-010,
IV-011, and IV-012 remain open. A new Major finding, IV-015, records the
order-dependent standard Playwright failure. No Critical finding remains open, but four
Major findings still block release readiness.

## Scope

Validated Implementation Phase 7, Steps 7.1 through 7.4, and explicit closure of IV-003,
IV-004, IV-007, IV-010, IV-011, IV-012, IV-013, and IV-014.

Inputs:

* `.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md`
* `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md`
* `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md`
* `.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md`
* `.copilot-tracking/reviews/2026-07-29/canonical-infinite-canvas-convergence-plan-review.md`
* `.copilot-tracking/reviews/2026-07-29/canonical-infinite-canvas-convergence-plan-quality-phase6.md`
* `.copilot-tracking/plans/logs/2026-07-29/canonical-infinite-canvas-convergence-log.md`

Validation inspected committed Phase 7 source at `e412955` and reran focused and release
checks. Changes-log and planning-log assertions were not treated as proof without current
source or executable evidence.

## Plan-to-Change Comparison

| Plan step | Changes-log claim | Verified status | Assessment |
|-----------|-------------------|-----------------|------------|
| 7.1 | Both deployment branches install retirement evidence and the ADR indentation is corrected | Partial | Both deployment branches install evidence and release-contract tests distinguish them. The ADR indentation remains malformed. |
| 7.2 | Shared PostgreSQL attempts bind entry and child lineage across replicas | Complete | Entry attempts are server-issued, principal-bound, expiring, and single-use. Reconnect and resubscribe children require an owned entry parent, and report generation accepts distinct child terminals. |
| 7.3 | Residual contracts are removed and all live boundaries are composed | Failed | Snapshot handlers and imports are removed, and socket auth plus compatibility are composed. Session-era public contract fields remain, while navigation, claim, and presence tests remain helper-level. |
| 7.4 | Placement acceptance and every release validation pass | Failed | The authenticated `1 placed` workflow passes on rerun, but the required standard Playwright suite fails consistently at 13 of 14 in the full ordering. Release artifacts still claim complete closure. |

## Per-Step Evidence

### Step 7.1: Install retirement evidence on every deployment path

Status: **Partial.** IV-013 is closed, but IV-012 remains open.

* The existing-app branch installs both `database-url` and `legacy-retirement-report`
	before `az containerapp update` references the secret at
	`.github/workflows/cd.yml:588-609`.
* The create branch installs the same report secret in the create command at
	`.github/workflows/cd.yml:615-628`.
* Release-contract parsing separates update and create branches and asserts secret
	installation and reference in each at `scripts/release-contract.test.mjs:20-41` and
	`scripts/release-contract.test.mjs:84-95`.
* `npm run test:release-contract` passed all 9 checks.
* The ADR still indents `canonical quilt` one space farther than adjacent keyword items at
	`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:7-10`.

### Step 7.2: Issue server-owned entry and reconnect attempt lineage

Status: **Complete.** IV-003 and IV-004 are closed.

* Canonical discovery issues an entry attempt after authentication and returns it in the
	descriptor at `apps/server/src/index.ts:977-984`.
* The PostgreSQL store binds attempts to a principal, kind, parent, expiry, and consumed
	state at `apps/server/src/migration/canonicalAttempts.ts:31-91`; schema constraints enforce
	entry-versus-child parent shape at `apps/server/src/db/schema.ts:165-194`.
* HTTP telemetry consumes the attempt atomically for the authenticated principal and exact
	event kind at `apps/server/src/index.ts:1035-1080`. Replayed, foreign, fabricated, expired,
	or wrong-kind attempts cannot produce another accepted terminal.
* Socket compatibility checks that the authenticated principal owns the entry attempt at
	`apps/server/src/index.ts:1613-1651`. Socket reconnect terminals receive a server-issued
	child at `apps/server/src/index.ts:1681-1703`.
* Every live `subscribe_quilt_area` call receives and consumes a distinct resubscribe child
	at `apps/server/src/index.ts:1980-2015`.
* Disconnected client delivery requests a server-issued child before submitting fallback
	telemetry at `apps/client/src/network/useSocketConnection.ts:84-116`.
* PostgreSQL tests verify cross-bundle authorization, one concurrent consumer, foreign and
	fabricated rejection, expiry, and parent ownership at
	`apps/server/src/migration/canonicalAttempts.postgres.integration.test.ts:36-84`.
* Report validation requires parent IDs for reconnect and resubscribe terminals at
	`apps/server/src/operations/canonicalRetirementReportCli.ts:43-72`, and regression coverage
	accepts multiple distinct child cycles at
	`apps/server/src/operations/canonicalRetirementReportCli.test.ts:112-133`.

### Step 7.3: Remove residual contracts and compose live product boundaries

Status: **Failed.** IV-007 and IV-010 remain open.

Verified progress:

* The client socket hook no longer imports or registers `SessionSnapshotPayload` or
	`session_snapshot`; the negative regression is at
	`apps/client/src/network/useSocketConnection.test.ts:110-125`.
* The live Socket.IO fixture composes `createSocketAuth` and
	`enforceCanonicalSocketCompatibility` at
	`apps/server/src/index.integration.test.ts:216-245`.
* Live socket coverage verifies unsupported-client rejection and handshake-bound entry
	telemetry at `apps/server/src/index.integration.test.ts:247-309`.

Remaining gaps:

* `PrincipalCommandAvailability` still exports `createSession`, and `/me` still emits
	`createSession: false`, at `apps/server/src/contracts.ts:163-173` and
	`apps/server/src/auth/httpAuth.ts:70-81`.
* `ApiError` still exports session-specific errors, and the public contract comments still
	advertise `/sessions`, `session_snapshot`, session rooms, and session reconciliation at
	`apps/server/src/contracts.ts:89-146`, `apps/server/src/contracts.ts:282-292`, and
	`apps/server/src/contracts.ts:638-659`.
* Navigation, ownership, and presence checks are helper-level tests at
	`apps/server/src/index.integration.test.ts:77-104` and
	`apps/server/src/index.integration.test.ts:374-445`. No test traverses the live canonical
	navigation route, claim route, and presence socket lifecycle requested by Step 7.3.

### Step 7.4: Repair placement acceptance and rerun release validation

Status: **Failed.** IV-014 is closed, but IV-011 remains open and IV-015 is new.

* Accepted quilt placement acknowledgements clear optimistic state and apply the durable
	tile to every affected patch at `apps/client/src/App.tsx:1090-1116` and
	`apps/client/src/App.tsx:1298-1314`.
* Client regression coverage observes `1 placed` after the accepted placement at
	`apps/client/src/App.test.tsx:1710-1772`.
* The exact authenticated claim-and-place workflow asserts `1 placed` at
	`e2e/authentication.spec.ts:34-56` and passed on focused rerun, 7 of 7 tests.
* The standard Playwright suite failed twice at 13 of 14. The repeated failure was
	`owner placements converge for collaborators while non-owner mutation is denied` at
	`e2e/multi-user-fixtures.spec.ts:53-99`; the received tile identity map contained an extra
	entry at the exact-count assertion in `e2e/multi-user-fixtures.spec.ts:22-33`.
* The same multi-user case passed alone, 1 of 1, indicating order-dependent state leakage or
	incomplete isolation rather than a deterministic assertion defect.
* The changes log and planning log still declare all findings closed and the standard suite
	passed. Those claims conflict with current source gaps and repeated full-suite failures.

## Finding Closure Matrix

| Finding | Prior severity | Closure | Evidence and rationale |
|---------|----------------|---------|------------------------|
| IV-003 | Critical | Closed | Entry IDs are issued after authentication and atomically consumed for the owning principal: `apps/server/src/index.ts:977-984`, `apps/server/src/index.ts:1035-1080`, `apps/server/src/migration/canonicalAttempts.ts:31-91`. |
| IV-004 | Critical | Closed | Reconnect and resubscribe cycles use unique parent-bound child IDs, and reports accept multiple child terminals: `apps/server/src/index.ts:1681-1703`, `apps/server/src/index.ts:1980-2015`, `apps/server/src/operations/canonicalRetirementReportCli.test.ts:112-133`. |
| IV-007 | Major | Open | Snapshot types and handlers are gone, but compiled public contracts still expose `createSession`, session errors, and session protocol commitments: `apps/server/src/contracts.ts:89-173`, `apps/server/src/contracts.ts:638-659`. |
| IV-010 | Major | Open | Socket authentication and compatibility are composed, but navigation, claim, and presence coverage remains helper-level: `apps/server/src/index.integration.test.ts:77-104`, `apps/server/src/index.integration.test.ts:374-445`. |
| IV-011 | Major | Open | Planning and release artifacts claim complete closure despite IV-007, IV-010, IV-012, and the repeated standard-suite failure. |
| IV-012 | Minor | Open | `canonical quilt` remains over-indented in ADR frontmatter: `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:7-10`. |
| IV-013 | Critical | Closed | Both deployment branches install and reference the exact report secret, with branch-specific release-contract assertions: `.github/workflows/cd.yml:588-628`, `scripts/release-contract.test.mjs:20-95`. |
| IV-014 | Major | Closed | Durable placement accounting is implemented, client-covered, and the exact authenticated `1 placed` Playwright workflow passes on focused rerun: `apps/client/src/App.tsx:1090-1116`, `e2e/authentication.spec.ts:34-56`. |

## Severity-Graded Open Findings

### Critical Findings

None.

### Major Findings

#### IV-007: Session-era public contracts remain compiled

The concrete snapshot type and client handler cited by the prior review were removed, but
the exported server contract still advertises session routes, session-specific errors,
session snapshots, and a `createSession` principal command. `/me` serializes that command in
the current runtime. This fails the Phase 7 criterion that retired session and snapshot
public contracts have no compiled runtime references.

Required correction: remove `createSession` from the public principal command response,
delete session-only public errors and protocol commitments, and keep any required database
compatibility shapes behind internal modules.

#### IV-010: Live navigation, claim, and presence boundaries are not composed

The Socket.IO authentication and compatibility chain is now genuinely composed. The rest
of Step 7.3 is not. Navigation and ownership tests call exported helpers, and lease-loss
coverage calls `renewPresenceLeaseOrDisconnect` directly. These tests cannot detect route
registration, authentication context, serialization, socket lifecycle, or persistence
integration defects at the requested live product boundaries.

Required correction: create an isolated live server fixture using the production HTTP and
Socket.IO registration path, then drive canonical navigation, claim mutation, first/last
presence, renewal, and disconnect behavior through network boundaries.

#### IV-011: Release artifacts still overstate closure

The changes log says all eight resumed findings are closed and all 14 standard Playwright
tests pass. The planning log says Phase 7 passed. Current validation leaves IV-007, IV-010,
and IV-012 open, and the standard suite failed twice at 13 of 14.

Required correction: mark Phase 7 and release readiness failed or partial until the open
findings and full-suite failure are corrected and independently rerun.

#### IV-015: Standard Playwright isolation is order-dependent

The full standard suite failed twice in this session at the first multi-user convergence
test. The same test passed in isolation, while the full ordering produced an extra tile
identity. The fixture provisions a new canonical world and resets during teardown at
`e2e/support/multiUser.ts:348-405`, but the observed behavior shows prior state or pending
activity still crosses the acceptance boundary.

Required correction: identify and remove the state leak, prove reset completion before new
browser contexts connect, and rerun the complete standard suite repeatedly without retries.

### Minor Findings

#### IV-012: ADR keyword indentation remains malformed

The `canonical quilt` list item has one extra leading space relative to adjacent YAML
keywords. The direct source contradicts the changes-log claim that the indentation was
corrected.

Required correction: align the list item and parse the frontmatter as YAML in validation.

## Coverage Assessment

| Area | Assessment |
|------|------------|
| Step 7.1 | Partial. Deployment evidence is installed on both paths; ADR acceptance is incomplete. |
| Step 7.2 | Complete. Shared server-owned attempt issuance, ownership, expiry, consumption, child lineage, and multi-cycle report support are verified. |
| Step 7.3 | Failed. Snapshot removal and socket composition are present; residual public contracts and required live product boundaries remain. |
| Step 7.4 | Failed. The original placement defect is corrected, but the standard suite and truthful release reporting criteria fail. |
| Resumed finding closure | 4 of 8 closed: IV-003, IV-004, IV-013, and IV-014. |

Finding-count coverage is 50 percent. Behavioral implementation is stronger than that raw
count suggests because all three resumed Critical findings are closed. Release readiness
still fails because three resumed Major findings and one new Major finding remain open.

## Validation Evidence

Current-session executable evidence:

* `npm run test:release-contract`: Passed, 9 of 9
* Focused Phase 7 server command: Passed, 64 tests
* Focused Phase 7 client command: Passed, 25 tests with 16 skipped
* `npm run lint`: Passed
* `npm run build`: Passed with the existing Vite chunk-size warning
* `npm test`: Passed, 367 tests with 17 skipped across 147 files
* Focused authentication Playwright rerun: Passed, 7 of 7, including `1 placed`
* Focused multi-user failure rerun: Passed, 1 of 1
* Full standard Playwright run: Failed, 13 passed and 1 failed
* Full standard Playwright rerun: Failed, 13 passed and 1 failed at the same multi-user test
* Multi-replica Playwright: Passed, 1 of 1
* Migration and recovery rehearsal: Passed, 10 of 10
* `git diff --check`: Passed
* VS Code diagnostics on reviewed source, workflow, script, and ADR files: No errors
* Ports 3001 and 5173: Clear after validation

The focused test passes close the deterministic IV-014 placement defect, but isolated passes
do not satisfy Step 7.4's explicit requirement that the complete standard Playwright suite
pass.

## Recommended Next Validations

* [ ] Add and run a regression proving `/me` and compiled contracts expose no session-era
	command, error, snapshot, or room contract
* [ ] Exercise canonical navigation and claim through live authenticated HTTP routes
* [ ] Exercise presence join, renewal, lease loss, and last-socket leave through a live
	authenticated Socket.IO server backed by isolated PostgreSQL
* [ ] Diagnose the full-suite extra tile and run the 14-test standard suite repeatedly with
	one worker and retries disabled
* [ ] Parse the corrected ADR frontmatter with a YAML parser
* [ ] Update planning and changes artifacts only after all Critical and Major checks pass
* [ ] Retain machine-readable full-suite, PostgreSQL, multi-replica, and migration outputs
	for independent release verification

## Unresolved Questions

* Is `commands.createSession` intentionally retained as a supported compatibility field? If
	so, Phase 7 needs an explicit scope exception because the current success criterion says
	retired session public contracts have no compiled runtime references.
* Which prior test or asynchronous operation contributes the extra tile identity to the
	first multi-user convergence test during the full Playwright ordering?