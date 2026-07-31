<!-- markdownlint-disable-file -->
# Implementation Quality: Infinite-Canvas Authentication and Authorization

## Metadata

* Review date: 2026-07-29
* Scope: Full quality against current post-remediation code
* Plan: `.copilot-tracking/plans/2026-07-28/infinite-canvas-authentication-authorization-plan.instructions.md`
* Changes: `.copilot-tracking/changes/2026-07-28/infinite-canvas-authentication-authorization-changes.md`
* Research: `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md`
* Related ADR: `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md`

## Status

Failed: 2 Critical, 2 Major, 1 Minor.

An authenticated user who creates a session cannot obtain ownership or place a tile in a
production-shaped local development session. This is not delegated behavior that was
intentionally deferred, and it is not explained solely by production rollout being disabled.

## Critical Findings

### IV-001 Legacy mutation authority becomes stale during a socket connection

The server calculates legacy mutation authorization once during connection initialization.
The placement and removal handlers rely on that cached value, while the legacy persistence
boundary receives only ephemeral client attribution and does not recheck the authenticated
principal or current ownership inside the transaction.

An owner who abandons or transfers a patch can therefore retain mutation authority through an
established socket. Conversely, a successful claimant remains denied until reconnecting. This
violates the accepted requirement to recheck identity and authority inside every mutation
transaction.

Evidence:

* `apps/server/src/index.ts`
* `apps/server/src/db/repository.ts`
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md`

Recommendation: Pass authenticated principal context into legacy persistence or retire legacy
mutation for protected patches. Lock affected patches and recheck current principal status and
ownership in the transaction. Add transfer and abandonment tests against an established socket.

### IV-002 Self-service ownership to placement is absent end to end

New sessions create an unclaimed protocol-v1 patch with claiming disabled. Session creation does
not assign ownership to the creator. `/me` advertises claim and transfer capabilities as false,
and the client provides no ownership workflow. The normal product API also does not expose the
patch identifier required by the claim route.

The user therefore cannot claim the created patch, become its owner, or receive mutation
permission. This conflicts with the confirmed product decision that eligible authenticated users
atomically claim unowned patches and with Phase 6's dependency on the Phase 5 production
ownership path.

Evidence:

* `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md`
* `.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md`
* `apps/server/src/db/repository.ts`
* `apps/server/src/index.ts`
* `apps/server/src/auth/httpAuth.ts`
* `apps/client/src/App.tsx`
* `apps/client/src/ui/LobbyScreen.tsx`

Recommendation: Decide the creation contract explicitly. Either assign the creator atomically as
owner or create a claim-enabled patch and expose its claim target through a protected contract.
Add the client ownership state and a production-shaped create-session-to-placement E2E test.

## Major Findings

### IV-003 Protocol-v2 mutation has no production enablement path

The runtime requires `NODE_ENV=test`, `E2E_TEST_MODE=true`, and the mutation feature flag. The
production startup gate nevertheless validates approvals when the feature flag is true. This
makes the modeled post-approval production transition unreachable.

Current production rejection is correctly fail-closed. The defect is that completing every
approval still cannot enable the feature.

Evidence:

* `apps/server/src/index.ts`
* `apps/server/src/startup/rolloutGates.ts`
* `.github/workflows/cd.yml`

Recommendation: Separate local test-issuer isolation from protocol-v2 feature enablement.
Production enablement must remain conditional on all startup approvals.

### IV-004 Ownership E2E bypasses the production product workflow

The owner-only browser tests seed ownership through test-only setup APIs, consume internal patch
and principal identifiers, and invoke ownership routes directly. They prove command mechanics but
do not prove that a real user can discover, claim, and mutate a patch through normal contracts
and UI.

Evidence:

* `e2e/authentication.spec.ts`
* `e2e/quilt-reconnect.spec.ts`

Recommendation: Add one browser scenario using only production contracts and UI: sign in, create
a session, obtain ownership, connect or reconnect as required, receive mutation permission, and
place a tile.

## Minor Findings

### IV-005 `/me` capabilities are static

The response returns fixed capability values rather than values derived from current lifecycle,
implemented commands, and rollout configuration. The client therefore cannot discover ownership
commands or react meaningfully after an ownership transition.

Evidence: `apps/server/src/auth/httpAuth.ts`.

Recommendation: Derive global capabilities from current principal and rollout state. Publish
resource-scoped ownership capability through the corresponding protected resource contract.

## Classification

### Planned Deferred Behavior

* Delegated member mutation
* Moderator commands
* Multi-provider linking

### Intentionally Rollout Disabled

* Production protocol-v2 placement and removal until required approvals pass

### Missing Implemented Workflow

* Authenticated session creation to claimable ownership and owner mutation
* A reachable production protocol-v2 enablement transition after approvals

## Prior Review Remediation

Current code and focused validation support remediation of the prior replay binding, immutable
acknowledgement, request-body retry, anonymous aggregate, exact-origin, due-deletion,
recovery-infrastructure, multi-replica CI, benchmark gate, mixed-authority, and lifecycle-route
findings. Phase 11 separately identified an approval-wiring defect in the deletion CLI.

External staging configuration, deployed jobs and RBAC, repository controls, issue ownership,
and organizational approvals remain externally blocked.
