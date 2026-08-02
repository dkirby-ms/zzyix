<!-- markdownlint-disable-file -->

# Shared Quilt Visibility Plan

## User requests

* Ensure normally connected users can see each other's tiles without manually sharing a patch URL.
* Make the minimap represent the entire quilt rather than only cached tiles.

## Context summary

Research: `.copilot-tracking/research/2026-08-02/shared-quilt-visibility-research.md`.

Applicable guidance includes the workspace Markdown, prompt-builder, and writing-style instructions.

## Implementation checklist

* [x] Preserve assigned-patch entry for ownership-scoped placement. <!-- parallelizable: false -->
* [x] Add an aggregate-authorized chunk occupancy query and endpoint. <!-- parallelizable: false -->
* [x] Fetch occupancy independently of the quilt tile cache. <!-- parallelizable: false -->
* [x] Render occupancy across the whole minimap. <!-- parallelizable: false -->
* [x] Add focused tests and run repository validation. <!-- parallelizable: false -->

## Continuation checklist

* [x] Add multi-user E2E coverage for sequential placement retention. <!-- parallelizable: true -->
* [x] Add cache regression coverage for incremental removal retention. <!-- parallelizable: true -->
* [x] Run focused and full validation for both follow-ups. <!-- parallelizable: false -->

## Fixture repair checklist

* [x] Make test-only active tile patches honor requested materials. <!-- parallelizable: true -->
* [x] Expose and assert principal-scoped ownership identity. <!-- parallelizable: true -->
* [x] Align shape persistence coverage with the multi-user fixture contract. <!-- parallelizable: true -->
* [x] Run focused and complete multi-user validation. <!-- parallelizable: false -->

## Dependencies

No new package dependencies. Existing Drizzle, Express, React, and Vitest APIs are sufficient.

## Success criteria

Normal users can discover occupied areas without a patch URL, durable links still resolve, authorized uncached chunks appear on the minimap, exact scene tile delivery remains viewport-scoped, and validation passes.