<!-- markdownlint-disable-file -->
# Task Review: Infinite-Canvas Authentication and Authorization

## Review Metadata

* Review date: 2026-07-29
* Related plan: `.copilot-tracking/plans/2026-07-28/infinite-canvas-authentication-authorization-plan.instructions.md`
* Changes log: `.copilot-tracking/changes/2026-07-28/infinite-canvas-authentication-authorization-changes.md`
* Research: `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md`
* Prior review: `.copilot-tracking/reviews/2026-07-28/infinite-canvas-authentication-authorization-plan-review.md`
* Related foundation review: `.copilot-tracking/reviews/2026-07-27/infinite-quilt-canvas-plan-review.md`
* Review scope: Current twelve-phase implementation and inherited infinite-quilt release dependencies
* Branch: `infinite-canvas`

## Review Status

Overall status: Needs Rework

| Severity | Count |
|----------|------:|
| Critical |     4 |
| Major    |     3 |
| Minor    |     3 |

Counts are deduplicated across phase and quality validators. External release controls and
implementation defects are counted separately when they require different owners and remedies.

## Completion Assessment

The implementation is not complete for the user-visible authenticated infinite-canvas workflow.
Authentication, protected reads, ownership command mechanics, owner-only mutation transactions,
and review remediation are substantially implemented. A real user who creates a canvas cannot
obtain ownership or place a tile through production-shaped contracts and UI.

This is not delegated or moderator behavior that was intentionally deferred. Research selected
self-service patch claiming for initial ownership, and Phase 6 explicitly depends on the Phase 5
production ownership path. The server implements a claim transaction and route, but new sessions
are unclaimed and claim-disabled, `/me` advertises claiming as unavailable, normal contracts do
not expose a claim target, and the client has no claim workflow. Existing E2E tests seed owners
through test-only setup APIs, so they did not exercise this product path.

Protocol-v2 production mutation remains intentionally disabled pending rollout approvals. A
separate defect makes its post-approval production enablement path unreachable because runtime
enablement also requires test mode.

## RPI Validation

| Phase | Status | Evidence |
|-------|--------|----------|
| 1 through 8 | Prior validation retained | `.copilot-tracking/reviews/rpi/2026-07-28/` |
| 9. Replay and client retry | Passed | Actor and payload-bound replay, immutable acknowledgements, and body-preserving retry pass focused validation |
| 10. Authenticated boundaries | Passed | Authenticated-only policy, exact Socket.IO origins, and exact HTTPS deployment-origin controls pass; one minor test-design gap remains |
| 11. Operations and rollout | Failed | Repository provisioning and rollout controls exist, but the deletion CLI does not enforce the separate retention approval |
| 12. Coverage and final validation | Partial | Local matrix passes in this review; external staging, control, issue-scope, and approval evidence remains blocked |

Detailed remediation validations:

* `.copilot-tracking/reviews/rpi/2026-07-29/infinite-canvas-authentication-authorization-plan-009-validation.md`
* `.copilot-tracking/reviews/rpi/2026-07-29/infinite-canvas-authentication-authorization-plan-010-validation.md`
* `.copilot-tracking/reviews/rpi/2026-07-29/infinite-canvas-authentication-authorization-plan-011-validation.md`
* `.copilot-tracking/reviews/rpi/2026-07-29/infinite-canvas-authentication-authorization-plan-012-validation.md`

## Critical Findings

### Creator ownership and placement workflow is absent

New sessions create an unclaimed patch with `claimEnabled: false`. Session creation does not
assign the creator as owner, `/me` returns `claimPatch: false`, and the client has no claim
workflow. This contradicts the approved self-service claim model and makes the authenticated
create-canvas workflow read-only.

Evidence: `apps/server/src/db/repository.ts`, `apps/server/src/index.ts`,
`apps/server/src/auth/httpAuth.ts`, `apps/client/src/App.tsx`, and
`apps/client/src/ui/LobbyScreen.tsx`.

### Legacy mutation authority becomes stale on established sockets

Legacy authorization is calculated during socket initialization and cached. Placement and
removal rely on that Boolean, while legacy persistence does not transactionally recheck the
current principal and ownership. Transfer or abandonment can therefore leave an established
socket with stale write authority.

Evidence: `apps/server/src/index.ts` and `apps/server/src/db/repository.ts`.

### Deletion CLI uses the wrong approval gate

The runnable deletion CLI passes `AUTH_DELETION_COMPLETION_POLICY_APPROVED` as
`retentionApproved`. Documentation and startup gates define
`AUTH_RETENTION_POLICY_APPROVED` and deletion-completion approval as independent controls.
Deletion can therefore complete without the required retention approval.

Evidence: `apps/server/src/jobs/principalDeletionCli.ts`,
`apps/server/src/startup/rolloutGates.ts`, and `apps/server/README.md`.

### Production release controls remain unproved

The plan explicitly leaves Phase 12 blocked by staging configuration, deployed jobs and RBAC,
repository controls, issue ownership, and approvals. The available staging CORS value is not an
absolute HTTPS origin. No dated evidence proves the deployed migration and recovery jobs,
effective job-scoped RBAC, environment reviewers, branch protection, or operational approvals.

Production mutation must remain disabled.

## Major Findings

### Protocol-v2 production enablement is unreachable

Runtime protocol-v2 mutation requires `NODE_ENV=test`, `E2E_TEST_MODE=true`, and the feature
flag. Production startup separately models approval-gated enablement, but no production process
can satisfy the test-mode condition after approvals pass.

Evidence: `apps/server/src/index.ts`, `apps/server/src/startup/rolloutGates.ts`, and
`.github/workflows/cd.yml`.

### Ownership E2E bypasses the production workflow

The owner-only and multi-replica suites seed ownership through test-only setup APIs and operate
with internal patch and principal identifiers. They prove command and convergence mechanics but
not sign-in, create, obtain ownership, and place through normal contracts and UI.

Evidence: `e2e/authentication.spec.ts` and `e2e/quilt-reconnect.spec.ts`.

### Issue-scope evidence is internally inconsistent

The changes log says issues 14 and 98 both retain broader scope and were narrowed. The planning
log retains reconciliation as follow-up work. Live issue evidence is required to establish the
current acceptance contract.

## Minor Findings

* `/me` capabilities are static and do not reflect implemented commands, resource state, or rollout configuration.
* Deployment-origin release tests inspect workflow source patterns instead of behaviorally executing invalid-origin cases.
* Four moderate Drizzle toolchain advisories and the existing client bundle-size warning remain.

## Validation Commands

| Command | Status | Result |
|---------|--------|--------|
| `npm run audit` | Passed configured gate | Four moderate advisories; no high-severity failure |
| `npm run lint` | Passed | Client and server Oxlint checks pass |
| `npm run build` | Passed with warning | Client and server builds pass; Vite reports large chunks |
| `npm run test:client` | Passed | 156 tests pass |
| `npm run test:server` | Passed on clean rerun | 219 tests pass and one is skipped |
| JWT verifier focused rerun | Passed | 10 tests pass after one transient `nbf` clock-boundary failure in the first full run |
| `npm run test:release-contract` | Passed | Nine tests pass |
| `npm run test:authorization-benchmark` | Passed locally | All 10,000-record regression ceilings pass; production approval remains false |
| `npm run test:e2e:owner-only` | Passed | Ten authenticated tests pass |
| `npm run test:e2e:multi-replica` | Passed | One authenticated convergence test passes |
| `./scripts/verify-quilt-migration.sh rehearse` | Passed | Migration, backfill, parity, rollback, recovery, and nine database tests pass |
| Diagnostics and `git diff --check` | Passed | No diagnostics or whitespace errors |

The browser suites release all validation-owned ports. The user's existing listener on port 3001
was not changed.

## Missing Work and Deviations

* Define and implement the initial ownership experience from normal session creation.
* Recheck legacy mutation authority transactionally or retire protected legacy mutation.
* Correct the deletion CLI to enforce independent retention and completion approvals.
* Separate test-issuer isolation from production protocol-v2 feature enablement.
* Add a production-shaped create-session-to-owner-placement browser test.
* Replace static `/me` ownership capabilities with truthful global and resource-scoped contracts.
* Reconcile live issue scope and collect external staging, deployment, RBAC, repository-control,
  and approval evidence.

## Follow-Up Work

### Deferred From Scope

* Delegated member mutation
* Moderator commands
* Multi-provider identity linking
* Protocol-v1 and legacy-storage retirement after approved exit gates

### Discovered During Review

* Creator ownership or claim-enabled creation contract and corresponding client workflow
* Mutation authorization changes on an established socket after claim, transfer, or abandonment
* Deletion CLI approval-combination tests
* Production-shaped ownership and placement E2E without test-seeded internal identifiers
* Behavioral deployment-origin parser tests

## Reviewer Notes

The prior review correctly rejected the original completion claim, and Phases 9 and 10 close most
of its repository defects. The amended plan and changes log then overstated local completion by
equating ownership command implementation and test-seeded owner mutation with a complete product
workflow. Green suites did not expose the gap because no test starts from a normal authenticated
session creation and obtains ownership through production contracts.

The direct answer is that tile placement on a newly created canvas is unfinished planned work,
not a bad local authentication setup. The high-level plan required the ownership path, but the
implementation checklist did not make the client claim experience or creator-assignment contract
an explicit acceptance step, and the review coverage inherited that omission until this live
workflow test exposed it.