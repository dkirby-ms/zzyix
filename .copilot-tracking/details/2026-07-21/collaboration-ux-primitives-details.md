<!-- markdownlint-disable-file -->
# Implementation Details: Collaboration UX Primitives

## Context Reference

Sources: .copilot-tracking/research/2026-07-21/collaboration-ux-primitives-research.md, .copilot-tracking/research/subagents/2026-07-21/collaboration-ux-primitives-implementation-research.md, conversation requirements for issue #15.

## Implementation Phase 1: Client collaboration state and subscriptions

<!-- parallelizable: false -->

### Step 1.1: Add collaborator state model and reducers in App layer

Create a dedicated in-memory collaborator state keyed by `clientId` that tracks presence, pointer position, optional selection tile, and `lastSeenAt`. The state must explicitly separate canonical mosaic data from ephemeral collaboration signals.

Files:
* apps/client/src/App.tsx - Add `RemoteCollaborator` and `RemoteCollaboratorMap` types, state initialization, and reducer helpers.

Discrepancy references:
* Addresses DR-01 in Planning Log: no current client-side usage of snapshot `clients` and no local collaborator cache.

Success criteria:
* App state contains collaborator entries keyed by `clientId`.
* Collaboration state updates can occur without mutating tile canonical state.

Context references:
* .copilot-tracking/research/2026-07-21/collaboration-ux-primitives-research.md (Lines 29-37) - Existing client-side gap summary.
* apps/client/src/App.tsx (Lines 146-151) - Snapshot currently ignores `clients` payload.

Dependencies:
* None.

### Step 1.2: Subscribe to presence and pointer events in socket hook

Extend socket event registration in `useSocketConnection` to include `pointer_update`, `client_joined`, and `client_left`, and propagate strongly-typed callbacks to App state handlers. Ensure cleanup removes all collaboration listeners on hook disposal.

Files:
* apps/client/src/network/useSocketConnection.ts - Add event subscriptions and callback props.
* apps/client/src/network/session.ts - Optional identity helper reuse if callback signatures need stable `clientId` normalization.

Discrepancy references:
* Addresses DR-02 in Planning Log: collaboration events exist in contract/server runtime but are not consumed by client.

Success criteria:
* Hook subscribes and unsubscribes to pointer and presence events.
* App receives collaboration event callbacks through the hook interface.

Context references:
* apps/client/src/network/useSocketConnection.ts (Lines 51-55) - Current subscription baseline.
* apps/server/src/contracts.ts (Lines 336-340) - Existing presence and pointer server events.

Dependencies:
* Step 1.1 completion for callback integration.

### Step 1.3: Seed and reconcile collaborator presence from snapshot and deltas

During session snapshot handling, initialize collaborator roster from `session_snapshot.clients`. Then apply `client_joined` and `client_left` deltas with idempotent merge semantics so reconnect snapshots remain authoritative for roster baseline.

Files:
* apps/client/src/App.tsx - Snapshot handler and join/leave handlers.

Discrepancy references:
* Addresses DR-01 and DD-01 in Planning Log.

Success criteria:
* Active user list appears immediately after snapshot.
* Join/leave events mutate roster without duplicate or missing entries.

Context references:
* apps/server/src/contracts.ts (Line 274) - Snapshot includes `clients`.
* apps/server/src/index.ts (Lines 762-764, 995) - Join/leave emission behavior.

Dependencies:
* Step 1.1 completion.
* Step 1.2 completion.

### Step 1.4: Render active users and remote cursors

Render presence list in existing status area and render remote cursor markers using cursor coordinates from collaborator state. Do not render local client cursor in remote layer.

Files:
* apps/client/src/App.tsx - Presence panel rendering and remote cursor projection state.
* apps/client/src/render/MosaicScene.tsx - Visual markers for remote cursor indicators.
* apps/client/src/App.css - Styles for collaborator list and cursor chips.

Success criteria:
* Active users are visible in the UI.
* Remote cursor indicators move with incoming pointer updates.
* Local pointer is not duplicated as remote marker.

Context references:
* apps/client/src/App.tsx (Line 409) - Existing status area anchor.
* apps/client/src/render/MosaicScene.tsx (Lines 129, 161) - Pointer interaction plane and hooks.

Dependencies:
* Step 1.3 completion.

### Step 1.5: Validate phase changes

Run client-scoped validation after state/subscription/rendering updates.

Validation commands:
* npm run lint:client - lint for client collaboration UI and hook changes.
* npm run test:client - client unit/integration regression coverage.
* npm run build:client - type/build validation for client package.

## Implementation Phase 2: Selection indicator event and rendering

<!-- parallelizable: false -->

### Step 2.1: Add additive selection_update event contract

Add `SelectionUpdatePayload` plus corresponding `selection_update` entries to both client-to-server and server-to-client event interfaces. Keep event additive and backward-compatible with existing pointer and presence primitives.

Files:
* apps/server/src/contracts.ts - Add payload and event types.

Discrepancy references:
* Addresses DR-03 in Planning Log: selection intent cannot be inferred reliably from existing events.

Success criteria:
* Contracts compile with new `selection_update` event types.
* Existing event payload types remain backward-compatible.

Context references:
* .copilot-tracking/research/2026-07-21/collaboration-ux-primitives-research.md (Lines 128-138) - additive contract sketch.

Dependencies:
* Phase 1 completion.

### Step 2.2: Implement server fanout for selection_update

Handle incoming `selection_update` on server, validate membership via existing access checks, and fan out to peers in same canvas room excluding sender socket.

Files:
* apps/server/src/index.ts - Add selection update handler alongside pointer_move handling.

Discrepancy references:
* Addresses DR-03 in Planning Log.

Success criteria:
* Sender receives no echoed `selection_update` from own socket.
* Peers in room receive broadcast payload.

Context references:
* apps/server/src/index.ts (Lines 943-954) - pointer fanout baseline for implementation parity.

Dependencies:
* Step 2.1 completion.

### Step 2.3: Emit and consume selection updates in client

Emit `selection_update` when local selected tile changes materially and consume remote `selection_update` into collaborator state. Apply coarse throttling or dedupe to avoid noisy repeat events.

Files:
* apps/client/src/App.tsx - emit and reducer updates for selection state.
* apps/client/src/network/useSocketConnection.ts - subscribe and callback wiring.

Success criteria:
* Remote selection state updates across clients when selected tile changes.
* Redundant repeated emits are reduced via dedupe/throttle.

Context references:
* apps/client/src/App.tsx (Lines 286, 301) - local pointer lifecycle anchors for collaboration emissions.

Dependencies:
* Step 2.2 completion.

### Step 2.4: Render remote selection indicator cues

Render non-blocking selection cues (outline or halo) on selected remote tiles and include collaborator identity label/color mapping where available.

Files:
* apps/client/src/render/MosaicScene.tsx - draw selection outlines/halos.
* apps/client/src/render/materials.ts - optional material style for remote selection cues.
* apps/client/src/ui/palettes.ts - collaborator color allocation utility if required.

Success criteria:
* Remote selected tiles are visually distinct from local selection.
* Cue rendering remains legible with multiple collaborators.

Context references:
* .copilot-tracking/research/2026-07-21/collaboration-ux-primitives-research.md (Lines 166-177) - selected rendering approach.

Dependencies:
* Step 2.3 completion.

### Step 2.5: Validate phase changes

Run incremental validation for contracts/server/client integration updates.

Validation commands:
* npm run lint:server - lint server contract and event handler changes.
* npm run test:server - server integration/event fanout tests.
* npm run lint:client - lint client selection UI changes.
* npm run test:client - client regression and selection state tests.

## Implementation Phase 3: Churn hardening and contention behavior

<!-- parallelizable: false -->

### Step 3.1: Implement server-side multi-socket leave correctness

Track active socket instances per `canvasId + clientId` so `client_left` emits only when the last socket for that collaborator disconnects. Keep participant persistence updates aligned to last-socket semantics.

Files:
* apps/server/src/index.ts - Add per-canvas collaborator socket membership accounting and conditional disconnect handling.
* apps/server/src/index.integration.test.ts - Add same-client multi-socket disconnect assertions for leave emission.

Discrepancy references:
* Addresses DR-04 in Planning Log: false leave behavior with shared `clientId` across tabs.

Success criteria:
* Disconnecting one of multiple sockets for the same `clientId` does not emit `client_left`.
* Disconnecting the last socket for a `clientId` emits `client_left` exactly once and updates persistence.

Context references:
* .copilot-tracking/research/subagents/2026-07-21/collaboration-ux-primitives-implementation-research.md (Lines 95-113) - multi-tab identity and false-leave risk.
* apps/server/src/index.ts (Lines 994-995) - current disconnect fanout location.

Dependencies:
* Phase 2 completion.

### Step 3.2: Add stale collaborator eviction and reconnect merge logic

Evict stale pointer/selection state entries with TTL using `lastSeenAt` while preserving active roster entries. On snapshot refresh, merge roster baseline before applying transient updates to prevent ghost cursors.

Files:
* apps/client/src/App.tsx - TTL scheduler and merge semantics.

Discrepancy references:
* Addresses DR-04 in Planning Log: reconnect churn can leave ghost collaborator state.

Success criteria:
* Ghost cursors clear after TTL expiration.
* Reconnect snapshot does not permanently discard valid active collaborators.

Context references:
* .copilot-tracking/research/subagents/2026-07-21/collaboration-ux-primitives-implementation-research.md (Lines 95-113) - multi-tab identity and false-leave risk.

Dependencies:
* Step 3.1 completion.

### Step 3.3: Add pointer and selection emit throttling for moderate contention

Throttle `pointer_move` and `selection_update` emission rates to target 20 to 30 Hz effective fanout while preserving smooth UI motion. Use monotonic timestamp guard and trailing update delivery.

Files:
* apps/client/src/App.tsx - outbound throttling wrapper for emit functions.

Success criteria:
* Emit rate remains bounded under rapid pointer movement.
* Visual movement remains smooth in moderate contention scenario.

Context references:
* .copilot-tracking/research/2026-07-21/collaboration-ux-primitives-research.md (Lines 34-37) - contention requirement.

Dependencies:
* Step 3.2 completion.

### Step 3.4: Extend tests for collaboration flows and edge cases

Extend server and client tests for presence, pointer, selection, and reconnect churn with same-client multi-socket behavior coverage.

Files:
* apps/server/src/index.integration.test.ts - add pointer_update, client_joined/client_left, and same-client multi-socket tests.
* apps/client/src/App.test.tsx - add presence list and remote state rendering tests.
* apps/client/src/network/useSocketConnection.test.ts - add hook subscription coverage for collaboration events.

Discrepancy references:
* Addresses DR-04 and DD-01 in Planning Log.

Success criteria:
* New tests fail before implementation and pass after implementation.
* Existing tests remain green.

Context references:
* .copilot-tracking/research/subagents/2026-07-21/collaboration-ux-primitives-implementation-research.md (Lines 53-89) - recommended test extension points.

Dependencies:
* Step 3.1 completion.
* Step 3.2 completion.
* Step 3.3 completion.

### Step 3.5: Validate phase changes

Run phase-level validation for churn hardening and tests.

Validation commands:
* npm run test:server - verify server realtime edge case coverage.
* npm run test:client - verify client collaboration state and rendering coverage.

## Implementation Phase 4: Final validation

<!-- parallelizable: false -->

### Step 4.1: Run full project validation

Execute all root-scoped validation commands:
* npm run lint:client
* npm run lint:server
* npm run test:client
* npm run test:server
* npm run build:client
* npm run build:server

### Step 4.2: Fix minor validation issues

Apply straightforward type, lint, and test fixes discovered in Step 4.1 that are directly related to the collaboration primitives implementation.

### Step 4.3: Report blocking issues

If failures require larger architecture changes beyond this plan scope, document blockers, affected files, and recommended follow-on planning rather than performing large refactors inline.

## Dependencies

* TypeScript and shared workspace scripts.
* Socket.IO event typing and runtime hooks.
* Vitest and existing integration test harness.

## Success Criteria

* Active user presence is visible and updates on join, leave, and reconnect.
* Remote cursor and selection indicators render and remain usable under moderate contention.
* Collaboration indicators self-heal on reconnect and stale state eviction.
* Server and client validation suites pass with added coverage for new collaboration events.

## Implementation Phase 5: Review-driven rework and hardening

<!-- parallelizable: false -->

### Step 5.1: Make snapshot presence reconciliation authoritative and clear stale present ghosts

Refine collaborator reconciliation in the client so `session_snapshot.clients` is treated as authoritative for presence membership. Any collaborator omitted from a fresh snapshot must transition to `present: false`, and stale signal cleanup should remove non-present collaborators after TTL.

Files:
* apps/client/src/App.tsx - Update `mergeCollaboratorsFromSnapshot` and stale eviction behavior.
* apps/client/src/App.test.tsx - Add/adjust tests proving omitted collaborators are not preserved as present.

Success criteria:
* A collaborator omitted from a new snapshot is no longer reported as active.
* Pointer and selection signals still preserve short-lived continuity during reconnect churn.

### Step 5.2: Optimize remote selection rendering lookup to O(1) per collaborator

Replace repeated linear `tiles.find(...)` lookup per remote selection during render with a precomputed tile index map keyed by `tileId`.

Files:
* apps/client/src/render/MosaicScene.tsx - Add memoized tile lookup map and consume it in selection rendering loop.

Success criteria:
* Remote selection rendering no longer performs repeated full-array scans per collaborator.

### Step 5.3: Harden disconnect leave-gating for multi-replica socket topologies

Add explicit deployment guardrails for process-local `sessionClientSockets` membership accounting, and verify disconnect semantics via integration-level assertions on the real socket handler path.

Files:
* apps/server/src/index.ts - Add clear warning/logging around process-local leave-gating assumptions.
* apps/server/src/index.integration.test.ts - Add or adjust integration tests targeting disconnect fanout gate path.
* docs/decisions/2026-07-15-deployment-architecture-v01.md - Document process-local constraint and follow-on shared-state option.

Success criteria:
* Server behavior and deployment assumptions are explicit and test-covered.
* Last-socket-only `client_left` behavior is validated on disconnect-path coverage.

### Step 5.4: Add deterministic tests for throttling semantics and selection fanout guard paths

Create deterministic client tests (fake timers) for pointer and selection throttling cadence and server integration tests that exercise `selection_update` handler guard checks (`canvasId` and `clientId` mismatch rejection).

Files:
* apps/client/src/App.test.tsx - Add fake-timer assertions for bounded emit frequency and trailing flush behavior.
* apps/server/src/index.integration.test.ts - Add selection guard-path tests.

Success criteria:
* Throttling semantics are explicitly asserted and deterministic.
* Selection fanout guard behavior is tested through production handler logic.

### Step 5.5: Re-run full validation and resolve regressions within scope

Run root validation scripts and fix any regressions introduced by Phase 5.

Validation commands:
* npm run lint:client
* npm run lint:server
* npm run test:client
* npm run test:server
* npm run build:client
* npm run build:server
