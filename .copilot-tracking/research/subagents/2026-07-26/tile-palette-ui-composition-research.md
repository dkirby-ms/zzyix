---
title: Tile Palette UI Composition Research
description: Research findings on current client UI composition for tile/shape/color/material/theme controls and active selection display related to issue #76.
ms.date: 2026-07-26
ms.topic: reference
---

## Research Scope

### Requested topics

1. Inspect apps/client/src for components/render paths showing sidebar/control sections: shape, material, palette/color, transform, edit, navigation, help.
2. Identify existing components/hooks for tile palette, color swatches, material controls, and active selection summary surfaces.
3. Collect precise file references with line numbers for component boundaries, prop shapes, and rendering order.
4. Identify styling files and token usage relevant to 44px swatches and state visuals.

### Research status

Complete for current code in apps/client/src.

## Findings

### 1) Current control composition and rendering order

The canvas mode layout is composed in App and renders these controls in order:

1. AppHeader (top header row)
2. CanvasActionBar (transform/edit actions)
3. Status strip + collaborator roster overlays
4. MosaicScene (canvas render surface)
5. ControlsPanel (right sidebar: shape/material/palette/color)

Evidence:
- apps/client/src/App.tsx:955-972 (lobby vs canvas split)
- apps/client/src/App.tsx:973-981 (AppHeader)
- apps/client/src/App.tsx:982-994 (canvas shell and CanvasActionBar)
- apps/client/src/App.tsx:994-1007 (status strip and collaborator roster)
- apps/client/src/App.tsx:1008-1057 (MosaicScene)
- apps/client/src/App.tsx:1081-1093 (ControlsPanel)

### 2) Sidebar/control sections mapped to requested categories

Implemented now:
- Shape controls: ControlsPanel section "Shape"
- Material controls: ControlsPanel section "Material"
- Palette controls: ControlsPanel section "Palette"
- Color swatches: ControlsPanel swatch grid in palette section
- Transform controls: CanvasActionBar (+/-90, mirror, +/-15 with live rotation display)
- Edit control: CanvasActionBar Undo

Evidence:
- apps/client/src/ui/ControlsPanel.tsx:30-45 (shape section)
- apps/client/src/ui/ControlsPanel.tsx:47-61 (material section)
- apps/client/src/ui/ControlsPanel.tsx:63-89 (palette + swatches section)
- apps/client/src/ui/CanvasActionBar.tsx:23-33 (transform controls)
- apps/client/src/ui/CanvasActionBar.tsx:34-36 (Undo)

Not found as explicit dedicated UI sections/components:
- Navigation section (beyond return button and camera pan/zoom interactions)
- Help section
- Theme selector section (palette is present; no separate "theme" control label/component)

Partial navigation affordances present:
- Header return button: apps/client/src/ui/AppHeader.tsx:18-20
- Camera pan/zoom interaction in scene input layer: apps/client/src/render/MosaicScene.tsx:222-241, 461-470

### 3) Existing components/hooks for palette/material/color/selection

Primary components:
- ControlsPanel for shape/material/palette/swatch selection
  - Props contract: apps/client/src/ui/ControlsPanel.tsx:5-14
- CanvasActionBar for transform/edit actions
  - Props contract: apps/client/src/ui/CanvasActionBar.tsx:1-10
- AppHeader for global status/collaborator count/undo
  - Props contract: apps/client/src/ui/AppHeader.tsx:1-7
- StatusIndicator for connection status visual and optional error tooltip
  - Props contract + state mapping: apps/client/src/ui/StatusIndicator.tsx:6-24

Palette/color sources:
- Palette data and palette name type:
  - apps/client/src/ui/palettes.ts:1-10
- Palette reset behavior when palette changes:
  - apps/client/src/App.tsx:1087-1090

Shape/material type sources:
- TileShape and MaterialVariant definitions:
  - apps/client/src/domain/tileGeometry.ts:4-6

Selection flow and active-selection-related surfaces:
- Hovered tile id computed by geometry hit-test:
  - apps/client/src/App.tsx:168-179
- Selection update emission throttled to socket:
  - apps/client/src/App.tsx:572-618
- Selection trigger during pointer movement:
  - apps/client/src/App.tsx:876-880
- Remote selections derived from collaborator state:
  - apps/client/src/App.tsx:521-529
- Remote selection rendered as halo over selected tile (canvas-only visual):
  - apps/client/src/render/MosaicScene.tsx:190-207 (RemoteSelectionHalo)
  - apps/client/src/render/MosaicScene.tsx:415-428 (render map)

Important gap for issue framing:
- No explicit textual "active selection summary" for local selected tile properties (shape/material/color) in sidebar/header/status strip.
- Existing "selection" UI is primarily remote collaborative highlighting on canvas, not a local summary panel.

### 4) Styling files and token usage relevant to 44px swatches and state visuals

Style loading chain:
- apps/client/src/main.tsx:3-5 imports index.css and styles/index.css
- apps/client/src/styles/index.css:1-3 imports primitives, semantic tokens, and base

44px target token:
- --touch-target-min: 44px
  - apps/client/src/styles/tokens/primitives.css:63

Swatch and button sizing uses the 44px token:
- button min-height/min-width var(--touch-target-min)
  - apps/client/src/App.css:284-293
- .swatch min-height/min-width var(--touch-target-min)
  - apps/client/src/App.css:324-328

Swatch state visual:
- .swatch.active focus-ring outline
  - apps/client/src/App.css:331-334
- Focus ring token references on controls/swatches
  - apps/client/src/App.css:312-316
  - apps/client/src/styles/tokens/primitives.css:53-55 (focus ring width/offset)
  - apps/client/src/styles/tokens/semantic.css:51 (focus ring color)

Palette/sidebar layout styles:
- .palette-region container and section spacing
  - apps/client/src/App.css:237-251
- .shape-grid, .pill-row, .color-row
  - apps/client/src/App.css:263-273, 318-322

State visual tokens and usage:
- Status ring tokens for valid/near-valid/invalid:
  - apps/client/src/styles/tokens/semantic.css:32-34
- Applied to status strip by data-state:
  - apps/client/src/App.css:380-390
- Connection state badges in StatusIndicator.css use semantic status tokens:
  - apps/client/src/ui/StatusIndicator.css:49-105

## Evidence Summary by Task

1. Sidebar/control sections inspected:
- ControlsPanel, CanvasActionBar, AppHeader, MosaicScene, App.css, token CSS files.

2. Existing components/hooks identified:
- ControlsPanel, palettes.ts, tileGeometry type aliases, App selection emission/derivation logic, MosaicScene remote selection halo, StatusIndicator.

3. Precise references collected:
- Included above with file + line ranges.

4. Styling/token usage identified:
- --touch-target-min 44px token and downstream button/swatch usage documented.

## Follow-on Questions (Directly Relevant)

1. Should issue #76 treat "active selection display" as local-only tile summary (shape/material/palette/color/transform), or preserve current remote-selection halo behavior as the primary selection surface?
2. Is a dedicated help/navigation section expected in the right sidebar, or should existing controls remain split between header/action bar/sidebar?

## Recommended Next Research

- Verify issue #76 acceptance language and map each requirement to the existing component tree (controls already present vs missing surfaces).
- Inspect tests for UI controls and selection behavior to identify current coverage and gaps:
  - apps/client/src/App.test.tsx
  - apps/client/src/interaction/controller.test.ts
  - apps/client/src/network/useSocketConnection.test.ts
- Check if any design notes mention a planned "theme" abstraction beyond current palette naming:
  - apps/client/IMPLEMENTATION_NOTES.md
  - docs/decisions/* (if control-surface decisions exist).
