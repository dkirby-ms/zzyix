<!-- markdownlint-disable-file -->
# Planning Log: Visual Tile Picker

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* No active DR items after final re-validation.

### Plan Deviations from Research

* DD-01: Shape keyboard-path behavior now has explicit component-level handling and tests.
  * Plan specifies: preserve ToggleGroup semantics and validate keyboard paths through tests.
  * Implementation differs: added explicit Arrow and Space/Enter key handling on shape items in `TilePalette` to make paths deterministic and directly testable.
  * Rationale: resolves review-identified evidence gap for explicit keyboard modality coverage.

## Implementation Paths Considered

### Selected: Inline SVG Previews from Domain Geometry

* Approach: Render shape thumbnails as inline SVG generated from `getTileDefinition(shape).outline` with normalized bounds and padding.
* Rationale: Strong source-of-truth coupling, low runtime overhead, and simple testability in current UI architecture.
* Evidence: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 157-172, 238-245)

### IP-01: Scene-Renderer-Backed Snapshots (Canvas/Three.js)

* Approach: Reuse scene rendering logic to produce card thumbnails.
* Trade-offs: High coupling to render pipeline, more lifecycle complexity, heavier test setup, potential sidebar performance cost.
* Rejection rationale: Unnecessary architectural coupling for simple static previews in the picker.

### IP-02: Static Authored Shape Assets

* Approach: Use predefined icon assets mapped by shape name.
* Trade-offs: Easy initial UI composition but introduces drift risk from geometry source and extra asset maintenance burden.
* Rejection rationale: Violates source-of-truth requirement and increases long-term maintenance overhead.

## Suggested Follow-On Work

* WI-02: Add automated axe accessibility checks in client test setup — Introduce rules-engine a11y assertions for picker states and labels. (medium)
  * Source: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 40-42)
  * Dependency: Baseline TilePalette and preview tests stabilized
* WI-03: Run design pass on card labeling density — Evaluate icon/label balance with usability and screen-reader naming feedback. (low)
  * Source: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 43-45)
  * Dependency: Initial visual picker merged
* WI-04: Evaluate replacing explicit shape key handlers with primitive-driven keyboard behavior if Radix coverage can provide equivalent deterministic tests. (low)
  * Source: Implementation Phase 6 post-review remediation
  * Dependency: Current remediation merged and stable

## User Decisions

* No user decision prompts were required during implementation.