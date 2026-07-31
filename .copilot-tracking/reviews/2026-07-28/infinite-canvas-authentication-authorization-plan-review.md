<!-- markdownlint-disable-file -->
# Task Review: Infinite-Canvas Authentication and Authorization

## Review Metadata

* Review date: 2026-07-29
* Related plan: `.copilot-tracking/plans/2026-07-28/infinite-canvas-authentication-authorization-plan.instructions.md`
* Changes log: `.copilot-tracking/changes/2026-07-28/infinite-canvas-authentication-authorization-changes.md`
* Research: `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md`
* Review scope: Full eight-phase implementation
* Branch: `infinite-canvas`

## Review Status

Overall status: Needs Rework

| Severity | Count |
|----------|------:|
| Critical |     4 |
| Major    |    10 |
| Minor    |     3 |

Counts are deduplicated across phase and quality validators. Findings that describe the same root defect are counted once at the highest assigned severity.

## Scope Notes

The changes log claims all eight phases complete. Fresh validators replaced eight stale artifacts that had been created while only Phase 1 existed. Phase 2 passes. The remaining phases are Failed or Partial because implementation, security coverage, operational provisioning, and external rollout evidence remain incomplete.

Production mutation remains disabled. This contains the highest-risk protocol-v2 replay defect but does not make the implementation eligible for production mutation rollout.

## RPI Validation

| Phase | Status | Evidence |
|-------|--------|----------|
| 1. Provider and release prerequisites | Failed | Issue scope and staging origin claims do not match observed external state; migration reconciliation lacks staging execution evidence. |
| 2. Identity persistence and verification | Passed | Identity schema, token verification, principal resolution, tests, lint, and build pass. The plan's literal focused command has a minor workspace-scoping defect. |
| 3. Protected HTTP, socket, and visibility | Partial | Protected boundaries exist, but anonymous public aggregate policy, exact WebSocket origin enforcement, and transport integration coverage diverge from the authenticated-only baseline. |
| 4. Client authentication lifecycle | Partial | MSAL, session lifecycle, and auth-loss teardown exist, but body-bearing requests cannot perform the promised refreshed-token retry. |
| 5. Claims and ownership lifecycle | Partial | Core commands exist, but deletion completion is not operationally runnable, idempotency is not actor and payload bound, recovery is not provisioned, and required scenarios are absent. |
| 6. Authenticated protocol-v2 mutations | Failed | Normal owner transactions exist, but replay precedes authorization and returns mutable current revisions. Cross-context, mixed-authority, alias, and delayed replay coverage is absent. |
| 7. Deployment, authenticated E2E, and rollout | Partial | Local OIDC and both browser gates pass, but multi-replica is not required by CI and key lifecycle and failed-renewal cases are missing. |
| 8. Final validation | Partial | The command matrix passes in this review, but production benchmark approval, mixed-authority evidence, staging controls, and rollout approvals remain incomplete. |

Detailed phase validations are stored under `.copilot-tracking/reviews/rpi/2026-07-28/`.

## Implementation Quality

Detailed findings: `.copilot-tracking/reviews/quality/2026-07-29/infinite-canvas-authentication-authorization-plan-quality.md`.

### Critical

* Protocol-v2 placement and removal replay a client-supplied operation ID before validating quilt, actor, lifecycle, ownership, or policy. A different principal can obtain an accepted response and event data.
* Due account deletion cannot complete operationally. The job handles one supplied principal, always denies retention approval, cannot enumerate due accounts, and has no runnable package command.
* Live issue state does not match the claimed release-scope narrowing for issues 14 and 98, leaving delegated authority mixed into the owner-only release contract.
* The observed staging CORS value is not an absolute HTTPS origin and does not match the same-origin API contract claimed by the changes log.

### Major

* Ownership lifecycle operation replay is not bound to the original actor and canonical payload.
* Replayed protocol-v2 acknowledgements use current patch revisions instead of immutable committed revisions.
* Body-bearing authenticated requests fail before the one-time refreshed-token retry can be sent.
* Socket.IO lacks explicit exact-origin enforcement for WebSocket handshakes.
* Central policy retains anonymous public aggregate access despite the authenticated-only baseline.
* Restricted recovery is invoked by CD but not provisioned with its job and least-privilege role in repository infrastructure.
* Authenticated multi-replica validation passes locally but is not a required CI gate.
* Security and lifecycle coverage omits cross-principal replay, mixed-patch authority, ownership HTTP routes, failed-renewal clearing, and claim, transfer, and abandonment browser scenarios.
* Production benchmark approval is absent from startup and CD mutation rollout gates.
* Migration-job reconciliation passes local contracts but lacks staging execution, active-migration refusal, and rollout-order evidence.

### Minor

* The literal Phase 2 focused test command can select client tests under the server environment; explicit workspace scoping is required.
* Four moderate `esbuild` advisories remain in the pinned Drizzle toolchain. The configured high-severity audit gate passes.
* Production client chunks exceed Vite's 500 kB warning threshold.

## Validation Commands

| Command | Status | Result |
|---------|--------|--------|
| `npm run audit` | Passed with advisories | No high-severity finding; four moderate advisories reported. |
| `npm run lint` | Passed | Client and server Oxlint checks pass. |
| `npm run build` | Passed with warning | Client and server builds pass; Vite reports large chunks. |
| `npm run test` | Passed | 153 client tests and 208 server tests pass; one server test is skipped. |
| `npm run test:release-contract` | Passed | Six release-contract tests pass. |
| `./scripts/verify-quilt-migration.sh rehearse` | Passed | Fresh and upgrade migration, parity, rollback, recovery, and nine retention tests pass. |
| `npm run test:authorization-benchmark` | Passed locally | All 10,000-row local ceilings pass; output records `productionThresholdApproved: false`. |
| `npm run test:e2e:owner-only` | Passed | Six authenticated owner-only browser tests pass. |
| `npm run test:e2e:multi-replica` | Passed | One authenticated multi-replica convergence test passes. |

## Missing Work and Deviations

* Operation replay must be authorization-safe, immutable, actor-bound, and payload-bound across mutation and ownership commands.
* Deletion completion needs due-account enumeration, approved retention input, executable job wiring, and successful completion tests.
* Anonymous policy behavior and WebSocket origin enforcement must match the authenticated-only architecture.
* Client refreshed-token retries must preserve request bodies.
* Recovery infrastructure, multi-replica CI enforcement, production benchmark approval, and missing security scenarios remain incomplete.
* External issue state, staging origins, migration execution, RBAC, retention, telemetry, rollback, and benchmark approvals do not yet support the completion claim.

## Follow-Up Work

### Deferred From Scope

* Delegated mutation and moderator commands remain deferred under their separate backlog scope.
* Production threshold definition and organizational staging, privacy, telemetry, rollback, and retention approvals remain external work.

### Discovered During Review

* Correct replay ordering and bind immutable command fingerprints before enabling protocol-v2 mutation.
* Build and provision the due-account deletion and restricted recovery operations end to end.
* Preserve POST bodies across the forced-refresh retry.
* Remove anonymous aggregate authorization or explicitly revise and approve the architecture.
* Enforce exact WebSocket origins and add polling and WebSocket rejection coverage.
* Add cross-principal replay, immutable delayed replay, mixed-patch authority, ownership lifecycle HTTP and E2E, and failed-renewal browser tests.
* Make authenticated multi-replica E2E a required CI check and add benchmark approval to rollout gates.
* Reconcile GitHub issue scope and staging identity origin values with the release contract.

## Reviewer Notes

The implementation has substantial verified functionality: pinned token verification, exact issuer-subject mapping, lifecycle enforcement, protected HTTP middleware, local test-issuer isolation, client state teardown, normal owner mutation transactions, migration rehearsal, and authenticated single- and multi-replica convergence all execute successfully.

The release summary overstates completion. The replay authorization defect and non-runnable deletion path are release-blocking, and production approvals remain intentionally absent. Keep mutation disabled until Critical and Major findings are corrected and fresh phase, quality, CI, and staging validation passes.
