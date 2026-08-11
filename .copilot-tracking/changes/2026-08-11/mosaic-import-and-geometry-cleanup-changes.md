<!-- markdownlint-disable-file -->

# Changes: Mosaic Import And Geometry Cleanup

## Related Plan

`.copilot-tracking/plans/2026-08-11/mosaic-import-and-geometry-cleanup-plan.instructions.md`

## Implementation Date

2026-08-11

## Removed

* `apps/client/src/domain/mosaicImport.ts`
* `apps/client/src/domain/mosaicImport.test.ts`

## Modified

* `apps/server/src/domain/placementSolver.port.test.ts` now expects bounds from the committed `0.44` geometry unit.
* `apps/client/src/domain/gridPatterns.test.ts` derives the negative test point from the pattern basis.
* `apps/client/src/interaction/controller.test.ts` targets the downward triangle template slot explicitly.

## Validation

* Focused tests passed: 38 tests.
* Full server suite passed: 257 tests, 1 skipped.
* Full client suite passed: 194 tests, 16 skipped.
* Client and server builds passed.
* No orphan module references remain.
