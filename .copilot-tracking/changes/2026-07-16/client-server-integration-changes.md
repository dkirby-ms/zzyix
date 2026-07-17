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

## Validation

* `cd apps/client && npm run test` completed successfully.

## Notes

* Browser-level App.tsx/socket integration tests remain a follow-on item if a UI harness is introduced later.

## Notes

* App refactor, optimistic ack reconciliation, and socket event wiring are now complete for the current scope.