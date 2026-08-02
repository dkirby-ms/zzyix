<!-- markdownlint-disable-file -->

# Shared Quilt Visibility Research

## Scope and success criteria

Normal canonical entry must retain the user's owned patch while making other users' activity discoverable without a patch URL. The minimap must represent authorized quilt-wide activity independently of the bounded fine-detail client cache.

## Evidence

* `App.tsx` focused `assignedPatch`, which is randomly allocated per principal by `ensureCanonicalPatchAssignment`.
* Fine tile snapshots and events are scoped to viewport-derived patch and chunk rooms.
* `MinimapOverlay` receives only `visibleTiles`, while aggregate socket snapshots are not retained.
* `tile_spatial_refs` provides chunk-level occupancy without reconstructing every patch.
* Patch visibility policy exposes a separate `aggregateData` authorization surface.

## Selected approach

Retain `assignedPatch` for ordinary entry because placement authorization is ownership-scoped. Add an authenticated quilt occupancy endpoint that returns authorized per-chunk distinct tile counts. Poll this small read model separately from the fine cache and render occupancy cells under cached tile geometry. Clicking activity on the minimap pans there and activates the existing fine-detail subscriptions.

## Alternatives

* Global fine-detail subscriptions were rejected because they bypass cache and room budgets.
* One aggregate socket room per patch was rejected because a 32 by 32 quilt exceeds the per-connection room limit.
* Full tile geometry in the summary was rejected because it conflicts with aggregate-data policy boundaries.

## Validation

Use focused client entry, session API, minimap component, repository integration, and server endpoint tests, followed by workspace lint, build, and tests.