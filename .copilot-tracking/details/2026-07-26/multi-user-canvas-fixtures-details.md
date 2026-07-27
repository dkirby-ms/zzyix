<!-- markdownlint-disable-file -->
# Implementation Details: Deterministic Multi-User Canvas Fixtures

## Context Reference

Sources: `.copilot-tracking/research/2026-07-26/multi-user-canvas-fixtures-research.md`, issue #91, and current workspace code.

## Implementation Phase 1: Add a Test-Only Client Bridge

### Step 1.1: Expose authoritative observable state

Add a small client module for e2e observability and control. It should model a stable serializable state snapshot that includes the current client identity, session, connection status, mode, active tile settings, collaborator identities or count, and the authoritative tile list with complete observable attributes.

Files:
* `apps/client/src/test/canvasTestApi.ts` - New bridge types and registration helpers
* `apps/client/src/App.tsx` - Register and update the bridge from existing state

Success criteria:
* State snapshots are serializable and deterministic.
* The bridge does not exist unless the dedicated e2e env flag is enabled.

### Step 1.2: Reuse existing placement behavior

Expose thin bridge commands that:
* Update active tile shape, material, color, rotation, or mirrored state.
* Move the pointer in world coordinates through the existing pointer-update logic.
* Place a tile through the real `attemptPlace()` flow.

Avoid duplicating placement rules or directly mutating tile state from the bridge.

Success criteria:
* Bridge controls do not bypass optimistic placement, socket acks, or tile reconciliation.
* Existing UI behavior remains unchanged when bridge controls are unused.

### Step 1.3: Enable the bridge only for Playwright runs

Propagate a Vite env flag through `playwright.config.ts`, then gate registration in the client code with that flag.

Success criteria:
* Playwright runs can access the bridge.
* Regular dev and production runs do not expose it.

## Implementation Phase 2: Build Reusable Multi-User Playwright Support

### Step 2.1: Extend server-reset helpers

Update e2e support to request isolated server state plus a seeded session ID from `/test/reset`.

Files:
* `e2e/support/testState.ts`

Success criteria:
* Test helpers can request a fresh shared canvas and receive the session ID.

### Step 2.2: Add multi-user fixtures

Create Playwright fixtures or helper factories that:
* Create N independent browser contexts.
* Open one page per user.
* Join each user to the seeded session deterministically.
* Close all contexts during teardown.
* Reset server state after teardown.

Files:
* `e2e/support/multiUser.ts` or equivalent fixture module

Success criteria:
* Context creation and teardown are centralized and reusable.
* Joining the shared canvas does not rely on arbitrary waits.

### Step 2.3: Add state-based helpers

Implement helpers that use Playwright `page.evaluate()` plus polling expectations to:
* Read the bridge state.
* Wait for connection status.
* Wait for tile count or a tile predicate.
* Assert tile identity and observable attributes.

Success criteria:
* Remote propagation checks rely on bridge state or visible connection state.
* No fixed `waitForTimeout` calls are required.

## Implementation Phase 3: Prove the Fixture Primitives

### Step 3.1: Add a focused e2e test

Create one spec that proves:
* At least two users connect to one isolated canvas.
* Their client IDs differ.
* User A places a tile with explicit attributes.
* User B observes that tile with matching authoritative attributes.

Files:
* `e2e/multi-user-fixtures.spec.ts`

Success criteria:
* The test exercises only fixture primitives, not the final broader collaboration scenarios.

## Implementation Phase 4: Documentation and Tracking

### Step 4.1: Document helper usage

Update e2e-facing docs if needed so future scenario tests know how to compose on the new fixture layer.

### Step 4.2: Record final validation and review artifacts

Update the plan, changes log, and review log after implementation and validation complete.