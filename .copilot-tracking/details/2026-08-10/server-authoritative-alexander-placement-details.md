<!-- markdownlint-disable-file -->

# Details: Server-Authoritative Alexander Placement

## Phase 1: Contracts

Add request and acknowledgement types to `apps/server/src/contracts.ts`:

* `QuiltPlaceAlexanderPatchRequest`
* `QuiltPlaceAlexanderPatchAck`
* Optional per-placement summary entries for accepted and rejected manifest placements

Add runtime validation in `apps/server/src/index.ts` near the existing quilt mutation validators.

## Phase 2: Server Import Service

Create a server module under `apps/server/src/domain/` or `apps/server/src/operations/` that:

* Resolves the manifest path from `ALEXANDER_PATCH_MANIFEST_PATH`, then a repository-relative default under `offline/output/alexander-mosaic-inputs/alexander-patch-manifest.json`
* Parses schema version 2 manifests
* Recomputes the manifest hash using the same stable hashing rules
* Resolves the requested patch deployment from live quilt delivery context
* Filters placements that fit inside the patch footprint
* Generates deterministic tile IDs from the bulk operation and placement ID
* Calls `persistQuiltTilePlacement` sequentially with current patch revisions

## Phase 3: Socket Handler

Wire `socket.on('quilt_place_alexander_patch', ...)` in `apps/server/src/index.ts`:

* Reject when protocol v2 mutation is disabled
* Reject malformed, wrong-quilt, or unauthenticated requests
* Invoke the import service with selected principal context
* Return a single acknowledgement with counts and resulting patch revisions
* Broadcast tile events for accepted non-idempotent placements using the existing room naming helper

## Phase 4: Client Simplification

Change `apps/client/src/App.tsx` so Alexander placement:

* Still uses the existing patch click affordance
* No longer fetches or hashes the manifest in the browser
* Emits one `quilt_place_alexander_patch` request with `quiltId`, `patchId`, `operationId`, and optional manifest hash if known from configuration
* Updates status from the single acknowledgement

## Phase 5: Validation

Run focused tests first:

* Server focused test for new import service or socket contract
* Client focused test for Alexander button / socket traffic path if practical
* Build or typecheck for touched workspace when focused tests are insufficient
