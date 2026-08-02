<!-- markdownlint-disable-file -->

# Shared Quilt Visibility Implementation Details

## Context

Plan: `.copilot-tracking/plans/2026-08-02/shared-quilt-visibility-plan.instructions.md`.

Research: `.copilot-tracking/research/2026-08-02/shared-quilt-visibility-research.md`.

## Entry behavior

Keep the default navigation target on `assignedPatch` because mutation authorization is patch-scoped. Keep durable URL resolution and use minimap navigation to discover other occupied areas without requiring a URL.

## Occupancy read model

Query canonical quilt patches and their visibility policies for the principal. Apply `aggregateData` authorization, then group spatial references by global chunk coordinates with distinct tile counts.

Expose the result from a principal-authenticated quilt route. Validate quilt identity as a UUID and return an empty chunk list when no authorized occupied chunks exist.

## Client lifecycle

Fetch occupancy after canonical discovery and refresh on a bounded interval. Clear it with other protected state. A failed refresh must preserve the previous successful summary.

## Minimap rendering

Render occupancy rectangles in world-normalized coordinates below exact cached tile paths. Scale opacity from tile count and keep pointer behavior unchanged.

## Validation

Run the narrowest test after each implementation slice, then run full lint, build, and test commands.