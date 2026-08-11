<!-- markdownlint-disable-file -->

# Research: Server-Authoritative Alexander Placement

## Scope

Move Alexander patch placement from client-orchestrated per-tile socket mutations to a single semantic client command. The browser should select the patch and request placement once. The server should load the approved Alexander manifest, derive tile placements for the target patch, and commit through existing authoritative quilt validation.

## User Requests

* Replace noisy client-side per-tile Alexander placement with a cleaner one-command workflow.
* Preserve the existing authoritative placement behavior rather than weakening server validation.

## Evidence Log

* `apps/client/src/App.tsx` currently creates a `createMosaicImportQueue` in `startMosaicImport` and submits each placement with `socketActionRef.current?.emit('quilt_place_tile', request, ack)`.
* `apps/client/src/domain/alexanderPatchPlacement.ts` already derives the owned patch deployment rectangle and filters manifest placements to the patch footprint.
* `apps/server/src/index.ts` handles `quilt_place_tile` and calls `persistQuiltTilePlacement`.
* `apps/server/src/db/repository.ts` enforces ownership, patch revision checks, collision validation, canonical topology, idempotency, persistence, audit rows, and patch event data.
* `apps/server/src/contracts.ts` has no current bulk or Alexander-specific mutation contract.
* No `alexander-patch-manifest.json` artifact is present in the workspace, so runtime loading must fail clearly when the manifest has not been generated or configured.

## Selected Approach

Add a new server-authoritative socket command, tentatively `quilt_place_alexander_patch`, with a request shape containing only `quiltId`, `operationId`, `patchId`, `manifestHash`, and expected starting patch revision. The server resolves the patch, validates ownership through existing placement transactions, loads and verifies the manifest, maps placements into the target patch, and calls the existing placement persistence function for each tile.

This keeps the initial implementation small by reusing the proven per-tile transaction. It does not yet make the import atomic across every tile, but it moves orchestration, manifest trust, and tile derivation off the browser.

## Alternatives Considered

* Keep the current client queue. This preserves behavior but keeps the noisy wire protocol and client orchestration problem.
* Add a REST endpoint. This would work, but the existing realtime mutation surface is Socket.IO and already has mutation gating, acknowledgements, and broadcast helpers.
* Add a single fully atomic repository transaction. This is cleaner long term, but larger and riskier because it duplicates placement validation and event emission rules that already exist in `persistQuiltTilePlacement`.

## Cheap Validation Checks

* Add a server/domain unit test for the new Alexander import service using a small fixture manifest.
* Add a client test or E2E assertion that the browser emits one Alexander command rather than multiple `quilt_place_tile` commands.
* Run `npm run test:server` or a focused Vitest target after server changes.
* Run `npm run test:client` or a focused client test after client simplification.

## Open Questions

* Whether the first implementation should continue after individual tile collisions using skip-and-record semantics or reject the whole command on the first rejected tile.
* Whether production deployment will provide the manifest file to the server container or whether the artifact should be embedded/copied during build.
