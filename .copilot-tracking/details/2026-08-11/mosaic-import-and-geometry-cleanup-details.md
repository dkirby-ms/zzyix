<!-- markdownlint-disable-file -->

# Details: Mosaic Import And Geometry Cleanup

## Context

* Research: `.copilot-tracking/research/2026-08-11/mosaic-import-and-geometry-cleanup-research.md`
* Plan: `.copilot-tracking/plans/2026-08-11/mosaic-import-and-geometry-cleanup-plan.instructions.md`

## Changes

* Delete `apps/client/src/domain/mosaicImport.ts` and its test.
* Correct server rotated rectangle bounds expectations for `unit = 0.44`.
* Build negative lattice test points from the selected pattern basis.
* Build the guide pointer from the triangle pattern's downward template slot.

## Validation

* Focused Vitest files for placement solver, grid patterns, and controller.
* Full client and server Vitest suites.
* Client and server production builds.
