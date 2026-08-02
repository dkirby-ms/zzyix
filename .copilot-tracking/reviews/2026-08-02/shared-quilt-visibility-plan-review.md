<!-- markdownlint-disable-file -->

# Shared Quilt Visibility Review

## Metadata

Plan: `.copilot-tracking/plans/2026-08-02/shared-quilt-visibility-plan.instructions.md`

Review date: 2026-08-02

Reviewer: GitHub Copilot

## Request fulfillment

* Complete: users can discover occupied regions across the quilt without entering another user's patch ID
* Complete: clicking an occupied minimap region pans there and activates existing fine tile subscriptions
* Complete: the minimap uses quilt-wide occupancy rather than only cached tiles

## Placement and quality

The server query uses the `aggregateData` authorization surface and distinct tile counts grouped by global chunk. Fine tile geometry remains viewport-scoped. The client stores occupancy separately from the bounded quilt cache and retains the last successful summary through transient refresh failures.

The initial shared-entry approach was rejected during review because placement authorization is ownership-scoped. Retaining assigned-patch entry avoids a write regression.

A follow-up review found that incremental placement reused snapshot replacement semantics, clearing existing chunk membership until the next viewport snapshot. Incremental events now append only the placed tile, with cache-level and App-level regression coverage.

Continuation added a passing real-browser regression for two sequential placements across owner and collaborator without viewport movement. Incremental removal coverage confirms unrelated tiles in the same and neighboring chunks remain cached.

The final fixture review confirms active tile patches retain requested materials, canonical placement assertions use principal-scoped ownership identity, and all shape coverage follows the multi-user factory contract. Adding `ownershipIdentity` to the test API effect dependencies also prevents stale bridge snapshots during identity initialization.

## Validation

* `npm run lint:client`: passed without warnings
* `npm run build`: passed
* `npm run test:client`: 178 passed, 16 skipped
* `npm run test:server`: 220 passed, 1 skipped
* Focused sequential-placement Playwright test: passed
* Complete multi-user Playwright spec: 7 passed

## Status

Complete.