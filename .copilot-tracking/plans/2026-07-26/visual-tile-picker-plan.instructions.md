---
applyTo: '.copilot-tracking/changes/2026-07-26/visual-tile-picker-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Visual Tile Picker

## Overview

Replace text-only tile shape controls with accessible visual preview cards that derive directly from shared tile geometry while preserving the existing single-selection behavior.

## Objectives

### User Requirements

* Replace text-only shape controls with visual preview cards for square, triangle, rectangle, and L-shape — Source: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 8-12)
* Ensure previews are derived from an existing geometry source-of-truth to avoid drift — Source: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 9, 169-171, 238-245)
* Preserve single active selection behavior after placement — Source: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 10, 165, 197)
* Deliver keyboard, touch, pointer, and screen-reader operability with distinct interaction states — Source: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 11, 198-204)
* Maintain minimum target sizing requirements of 72x72 visual and 44x44 hit area — Source: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 12, 199-200)

### Derived Objectives

* Keep current shape state ownership in App and the TilePalette callback contract unchanged to reduce regression risk — Derived from: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 54-57, 93-96)
* Add focused tests for geometry-to-SVG normalization and card rendering states so preview fidelity remains tied to domain geometry — Derived from: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 201-204, 249-255)
* Evaluate, document, and reject higher-coupling alternatives (scene snapshots, static assets) in favor of inline SVG from geometry outlines — Derived from: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 229-245)

## Context Summary

### Project Files

* apps/client/src/ui/TilePalette.tsx - Existing shape selection UI and ToggleGroup semantics
* apps/client/src/App.tsx - Shape selection state ownership and picker wiring
* apps/client/src/domain/tileGeometry.ts - Canonical tile geometry definitions and `getTileDefinition`
* apps/client/src/App.css - Styling target for shape cards and interaction states
* apps/client/src/ui/TilePalette.test.tsx - Existing accessibility/selection behavior tests
* apps/client/src/ui/primitives/ToggleGroup.tsx - Primitive behavior to preserve (radio-like semantics)

### References

* .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md - Research baseline, preferred approach, alternatives, and file impact map

### Standards References

* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md — Markdown formatting requirements for planning files
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md — Writing clarity and structure conventions

## Implementation Checklist

### [x] Implementation Phase 1: Build Geometry-Driven Tile Previews

<!-- parallelizable: true -->

* [x] Step 1.1: Add a reusable `TileShapePreview` component that renders inline SVG from `getTileDefinition(shape).outline`
  * Details: .copilot-tracking/details/2026-07-26/visual-tile-picker-details.md (Lines 10-28)
* [x] Step 1.2: Add and validate a geometry normalization utility for bounds fitting, scaling, and path generation
  * Details: .copilot-tracking/details/2026-07-26/visual-tile-picker-details.md (Lines 30-46)
* [x] Step 1.3: Validate phase changes
  * Run lint and test commands scoped to new preview logic
  * If validation scope conflicts with another active phase, defer execution but run before Phase 1 is marked complete

### [x] Implementation Phase 2: Integrate Visual Cards into TilePalette with A11y Semantics

<!-- parallelizable: false -->

* [x] Step 2.1: Replace text-only shape items with card composition (preview + text label) while preserving ToggleGroup single-select behavior
  * Details: .copilot-tracking/details/2026-07-26/visual-tile-picker-details.md (Lines 65-84)
* [x] Step 2.2: Derive shape option list from domain geometry source to avoid UI/domain drift
  * Details: .copilot-tracking/details/2026-07-26/visual-tile-picker-details.md (Lines 85-105)
* [x] Step 2.3: Keep App-level shape wiring unchanged and verify selection persistence behavior after placement events
  * Details: .copilot-tracking/details/2026-07-26/visual-tile-picker-details.md (Lines 106-124)
* [x] Step 2.4: Validate phase changes
  * Run UI tests and targeted interaction checks for keyboard, pointer, touch-equivalent, and screen-reader naming states

### [x] Implementation Phase 3: Styling and Interaction State Hardening

<!-- parallelizable: true -->

* [x] Step 3.1: Add card sizing and interaction-state styles for hover, focus-visible, selected, pressed, and disabled states
  * Details: .copilot-tracking/details/2026-07-26/visual-tile-picker-details.md (Lines 143-163)
* [x] Step 3.2: Confirm minimum 72x72 visual size and at least 44x44 interactive target dimensions in CSS
  * Details: .copilot-tracking/details/2026-07-26/visual-tile-picker-details.md (Lines 164-180)
* [x] Step 3.3: Validate phase changes
  * Run CSS-impacting component tests and visual assertions where present

### [x] Implementation Phase 4: Test Coverage and Drift Guarding

<!-- parallelizable: false -->

* [x] Step 4.1: Extend TilePalette tests to assert radiogroup/radio semantics remain intact with preview cards
  * Details: .copilot-tracking/details/2026-07-26/visual-tile-picker-details.md (Lines 197-217)
* [x] Step 4.2: Add preview component tests for all supported shapes and geometry-derived SVG output
  * Details: .copilot-tracking/details/2026-07-26/visual-tile-picker-details.md (Lines 218-234)
* [x] Step 4.3: Add a drift-guard test ensuring shape options stay aligned with geometry definitions
  * Details: .copilot-tracking/details/2026-07-26/visual-tile-picker-details.md (Lines 235-251)
* [x] Step 4.4: Add a placement-persistence regression test for post-placement active selection continuity
  * Details: .copilot-tracking/details/2026-07-26/visual-tile-picker-details.md (Lines 252-268)

### [x] Implementation Phase 5: Validation

<!-- parallelizable: false -->

* [x] Step 5.1: Run full project validation
  * Execute all lint commands for the client workspace
  * Execute client build and relevant test suites
* [x] Step 5.2: Fix minor validation issues
  * Iterate on lint errors, build warnings, and test failures caused by the implementation
* [x] Step 5.3: Report blocking issues
  * Document issues requiring additional research
  * Provide user next steps if blockers exceed minor corrections

## Planning Log

See .copilot-tracking/plans/logs/2026-07-26/visual-tile-picker-log.md for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* React + TypeScript client stack in apps/client
* Existing ToggleGroup primitive behavior from Radix wrapper
* Vitest + Testing Library test tooling
* Shared geometry access via `getTileDefinition`

## Success Criteria

* Visual shape picker renders geometry-driven previews for all required shapes while preserving single-selection semantics — Traces to: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 8-12, 163-171)
* Interaction states and accessibility behavior remain operable for keyboard, pointer, touch, and screen readers — Traces to: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 11, 198-204)
* Styling enforces minimum card and hit-area dimensions with no regression in placement shape behavior — Traces to: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 10, 12, 199-200)
* Tests cover SVG normalization, picker semantics, and drift risks between UI options and geometry definitions — Traces to: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md (Lines 201-204, 249-255)