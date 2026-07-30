<!-- markdownlint-disable-file -->
# RPI Validation: Canonical Infinite Canvas Convergence Phase 4

## Validation Scope

* Phase: 4, Retire Session Compatibility
* Status: Failed
* Finding counts: 4 Critical, 3 Major, 0 Minor
* Plan: `.copilot-tracking/plans/2026-07-29/canonical-infinite-canvas-convergence-plan.instructions.md`
* Changes: `.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md`
* Research: `.copilot-tracking/research/2026-07-29/canonical-infinite-canvas-convergence-research.md`
* Details: `.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md`

## Plan Coverage

| Requirement | Status | Verified evidence |
|-------------|--------|-------------------|
| Measured promotion gates before retirement | Failed | Report construction calculates the specified 24-hour, 100-attempt, success-rate, p95, resync, frame-time, immediate-trigger, and five-minute-window gates at `apps/server/src/operations/canonicalRetirementReportCli.ts:8-16` and `apps/server/src/operations/canonicalRetirementReportCli.ts:150-163`. Retirement behavior is nevertheless unconditional while startup validation is optional; see F-001 and F-002. |
| Unconditional canonical entry after evidence approval | Failed | The client always starts discovery at `apps/client/src/App.tsx:559-581`, but the server still gates discovery at `apps/server/src/index.ts:235` and `apps/server/src/index.ts:1658-1661`. CD defaults both Phase 2 controls to false at `.github/workflows/cd.yml:274-275`, and the client still hides canonical navigation behind the entry flag at `apps/client/src/App.tsx:1862`. See F-003. |
| Authenticated deterministic HTTP 426 ordering | Implemented, test gap | Both session routes apply `requireHttpPrincipal` before the exact 426 responder at `apps/server/src/index.ts:1768-1799`. The middleware preserves 401 with `WWW-Authenticate: Bearer` and resolver-derived 403 before `next()` at `apps/server/src/auth/httpAuth.ts:25-57`. The responder sets `Cache-Control: no-store`, `Upgrade: zzyix/2.0`, the safe code/message/request ID, schema `2.0.0`, and protocol 2 at `apps/server/src/index.ts:1768-1790`; neither route parses a body or invokes creation/rate-limit code. Route composition is not integration-tested; see F-007. |
| Quilt-ID socket handshake and exact unsupported response | Implemented, test gap | Supported auth requires schema `2.0.0`, protocol 2, quilt ID, generation, and entry attempt ID at `apps/server/src/index.ts:2220-2229`. Token/principal middleware executes first at `apps/server/src/index.ts:2244`, then unsupported clients receive the exact `connect_error.data` payload from `apps/server/src/index.ts:2231-2240`. The client sends quilt identity at `apps/client/src/network/useSocketConnection.ts:64-88`. Unit coverage exists at `apps/server/src/index.test.ts:29-80` and `apps/client/src/network/useSocketConnection.test.ts:313-360`, but no live middleware-order assertion exists. |
| Removal of canvas-wide supported runtime paths | Partial | Runtime registration is disabled by the constant at `apps/server/src/index.ts:155`, and legacy handler blocks are unreachable at `apps/server/src/index.ts:2394` and `apps/server/src/index.ts:2758`. The handlers, process-local session state, snapshots, sequencing, canvas rooms, REST session response contracts, and V1 socket events remain compiled and exported; see F-005. |
| Retirement telemetry and report integrity | Failed | Typed terminal events, strict NDJSON parsing, event-ID deduplication, nearest-rank p95, half-open windows, canonical JSON, and SHA-256 output exist at `apps/server/src/operations/canonicalRetirementReportCli.ts:44-92`, `apps/server/src/operations/canonicalRetirementReportCli.ts:98-163`, and `apps/server/src/operations/canonicalRetirementReportCli.ts:223`. Startup does not validate report semantics, authenticated entry attempts are not bound to the socket attempt, and some server-owned events use placeholder world identity; see F-002, F-004, and F-006. |
| Relevant Phase 4 tests | Partial | Focused server tests passed 43/43 and focused client tests passed 34 with 8 skipped. Existing tests cover report generation, digest mismatch, exact response bodies, helper-level socket auth, and client handshake. They omit release wiring and actual HTTP/socket middleware ordering; see F-007. |

Two of the seven requested surfaces have the required product behavior in source. Three are
partial and two fail at their controlling gate. Critical evidence-enforcement defects make
the phase unsafe to promote regardless of the passing focused suites.

## Findings

### Critical

#### F-001: Compatibility retirement is active without passing the measured startup gate

Production gate validation runs only when `FEATURE_LEGACY_RETIREMENT_REQUESTED` is true at
`apps/server/src/startup/rolloutGates.ts:38-44`. The retired behavior is not conditional on
that decision: session routes always return 426 at `apps/server/src/index.ts:1792-1799`, the
socket accepts only canonical V2 auth at `apps/server/src/index.ts:2220-2273`, and retired
canvas handlers are hard-disabled at `apps/server/src/index.ts:155`.

The CD environment declares and deploys only the older protocol, discovery, and entry flags
at `.github/workflows/cd.yml:273-275` and validates that same list at
`.github/workflows/cd.yml:363-370`. It does not propagate
`FEATURE_LEGACY_RETIREMENT_REQUESTED`, `LEGACY_RETIREMENT_REPORT_PATH`, or
`LEGACY_RETIREMENT_REPORT_SHA256`. `scripts/release-contract.test.mjs` contains no retirement
report assertion.

Impact: a production release can retire REST and socket compatibility without loading any
24-hour report or proving any promotion threshold. Wire the approved immutable report and
digest through deployment, require retirement approval for the retired build, and make
startup fail closed when the evidence is absent.

#### F-002: A digest-matched hand-authored report can assert promotion without evidence

`parseCanonicalRetirementReport` validates field shapes but does not recompute group rates,
eligibility, failed checks, client budget, measured-window approval, or recommendation at
`apps/server/src/operations/canonicalRetirementReportCli.ts:166-214`. Startup then directly
trusts those decision booleans at `apps/server/src/migration/quiltRollout.ts:108-113`.

The production gate test constructs a report with `groups: []`, no triggers, no windows,
and a manually asserted promote decision at
`apps/server/src/startup/rolloutGates.test.ts:29-55`; the test expects startup to accept it at
`apps/server/src/startup/rolloutGates.test.ts:137-153`. This report could not be produced by
`buildCanonicalRetirementReport`, whose eligibility requires nonempty measured groups at
`apps/server/src/operations/canonicalRetirementReportCli.ts:153-163`.

Impact: SHA-256 proves that a file matches an operator-provided digest, not that its decision
was derived from evidence. Recompute every decision field from validated report metrics or
verify a report generated from retained input, and reject all internally inconsistent
reports, including empty-group promotion reports.

#### F-003: Phase 2 canary rollback controls remain after the required Phase 4 cutover

The details require unconditional canonical entry only after the evidence gate and explicitly
retire the temporary canary rollback path at
`.copilot-tracking/details/2026-07-29/canonical-infinite-canvas-convergence-details.md:375-420`.
The client discovery effect is unconditional at `apps/client/src/App.tsx:559-581`, but server
discovery still depends on `FEATURE_CANONICAL_DISCOVERY_ENABLED` at
`apps/server/src/index.ts:235` and `apps/server/src/index.ts:1658-1661`. The client still
requires `canonicalEntryEnabled` in runtime configuration at
`apps/client/src/config/runtimeConfig.ts:8` and `apps/client/src/config/runtimeConfig.ts:65-71`,
and uses it to suppress canonical navigation at `apps/client/src/App.tsx:1862`.

CD defaults both controls to false at `.github/workflows/cd.yml:274-275` and continues to
validate them as mutable feature flags at `.github/workflows/cd.yml:363-377`. The container
also requires `FEATURE_CANONICAL_ENTRY_ENABLED` at `apps/client/Dockerfile:36-54`.

Impact: the supported build can still disable discovery or hide the patch discovery/claim
surface, producing an unavailable or incomplete canonical experience instead of the sole
supported product entry. Remove the Phase 2 controls from runtime config and deployment
after the measured gate is enforced.

#### F-004: One authenticated socket can manufacture the 100-entry promotion threshold

The report counts distinct `canonical_entry` attempt IDs at
`apps/server/src/operations/canonicalRetirementReportCli.ts:153`. The socket handshake owns an
authenticated `entryAttemptId` at `apps/server/src/index.ts:2225-2228`, but
`recordCanonicalClientTelemetry` accepts any UUID supplied in the payload and does not compare
it with the socket attempt at `apps/server/src/index.ts:310-333`. The socket handler passes
only quilt ID, generation, and cohort at `apps/server/src/index.ts:3053-3061`.

Impact: one authenticated connection can submit 100 distinct ready-entry terminal IDs and
satisfy the nominal 100-attempt gate. Bind `canonical_entry` to
`socket.data.entryAttemptId`; separately validate reconnect and resubscribe attempt lineage,
and test rejection of foreign attempt IDs.

### Major

#### F-005: Canvas-wide runtime code and public contracts were disabled, not removed

The changes log claims removal of canvas-wide supported runtime paths at
`.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:107-129`.
In source, `registerRetiredCanvasHandlers` is a constant false at
`apps/server/src/index.ts:155`, but the full mutation, canvas-room, chunk snapshot, selection,
pointer, and session snapshot handlers remain at `apps/server/src/index.ts:2394-2600` and
`apps/server/src/index.ts:2758-3042`. Supported disconnects still invoke process-local session
bookkeeping at `apps/server/src/index.ts:3298`.

The public contracts still export session creation/list responses at
`apps/server/src/contracts.ts:176-203` and V1 canvas socket events at
`apps/server/src/contracts.ts:738-786`. Unit and integration suites continue to exercise lobby
summaries, authoritative sessions, process-local membership, V1 snapshots, and canvas
sequencing at `apps/server/src/index.test.ts:83-582` and
`apps/server/src/index.integration.test.ts:160-937`.

Impact: unreachable legacy code remains a compiled maintenance and regression surface and
contradicts Step 4.2's removal requirement. Delete the handlers, contracts, process-local
state, imports, and legacy-focused tests while preserving additive database records for
retention-approved cleanup.

#### F-006: Server-owned failure and rejection telemetry uses fabricated world identity

Canonical discovery failures emit the all-zero quilt UUID and generation 1 when no descriptor
is available at `apps/server/src/index.ts:1642-1653`. HTTP old-client rejection always emits
the same placeholder identity at `apps/server/src/index.ts:1768-1780`. The report accepts and
groups these records by generation and cohort at
`apps/server/src/operations/canonicalRetirementReportCli.ts:139-150`.

Impact: failure and old-client counts can be assigned to a fabricated generation, weakening
the required per-generation report and making release evidence misleading. Resolve the active
canonical identity from server-owned state for these events, or define and exclude an
explicit non-world rejection group from generation gates.

#### F-007: Tests do not verify the composed retirement boundaries or deployment contract

`apps/server/src/index.test.ts:29-80` tests the socket-auth predicate and 426 responder as
isolated helpers. `apps/server/src/auth/httpAuth.test.ts:17-71` tests generic 401 and successful
principal attachment. No test invokes `GET /sessions` or `POST /sessions`, proves 401/403/426
ordering, verifies the absence of payload parsing/rate-limit/database side effects, or runs
the real Socket.IO auth middleware chain. The focused client test proves emitted quilt auth
at `apps/client/src/network/useSocketConnection.test.ts:337-360`, but not server acceptance or
auth-first unsupported rejection. Release-contract tests do not mention retirement evidence.

Impact: exact helper payloads can remain green while route ordering, middleware ordering, and
deployment wiring regress. Add HTTP integration tests for 401, 403, and 426 with side-effect
spies; live socket tests for auth failure before upgrade rejection and exact
`connect_error.data`; and release-contract assertions for immutable report/digest propagation.

### Minor

None.

## Coverage Assessment

### Executed

* Server Phase 4 focus passed: 4 files, 43 tests passed, 0 failed
	* `src/operations/canonicalRetirementReportCli.test.ts`
	* `src/startup/rolloutGates.test.ts`
	* `src/index.test.ts`
	* `src/auth/httpAuth.test.ts`
* Client Phase 4 focus passed: 2 files, 34 tests passed, 8 skipped, 0 failed
	* `src/App.test.tsx`
	* `src/network/useSocketConnection.test.ts`

### Not Independently Completed

* Live HTTP route tests for authenticated 426 ordering and side-effect absence
* Live Socket.IO middleware tests for token/principal ordering and exact unsupported data
* Release-contract validation of retirement report and digest deployment
* PostgreSQL-backed integration and Playwright acceptance suites
* Independent verification of a real immutable 24-hour, 100-attempt promotion evidence set

The changes log records earlier full-suite success at
`.copilot-tracking/changes/2026-07-29/canonical-infinite-canvas-convergence-changes.md:144-162`,
but those results do not resolve the gate bypasses or missing assertions above.

## Recommended Next Validations

* Add a negative startup test proving an empty-group or internally inconsistent promote report is rejected
* Add a startup/deployment test proving retired behavior cannot run without the report path and matching digest
* Add a telemetry test proving a socket cannot report an entry attempt other than its authenticated handshake attempt
* Add live HTTP tests for 401 with `WWW-Authenticate`, principal-status 403, exact 426, and zero creation/rate-limit side effects
* Add live socket tests for auth-first rejection and exact `connect_error.data`
* Remove the Phase 2 controls and canvas-wide runtime code, then rerun focused client/server suites
* Run PostgreSQL integration, standard Playwright, and multi-replica Playwright acceptance after the critical findings are fixed

## Clarifying Questions

* Is there an immutable NDJSON export, generated canonical report, report digest, and approval record for the claimed production observation window outside this workspace?
* Was compatibility retirement deployed through an out-of-band mechanism that supplies variables absent from `.github/workflows/cd.yml`?
