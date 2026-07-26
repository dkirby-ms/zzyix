---
title: Tile Picker Alternatives Research
description: Alternatives for visual tile previews in zzyix client with accessibility and source-of-truth guarantees.
author: GitHub Copilot
ms.date: 2026-07-26
ms.topic: reference
---

## Research Scope

* Evaluate at least three viable approaches for visual tile previews in the tile picker
* Compare drift risk, complexity/maintainability, accessibility fit, performance, and testing impact
* Validate expected keyboard and screen-reader semantics for single-select card picker behavior
* Recommend an implementation approach tailored to this codebase

## Evidence from Current Code

* Tile shape source-of-truth currently lives in polygon outlines in apps/client/src/domain/tileGeometry.ts:4-114, with shape definitions in apps/client/src/domain/tileGeometry.ts:23-82 and retrieval via getTileDefinition in apps/client/src/domain/tileGeometry.ts:92.
* Rendering path already consumes those same outlines to build Three.js geometry, including a shape-based cache in apps/client/src/render/MosaicScene.tsx:22 and extrusion generation in apps/client/src/render/MosaicScene.tsx:92-109.
* Current picker is a single-select Radix ToggleGroup for shape, material, palette, and color in apps/client/src/ui/TilePalette.tsx:35-118.
* Existing tests assert radiogroup/radio semantics and selected state for picker controls in apps/client/src/ui/TilePalette.test.tsx:24-29 and apps/client/src/ui/TilePalette.test.tsx:66-70.
* Toggle primitive tests also assert radio role behavior in apps/client/src/ui/primitives/ToggleGroup.test.tsx:8-21.
* Focus-visible and selected-state CSS are already present for toggle items and swatches in apps/client/src/ui/primitives/ToggleGroup.css:17-25 and apps/client/src/App.css:274-383.
* App integration currently mounts TilePalette at apps/client/src/App.tsx:1100-1109.

## Alternatives Compared

| Approach | Drift Risk vs Geometry Source-of-Truth | Complexity and Maintainability | Accessibility Fit (TilePalette + tests) | Performance for Frequent Renders | Testing Strategy Impact |
|---|---|---|---|---|---|
| Inline SVG generated from tileGeometry outlines | Low drift risk if preview paths are derived directly from getTileDefinition output in apps/client/src/domain/tileGeometry.ts:92. Shape updates automatically propagate to picker previews. | Moderate one-time complexity to add a small projection utility (domain units -> SVG viewBox). Low ongoing maintenance if centralized helper is used. | Strong fit: keep existing ToggleGroupItem structure in apps/client/src/ui/TilePalette.tsx:47-49 and render SVG inside each item while preserving aria-label and radio semantics already asserted in tests. | Strong: 4 shapes and tiny path strings, negligible cost. Optional memoization by shape string avoids recomputation. No WebGL context cost. | Add focused unit tests for path generation and integration tests that radio names/checked states are unchanged. Existing TilePalette tests need minimal updates because role model remains the same. |
| Shared rendering utility reused from render code (canvas/Three projection) | Low-to-medium drift risk depending on design. If directly reusing getTileDefinition, drift is low. If sharing only Mesh/extrude helpers from MosaicScene, risk of UI/view coupling rises. | Higher complexity: render layer currently in apps/client/src/render/MosaicScene.tsx is Three-specific (ExtrudeGeometry, Shape, Vector2). Reusing in DOM picker can pull rendering concerns into UI or require an adapter layer. | Fit is acceptable but heavier: embedding canvas/WebGL snapshots inside ToggleGroupItem can complicate focus rings and visual states from apps/client/src/App.css:274-383. | Medium: still small shape set, but canvas/WebGL lifecycle and texture/snapshot work are more expensive than inline SVG for sidebar controls. | Requires integration tests around lifecycle/cleanup and possibly mocking canvas/WebGL, increasing test fragility in jsdom.
| Static/preauthored assets mapped to shape names | High drift risk: source-of-truth moves to a separate asset map and can diverge from apps/client/src/domain/tileGeometry.ts:23-82 unless tightly governed. | Low initial implementation complexity but long-term maintenance overhead when geometry changes. Requires manual asset refresh workflow. | Very easy to fit existing ToggleGroup markup and semantics because asset is presentational only. | Excellent runtime performance (static images/SVG files). | Easy snapshot tests for icon rendering, but must add drift-guard tests comparing asset map entries to TileShape union in apps/client/src/domain/tileGeometry.ts:4 and ideally geometry-derived expectations. |

## Keyboard and Screen-Reader Semantics Validation

Current behavior already aligns with single-select radio-group semantics:

* Each logical row uses ToggleGroup type="single" in apps/client/src/ui/TilePalette.tsx:35-45, apps/client/src/ui/TilePalette.tsx:56-66, apps/client/src/ui/TilePalette.tsx:77-87, and apps/client/src/ui/TilePalette.tsx:95-105.
* Tests verify each group is exposed as radiogroup and options as radio in apps/client/src/ui/TilePalette.test.tsx:25-29 and apps/client/src/ui/primitives/ToggleGroup.test.tsx:18-21.
* Tests verify selected state via aria-checked and data-state in apps/client/src/ui/TilePalette.test.tsx:66-70.
* Visual focus treatment exists via :focus-visible styles in apps/client/src/ui/primitives/ToggleGroup.css:23-25 and apps/client/src/styles/base.css:8-11.

Expected semantics to preserve for a visual card picker:

* Single tab stop into each shape radiogroup, with internal item navigation behaving like radio controls.
* Stable accessible name per option (current labels like triangle/l-shape in apps/client/src/ui/TilePalette.tsx:47 and swatch labels in apps/client/src/ui/TilePalette.tsx:111).
* Selection state must remain programmatically exposed (aria-checked true/false and one selected value).
* Decorative preview graphics should be aria-hidden so screen readers continue to announce concise control labels.

## Recommendation

Recommended approach: Inline SVG previews generated from tileGeometry outlines.

Why this is the best fit here:

* It preserves a single source-of-truth by deriving previews from getTileDefinition in apps/client/src/domain/tileGeometry.ts:92.
* It avoids coupling UI controls to Three.js render internals in apps/client/src/render/MosaicScene.tsx:92-109.
* It keeps current accessibility semantics and tests largely intact in apps/client/src/ui/TilePalette.tsx:35-118 and apps/client/src/ui/TilePalette.test.tsx:24-70.
* It has the smallest runtime/rendering overhead for a sidebar card picker.

## Implementation Sketch Tailored to Existing Files

1. Add a small shape-preview utility/component.

* New file suggestion: apps/client/src/ui/TileShapePreview.tsx
* Inputs: shape (TileShape), optional size/stroke/theme props.
* Internals:
  * Read outline from getTileDefinition(shape).outline.
  * Compute min/max bounds and normalize to a consistent square viewBox.
  * Generate SVG path (M/L/Z) from normalized points.
  * Mark SVG as aria-hidden=true, focusable=false.

2. Integrate previews into shape ToggleGroup items.

* Update shape row in apps/client/src/ui/TilePalette.tsx:46-50 to include TileShapePreview plus text label.
* Keep aria-label on ToggleGroupItem unchanged or explicitly title-case labels.
* Preserve current callbacks and value handling in apps/client/src/ui/TilePalette.tsx:39-43.

3. Add tests with minimal churn.

* Extend apps/client/src/ui/TilePalette.test.tsx with assertions that shape radio items contain an SVG child marked aria-hidden.
* Add focused unit tests for path normalization logic in a new test file near preview utility.
* Keep existing role/selected-state tests in apps/client/src/ui/TilePalette.test.tsx:24-70 unchanged as regression safety.

4. Optional drift guard.

* Add a test that iterates all TileShape values from apps/client/src/domain/tileGeometry.ts:4 and ensures preview generation succeeds.

## Potential Pitfalls and Mitigations

* Pitfall: SVG appears upside-down or clipped due to coordinate normalization mismatch.
  * Mitigation: Centralize bounds normalization and include geometry fixture tests using square/triangle/l-shape from apps/client/src/domain/tileGeometry.ts:23-50.
* Pitfall: Visual-only icon harms screen-reader verbosity if not hidden.
  * Mitigation: Keep icon aria-hidden and preserve concise item aria-label values as currently implemented in apps/client/src/ui/TilePalette.tsx:47 and apps/client/src/ui/TilePalette.tsx:111.
* Pitfall: CSS selected-state visual contrast regresses for icon-based cards.
  * Mitigation: Reuse existing data-state='on' hooks in apps/client/src/App.css:274-383 and add one visual regression/assertion test for selected shape card class/state.
* Pitfall: Future shape additions not represented in picker.
  * Mitigation: Derive shape list from typed registry or add a test checking shapes array in apps/client/src/ui/TilePalette.tsx:17 against tileGeometry TileShape union in apps/client/src/domain/tileGeometry.ts:4.

## Clarifying Questions (If Needed)

* Should shape card labels remain visible text, or should labels be visually minimized with the SVG doing most of the visual work?
* Do we want previews to reflect only base orientation, or mirror/rotation variants used in placement workflows?

## Research Status

Complete for current scope. The three requested alternatives were analyzed with codebase-specific evidence, accessibility semantics were validated against current implementation/tests, and a recommended implementation sketch with pitfalls/mitigations is provided.
