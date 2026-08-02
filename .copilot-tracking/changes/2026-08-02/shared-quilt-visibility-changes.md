<!-- markdownlint-disable-file -->

# Shared Quilt Visibility Changes

## Related plan

`.copilot-tracking/plans/2026-08-02/shared-quilt-visibility-plan.instructions.md`

## Summary

Added an aggregate-authorized quilt occupancy read model and rendered it independently of the fine-detail client cache. Users can identify and navigate to other occupied quilt regions without a patch URL while retaining their owned patch as the writable entry point.

Fixed incremental placement events so they append the new tile to cached chunk membership instead of replacing every cached chunk with that one tile. Existing tiles now remain visible after placement without requiring viewport movement to reload them.

## Added

* Quilt occupancy contracts and authenticated endpoint
* Aggregate-authorized per-chunk distinct tile count query
* Periodic protected client occupancy refresh
* Whole-quilt minimap occupancy cells
* Client and PostgreSQL regression coverage
* Cache-level and App-level settled-tile placement regressions

## Modified

* `apps/client/src/App.css`
* `apps/client/src/App.test.tsx`
* `apps/client/src/App.tsx`
* `apps/client/src/domain/quiltCache.test.ts`
* `apps/client/src/domain/quiltCache.ts`
* `apps/client/src/network/session.ts`
* `apps/client/src/ui/MinimapOverlay.test.tsx`
* `apps/client/src/ui/MinimapOverlay.tsx`
* `apps/server/src/contracts.ts`
* `apps/server/src/db/repository.postgres.integration.test.ts`
* `apps/server/src/db/repository.ts`
* `apps/server/src/index.ts`

## Validation

* Client lint passed with one pre-existing hook dependency warning in `App.tsx`
* Server lint passed with one pre-existing unused import warning
* Client and server builds passed
* Client tests: 177 passed, 16 skipped
* Server tests: 220 passed, 1 skipped
* Ports 3001 and 5173 were free at completion