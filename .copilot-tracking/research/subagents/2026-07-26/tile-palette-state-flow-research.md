---
title: Tile palette state flow research
description: State ownership and transition analysis for active tile shape, color, material, and palette behavior after placement and palette switching.
ms.date: 2026-07-26
ms.topic: reference
---

## Research scope

Topics investigated:

* State ownership and update paths for active shape, color, material, and palette/theme.
* Placement success flow and whether active selection resets or persists.
* Palette/theme switching behavior and color preservation/reset semantics.
* Deterministic fallback opportunities when palette/theme changes.
* Test coverage and gaps.

## Key findings

### 1) Ownership of active shape/color/material/palette

State is owned in App-level React state:

* Shape state: apps/client/src/App.tsx:202
* Material state: apps/client/src/App.tsx:203
* Palette state: apps/client/src/App.tsx:204
* Color state: apps/client/src/App.tsx:205

Active placement payload input is derived as a memoized ActiveTile:

* apps/client/src/App.tsx:260-269

Controls are dumb/presentational and mutate parent state through callbacks:

* Props contract: apps/client/src/ui/ControlsPanel.tsx:5-13
* Shape click -> onShape: apps/client/src/ui/ControlsPanel.tsx:39
* Material click -> onMaterial: apps/client/src/ui/ControlsPanel.tsx:55
* Palette click -> onPaletteName: apps/client/src/ui/ControlsPanel.tsx:71
* Swatch click -> onColor: apps/client/src/ui/ControlsPanel.tsx:85

Palette data source (used as theme buckets) is static and local:

* apps/client/src/ui/palettes.ts:1-6
* PaletteName type: apps/client/src/ui/palettes.ts:8

### 2) Placement success flow and selection persistence

Placement attempt path:

1. App calls tryPlaceTile(activeTile, ghost, tiles): apps/client/src/App.tsx:893-895
2. If valid, optimistic temp tile is appended: apps/client/src/App.tsx:900-905
3. place_tile payload is emitted from temp tile shape/color/material: apps/client/src/App.tsx:910-917
4. On ack accepted, tile is reconciled but active selection state is not mutated: apps/client/src/App.tsx:926-927

Controller confirms placed tile copies shape/color/material from activeTile:

* apps/client/src/interaction/controller.ts:232-246

Conclusion:

* Active shape, material, palette, and color persist after successful placement.
* No post-placement reset of shape/material/palette/color exists in the success branch.
* Success branch updates collaborator selection (selected placed tile id), not active palette controls: apps/client/src/App.tsx:926

### 3) Palette/theme switch behavior and color preservation/reset

Current behavior on palette switch:

* onPaletteName handler sets palette and forcibly sets color to first swatch in that palette: apps/client/src/App.tsx:1087-1090

Implications:

* Color is reset on every palette/theme change.
* Existing selected color is not preserved, even if an identical hex appears in the new palette.
* There is no separate theme abstraction beyond PaletteName swatch groups.

### 4) Deterministic color fallback opportunities for palette/theme changes

Current fallback is deterministic but coarse:

* Fallback = first swatch in target palette: apps/client/src/App.tsx:1089

Deterministic alternatives (candidate policies):

1. Preserve exact hex if present in target palette, else first swatch.
2. Preserve swatch index position across palettes (clamped by length).
3. Nearest-color fallback in LAB/HSL distance with deterministic tie-breaker (palette order).
4. Session-sticky per-palette memory: remember last chosen color per palette name, fallback to first swatch only on first visit.

Determinism notes:

* All four are deterministic if tie-breakers are fixed.
* Option 1 is the least surprising and minimal-risk compared to current behavior.

### 5) Tests covering these behaviors and gaps

What is covered:

* tryPlaceTile returns placed tile when valid and rejects when invalid: apps/client/src/interaction/controller.test.ts:106-117
* Reconcile/ack sequencing and placement stream integrity: apps/client/src/interaction/controller.test.ts:132-369
* App integration around chunk snapshots and tile counts (placement data flow context): apps/client/src/App.test.tsx:526-560

What is not covered (gaps):

* No test for palette switch semantics that color resets to first swatch.
* No test for preserving active shape/material/color after successful placement ack.
* No test for activeTile fields in App-level place_tile payload after UI selection changes.
* No tests for palette-to-palette transition policy (exact-match preservation vs fallback).
* No tests around user expectation continuity when switching palettes repeatedly.

## State flow summary

Text diagram of current flow:

App local state
(shape, material, paletteName, color, rotation, mirrored)
-> activeTile memo
-> pointer update computes ghost
-> pointer up triggers attemptPlace
-> tryPlaceTile copies activeTile shape/color/material into candidate tile
-> optimistic append + socket place_tile
-> ack reconcile updates sequenced tiles only
-> active selection controls remain unchanged

Palette switch branch:

ControlsPanel palette button
-> App onPaletteName(name)
-> setPaletteName(name)
-> setColor(palettes[name][0])
-> new color used by ghost + next placement payload

## Evidence index

* apps/client/src/App.tsx:202-205
* apps/client/src/App.tsx:260-269
* apps/client/src/App.tsx:893-927
* apps/client/src/App.tsx:1010-1018
* apps/client/src/App.tsx:1081-1093
* apps/client/src/ui/ControlsPanel.tsx:5-13
* apps/client/src/ui/ControlsPanel.tsx:39
* apps/client/src/ui/ControlsPanel.tsx:55
* apps/client/src/ui/ControlsPanel.tsx:71
* apps/client/src/ui/ControlsPanel.tsx:78-85
* apps/client/src/ui/palettes.ts:1-8
* apps/client/src/interaction/controller.ts:232-246
* apps/client/src/interaction/controller.test.ts:106-117
* apps/client/src/interaction/controller.test.ts:132-369
* apps/client/src/App.test.tsx:526-560

## Clarifying questions not answerable from code alone

* Should palette/theme switching prioritize continuity (preserve nearest previous intent) or explicit reset (always first swatch)?
* Is the product intent to keep active shape/material/color sticky across placements for speed, or reset for guided workflows?
