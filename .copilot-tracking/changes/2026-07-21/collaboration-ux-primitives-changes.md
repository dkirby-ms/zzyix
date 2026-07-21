<!-- markdownlint-disable-file -->
# Release Changes: Collaboration UX Primitives

**Related Plan**: .copilot-tracking/plans/2026-07-21/collaboration-ux-primitives-plan.instructions.md
**Implementation Date**: 2026-07-21

## Summary

Implement foundational collaboration UX primitives including active presence, remote cursor indicators, remote selection indicators, and reconnect/churn hardening across client and server.

## Changes

### Added

* None.

### Modified

* apps/client/src/App.tsx - Added ephemeral collaborator state, presence/pointer handlers, snapshot client seeding, and active users UI wiring.
* apps/client/src/network/useSocketConnection.ts - Added pointer and presence event subscriptions with typed callbacks and cleanup.
* apps/client/src/render/MosaicScene.tsx - Added remote cursor rendering extension points.
* apps/client/src/App.css - Added styles for collaborator presence and cursor indicators.
* apps/client/src/App.test.tsx - Extended client behavior tests for collaboration presence/cursor flows.
* apps/server/src/contracts.ts - Added additive `selection_update` payload and shared event typing.
* apps/server/src/index.ts - Added `selection_update` socket handler with room fanout excluding sender.
* apps/server/src/index.test.ts - Added unit coverage for selection update payload validation paths.
* apps/server/src/index.integration.test.ts - Added integration coverage for selection update fanout semantics.
* apps/client/src/network/useSocketConnection.ts - Added `selection_update` subscription/callback wiring and cleanup.
* apps/client/src/App.tsx - Added local selection emit dedupe/throttle and remote selection state reconciliation.
* apps/client/src/render/MosaicScene.tsx - Added remote selection indicator rendering.
* apps/client/src/render/materials.ts - Added visual material support for collaborator selection cues.
* apps/client/src/ui/palettes.ts - Added deterministic collaborator color mapping for selection cues.
* apps/server/src/index.ts - Added multi-socket membership accounting and last-socket-only `client_left` fanout semantics.
* apps/server/src/index.integration.test.ts - Added same-client multi-socket disconnect coverage and collaboration fanout edge-case assertions.
* apps/client/src/App.tsx - Added stale collaborator signal eviction, reconnect merge semantics, and bounded pointer/selection emission throttling.
* apps/client/src/network/useSocketConnection.test.ts - Added collaboration event subscription and cleanup lifecycle tests.
* apps/client/src/App.test.tsx - Extended collaboration behavior coverage and replaced timing-fragile assertions with deterministic state checks.

### Removed

* None.

## Additional or Deviating Changes

* Client build reported a non-blocking Vite bundle-size warning.
	* Build succeeded; warning deferred unless future scope requires chunk optimization.
* Phase 2 targeted validation completed for both server and client scopes.
	* `npm run lint:server`, `npm run test:server`, `npm run lint:client`, and `npm run test:client` passed.
* Phase 3 validation required one local test refinement due to timer-based flakiness.
	* Updated assertions to deterministic helper-level checks; `npm run test:server` and `npm run test:client` now pass.
* Phase 4 full validation surfaced one server build type error in selection payload validation.
	* Fixed `isSelectionUpdatePayload` guard in `apps/server/src/index.ts`; `npm run build:server` then passed.
* No blocking issues remain for this implementation scope.

## Release Summary

Completed 4 implementation phases for collaboration UX primitives across client and server.

Files affected (added/modified/removed): 1 added, 10 modified, 0 removed.

Added:
* apps/client/src/network/useSocketConnection.test.ts - New collaboration socket subscription lifecycle coverage.

Modified:
* apps/client/src/App.tsx - Ephemeral collaborator state, snapshot merge, join/leave/pointer/selection handling, stale-state eviction, throttled emits.
* apps/client/src/App.css - Presence and cursor indicator styling.
* apps/client/src/App.test.tsx - Presence/selection collaboration tests and deterministic throttling-related assertions.
* apps/client/src/network/useSocketConnection.ts - Presence, pointer, and selection socket event wiring.
* apps/client/src/render/MosaicScene.tsx - Remote cursor and selection indicator rendering.
* apps/client/src/render/materials.ts - Remote selection cue material support.
* apps/client/src/ui/palettes.ts - Deterministic collaborator palette mapping.
* apps/server/src/contracts.ts - Additive `selection_update` contracts and payload typing.
* apps/server/src/index.ts - Selection fanout handler, multi-socket leave correctness, payload guard hardening.
* apps/server/src/index.test.ts - Selection payload validation tests.
* apps/server/src/index.integration.test.ts - Selection fanout and same-client multi-socket disconnect tests.

Validation status:
* Passed: `npm run lint:client`, `npm run lint:server`, `npm run test:client`, `npm run test:server`, `npm run build:client`, `npm run build:server`.
* Non-blocking warning: client chunk-size warning from Vite build.

Deployment notes:
* No infrastructure or schema migrations required.
* Changes are additive at event contract level and preserve existing realtime pathways.
