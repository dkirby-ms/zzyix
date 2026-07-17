<!-- markdownlint-disable-file -->
# Client-Server Integration Changes

## Phase 1 Foundation

* Added `socket.io-client` to `apps/client/package.json` at version `^4.8.2`, matching the server's Socket.IO version.
* Created `apps/client/src/network/session.ts` with `ensureSession()` and `ensureClientId()`.
* Created `apps/client/src/network/useSocketConnection.ts` with typed socket lifecycle management and explicit listener cleanup.
* Added `apps/client/.env` and `apps/client/.env.example` with `VITE_SERVER_URL=http://localhost:3001`.

## Validation

* `cd apps/client && npm install` completed successfully.
* `cd apps/client && npm run lint` completed successfully.
* `cd apps/client && npm run build` completed successfully.
* The relative client import of `../../../server/src/contracts` resolved successfully, so no local type mirror was required in this phase.

## Phase 2 App.tsx Integration

* Replaced client-local tile array state with `SequencedTilesState` and wired `MosaicScene` / pointer updates to the sequenced tiles list.
* Added session bootstrap and socket lifecycle wiring in `apps/client/src/App.tsx` using the new network module.
* Implemented optimistic `place_tile` behavior with ack-based reconciliation that removes the temp tile before swapping or rolling back.
* Added `session_snapshot`, `tile_placed`, and `tile_removed` handlers, including snapshot recovery when the sequenced reconciler reports a gap.
* Moved undo to authoritative `remove_tile` socket calls for settled tiles and disabled clear in the controls panel.
* Exported `isServerTileId` from the controller for undo safety and testability.

## Validation

* `cd apps/client && npm run lint` completed successfully after a small hook-dependency fix.
* `cd apps/client && npm run build` completed successfully.

## Phase 3 Tests

* Added controller-focused unit coverage for sequenced snapshot reset, ordered placement/removal reconciliation, gap detection, UUID identity checks, and optimistic ack reconciliation when a broadcast arrives before the ack.
* Moved the optimistic placement ack reconciliation into a small pure controller helper so the race-safe behavior can be exercised without a browser harness.
* Added explicit optimistic ack-path tests for accepted and rejected outcomes to verify temp-tile swap and rollback behavior.

## Validation

* `cd apps/client && npm run test` completed successfully.
* Latest run after Phase 3 additions: `cd apps/client && npm run test` passed with 14 tests.

## Phase 4 Validation

* Executed full validation chain with `cd apps/client && npm run lint && npm run build && npm run test`.
* Fixed `TS2448` / `TS2454` in `apps/client/src/App.tsx` by correcting snapshot callback dependency handling around socket reference usage.
* Fixed `TS6133` in `apps/client/src/interaction/controller.test.ts` by removing an unused import.
* Re-ran full validation successfully; lint reports a non-blocking `react-hooks/exhaustive-deps` warning in `App.tsx`.

## Validation

* `cd apps/client && npm run lint && npm run build && npm run test` completed successfully after Phase 4 fixes.

## Notes

* Browser-level App.tsx/socket integration tests remain a follow-on item if a UI harness is introduced later.

## Release Summary

This implementation completed all four phases for client-server integration scope in `apps/client`.

* Files created earlier in scope: `apps/client/src/network/session.ts`, `apps/client/src/network/useSocketConnection.ts`, `apps/client/.env`, `apps/client/.env.example`
* Files modified in implementation: `apps/client/package.json`, `apps/client/src/App.tsx`, `apps/client/src/interaction/controller.ts`, `apps/client/src/interaction/controller.test.ts`, `apps/client/src/ui/ControlsPanel.tsx`
* Functional outcomes:
	* Authoritative optimistic placement flow with race-safe ack reconciliation
	* Sequenced broadcast reconciliation and snapshot-based recovery
	* Authoritative undo via `remove_tile` for settled server IDs only
	* Extended controller/unit coverage for acceptance, rejection, deduplication, and race scenarios
* Validation outcomes:
	* `npm run lint` (warning only)
	* `npm run build` passed
	* `npm run test` passed (14 tests)
* Deployment or infrastructure changes: none