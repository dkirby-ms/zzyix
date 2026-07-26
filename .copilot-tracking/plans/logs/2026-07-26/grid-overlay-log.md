<!-- markdownlint-disable-file -->
# Planning Log: Grid Overlay

## Discrepancy Log

Gaps and differences identified between research findings and this implementation plan.

### Unaddressed Research Items

* DR-01: Real-device multi-pointer gesture validation is deferred until issue #80 supplies second-pointer cancellation and two-finger pan/zoom arbitration.
  * Research expectation: Support current keyboard, pointer, and touch paths while recognizing the pending touch contract.
  * Plan handling: Reuse the common world-position resolver for current input paths and avoid adding competing gesture logic in issue #85.
* DR-02: Interactive visual tuning of triangle orientation, running-bond spacing, and overlay opacity is not a prerequisite for the implementation plan.
  * Research expectation: Validate spacing and visual language with a prototype.
  * Plan handling: Require canonical-outline derivation and complete fill-sequence tests, then perform manual visual checks during validation.
* DR-03: Cross-session persistence for overlay visibility and pattern choice remains undefined.
  * Research expectation: Decide separately whether the preference persists.
  * Plan handling: Keep state in App memory only and preserve it while toggling visibility within the current client session.

### Plan Deviations from Research

* DD-01: The renderer plan adds focused `GridOverlay.test.tsx` coverage.
  * Research specifies: Domain, controls, controller, and App tests plus manual render checks.
  * Plan specifies: Keep renderer geometry and state classification pure enough to test without WebGL, then add scene composition coverage.
  * Rationale: Viewport culling, canonical-outline transforms, and lifecycle cleanup are core correctness requirements and benefit from automated regression coverage.
* DD-02: Incompatible active shapes receive an invalid target aligned to the nearest pattern slot.
  * Research specifies: Suppress valid placement, never fall back to the raw pointer, and show actionable guidance.
  * Plan specifies: Use the nearest pattern slot transform as an invalid preview target with an incompatibility reason.
  * Rationale: This preserves strict visual alignment without implying that the incompatible tile can be placed.

## Implementation Paths Considered

### Selected: Data-Driven Client-Side Slot Catalog

* Approach: Define repeating typed slot templates, resolve strict guided transforms on the client, render canonical slot outlines in the current viewport, and submit the ordinary final transform to the existing server API.
* Rationale: Constructibility is mechanically testable, existing tiles remain independent of guide state, and server authority remains unchanged.
* Evidence: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 331-350, 397-407)

### IP-01: Uniform Grid Quantization with Decorative Patterns

* Approach: Quantize X/Y to one cell size and vary only a texture or `GridHelper`.
* Trade-offs: Small implementation surface but cannot model running-bond offsets, alternating triangle orientation, typed slots, or exact occupancy states.
* Rejection rationale: The visual pattern and placement behavior could drift, and constructibility would not be provable.

### IP-02: Server-Persisted Pattern and Slot Occupancy

* Approach: Persist pattern IDs in canvas state and slot IDs in placement payloads.
* Trade-offs: Shared collaboration behavior and stronger pattern enforcement, but requires protocol, schema, migration, authorization, and concurrency changes.
* Rejection rationale: Issue #85 describes a local editing guide and requires pattern changes to leave existing tiles untouched.

## Suggested Follow-On Work

* WI-01: Complete issue #80 gesture arbitration and validate the overlay on real touch hardware. (high)
  * Source: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 43-45, 146-151, 507-508)
  * Dependency: Issue #80 implementation
* WI-02: Prototype and tune initial pattern spacing, triangle orientation, stroke hierarchy, and blocked-slot markers. (medium)
  * Source: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 40-42)
  * Dependency: Initial pattern domain and GridOverlay renderer
* WI-03: Decide whether overlay preferences should persist locally or as account settings. (low)
  * Source: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 46-47)
  * Dependency: Product decision on preference scope
* WI-04: Centralize client/server tile registries before introducing runtime-configurable tile libraries. (medium)
  * Source: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 48-50, 505-506)
  * Dependency: Runtime tile-library requirements
* WI-05: Coordinate final mobile toolbar placement with issue #83's palette bottom sheet. (low)
  * Source: .copilot-tracking/research/2026-07-26/grid-overlay-research.md (Lines 58, 295-298)
  * Dependency: Issue #83 design and implementation

## User Decisions

* No additional user decision prompts were required because the supplied research explicitly recommends world-origin anchoring, client-local state, strict placement, pattern-owned orientation, constructibility filtering, and selected-pattern retention.
