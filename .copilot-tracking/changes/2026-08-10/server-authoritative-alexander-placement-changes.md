<!-- markdownlint-disable-file -->

# Changes: Server-Authoritative Alexander Placement

## Related Plan

`.copilot-tracking/plans/2026-08-10/server-authoritative-alexander-placement-plan.instructions.md`

## Summary

Moved Alexander placement from browser-orchestrated per-tile mutation traffic to a single server-authoritative patch command. The browser now selects the owned patch and emits one `quilt_place_alexander_patch` event. The server loads and verifies the approved manifest, derives deterministic tile operations, persists each tile through existing authoritative placement validation, and broadcasts normal quilt patch events.

## Added

* `apps/server/src/operations/alexanderPatchImport.ts` implements server-side manifest loading, hash verification, patch binding, deterministic per-tile operation IDs, and sequential placement through `persistQuiltTilePlacement`.
* `e2e/fixtures/alexander-patch-manifest.json` provides a small approved manifest fixture for multi-replica E2E runs.

## Modified

* `apps/server/src/contracts.ts` adds `QuiltPlaceAlexanderPatchRequest`, `QuiltPlaceAlexanderPatchAck`, and the typed `quilt_place_alexander_patch` client event.
* `apps/server/src/index.ts` validates and handles the new socket command, maps service failures to mutation reject codes, and broadcasts accepted tile events.
* `apps/server/src/db/repository.postgres.integration.test.ts` covers one-command Alexander import, deterministic replay, unauthorized rejection, and delivery snapshot state.
* `apps/server/src/index.integration.test.ts` covers validation for the new request shape.
* `apps/client/src/App.tsx` removes the Alexander browser manifest fetch/preflight/queue path and emits one server-side command after an owned-patch click.
* `apps/client/src/test/canvasTestApi.ts` removes the obsolete browser mosaic import test hook.
* `playwright.multi-replica.config.ts` points E2E server replicas at the Alexander fixture manifest.
* `e2e/alexander-mosaic-import.spec.ts` now expects one `quilt_place_alexander_patch` mutation and server-side placement results.

## Validation

* `npm run build:server` passed.
* `npm run test --workspace=apps/server -- src/db/repository.postgres.integration.test.ts src/index.integration.test.ts` passed: 46 tests.
* `npm run build:client` passed with existing Vite warnings about `__dirname` and chunk size.
* `npm run test:e2e:multi-replica` passed: 2 passed, 1 skipped.
* Dev-server port check for `3001` and `5173` produced no listeners.
* Follow-up live fix: `npm run build:server` and `npm run build:client` passed after manifest fallback and zero-placement rejection changes.
* Follow-up focused PostgreSQL validation could not complete because local Postgres refused `127.0.0.1:5432`.

## Follow-up Fixes

* `apps/server/src/operations/alexanderPatchImport.ts` now validates manifest candidates and continues past stale or hash-mismatched artifacts. This lets the server fall back from the stale offline artifact to the existing generated `apps/client/public/alexander-patch-manifest.json` during local runs.
* `apps/server/src/operations/alexanderPatchImport.ts` rejects imports that produce zero accepted placements instead of returning a successful acknowledgement with no tiles.
* `apps/server/src/index.ts` now preserves the Alexander import service rejection message in the socket acknowledgement so the client can display the actual cause.

## Release Summary

Alexander patch placement is now initiated as one semantic client command. The server owns manifest trust and tile derivation while preserving the existing authoritative placement transaction for every committed tile.
