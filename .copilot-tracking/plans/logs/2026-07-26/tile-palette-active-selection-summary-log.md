<!-- markdownlint-disable-file -->
# Planning Log: Tile Palette and Active Selection Summary

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* No current DR items. The updated plan and details now cover color naming implementation choices and explicit dependency verification or fencing for issues #75 and #78.

### Plan Deviations from Research

* No current DD items. The selected plan now matches the research-selected TilePalette extraction path and uses one explicit interaction contract.


## Implementation Paths Considered

### Selected: Hybrid TilePalette Extraction with Targeted Semantic Upgrades

* Approach: Extract a dedicated TilePalette component, preserve App-owned state, add active summary rendering, implement preserve-or-fallback palette switching, replace ControlsPanel outright, and apply one radio-style single-select contract across shape, material, palette, and color rows.
* Rationale: Meets the issue requirements with the smallest regression surface while preserving the current placement pipeline.
* Evidence: .copilot-tracking/research/2026-07-26/tile-palette-active-selection-summary-research.md (Lines 166-199, 240-248)

### IP-01: Minimal ControlsPanel Patch

* Approach: Keep ControlsPanel and layer on summary UI, aria metadata, and palette-fallback logic without a component rename or extraction.
* Trade-offs: Lower immediate churn, but weaker alignment with the dedicated TilePalette requirement and less clear future ownership.
* Rejection rationale: The issue explicitly calls for a focused TilePalette interaction model rather than an incremental patch on the old naming and structure.

### IP-02: Full Primitive-Driven Migration for Shape, Material, Palette, and Swatches

* Approach: Replace all rows with primitive-backed radio or toggle semantics in one pass and restyle around primitive state attributes.
* Trade-offs: Strongest accessibility consistency, but materially larger refactor surface and higher risk for a focused UX issue.
* Rejection rationale: Over-scoped for the selected implementation slice and not required to satisfy the current research-backed acceptance criteria.

## Suggested Follow-On Work

* WI-01: Finalize color naming strategy for accessible swatches and summaries. (medium)
  * Source: Supplemental planning research on color naming strategy
  * Dependency: Completion of the first TilePalette implementation pass
* WI-02: Verify dependency assumptions for issues #75 and #78 remain stable after merge. (medium)
  * Source: Primary research assumptions for issue dependencies
  * Dependency: Completion of the first TilePalette implementation pass