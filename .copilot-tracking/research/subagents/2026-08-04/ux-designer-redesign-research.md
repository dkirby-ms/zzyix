---
title: Zzyix UX Designer Redesign Research
description: Visual UX research for a designer prompt without application changes
ms.date: 2026-08-04
ms.topic: concept
keywords:
  - zzyix
  - ux design
  - visual redesign
---

## Research Scope

Research the existing Zzyix client solely to inform a visual UX-designer prompt. The scope covers client entry points, UI components, styles, public assets, and user-facing tests. It excludes functional, architectural, Vite, React, and application-source changes.

## Product Summary

Zzyix presents a single authenticated collaborative craft workspace named
"Mosaic Atelier." People compose a shared canonical quilt by selecting a tile
shape and color, previewing placement directly on a 3D canvas, then placing a
tile. The system supports a toroidal quilt, canonical patch navigation,
real-time collaborator presence, grid guidance, and minimap navigation.

The client entry point is apps/client/src/main.tsx. Application state and
screen branching live in apps/client/src/App.tsx. The default experience does
not include a multi-canvas lobby, even though dormant lobby styling remains in
apps/client/src/App.css.

## User-Facing Workflows and Audit States

### Authentication and Entry

* Signed-out view: Mosaic Atelier heading, short sign-in explanation, and one
  primary Sign in action
* Local end-to-end testing only: Alice and Bob identity presets plus a text
  field, which should not be treated as production-facing account design
* Authentication loading: "Loading your secure workspace..."
* Logout route: Signing out and signed-out confirmation states, with a return
  to Sign in
* Canonical world discovery: "Loading the canonical canvas..."
* Canonical world unavailable: Canvas unavailable alert with a server-provided
  reason
* Render failure: application and canvas-specific recovery views with reload
  action, error ID, timestamp, page, message, and expandable technical details

### Quilt Authoring Workspace

* Header: product title, active collaborator count when present, compact
  connection status, signed-in identity, and sign-out icon action
* Canonical patch navigation: current patch row and column plus Root action
* Canvas: hover-driven ghost tile preview, validity confidence color, click to
  place, right-drag rotation, middle-drag panning, and keyboard shortcuts for
  rotation, mirroring, and undo
* Placement feedback: a status strip reports placed count, active selection,
  and valid, near-valid, or invalid placement state. Rejected placement uses a
  short pulse.
* Collaboration: remote cursor points, remote selection halos, and a compact
  participant chip roster
* Tile palette: eight selectable shapes, eight curated palettes, five swatches
  per palette, optional custom hex or RGB entry, active-selection summary, and
  a collapsible control body
* Grid guidance: on/off toggle, pattern selection, compatibility guidance, and
  unavailable or incompatible states
* Minimap: whole-quilt preview, occupancy density when detailed tile geometry
  is not cached, clickable and draggable viewport frame, zoom buttons, and
  minimization

### Responsive and Capability States

* Desktop uses a canvas plus a fixed-width 280px authoring panel
* At 960px and below, the workspace becomes a vertical canvas then palette
  stack; the palette receives a constrained scrollable height
* At 479px and below, canvas overlays become more compact. The minimap moves
  to the upper-right canvas area, while the grid controls stay at the bottom
  with a 50 percent height limit.
* When mutation is disabled by the quilt protocol, the tile palette is hidden.
  The canvas and navigational context remain visible.

## Present Design Language

### Visual Character

* Warm workshop and material-craft direction: cream and brown surfaces,
  terracotta accent, soft amber light, and natural tile palettes
* Fraunces display type paired with Sora body type, giving the product an
  editorial title voice with compact utilitarian controls
* Layered translucent cream panels, fine brown borders, soft shadows, and
  moderate backdrop blur over a warm radial-gradient background
* Rounded controls dominate: pills for general actions, 12px to 14px cards
  and overlays, and circular or compact square controls for minimap actions
* The 3D canvas uses a pale handmade-paper base with warm and cool lighting,
  extruded tiles, shadows, and distinct validation colors
* Eight named five-color palettes provide a broad yet coordinated range:
  Terracotta, Lagoon, Dusk, Quarry, Forest, Aurora, Ember, and Frost

### Constraints to Preserve

* Preserve the canvas as the primary visual and interaction surface. It must
  remain immediately useful rather than becoming a decorative preview.
* Preserve visible tile geometry, direct ghost preview, clear valid and
  invalid differentiation, and collaborator identity cues.
* Preserve the full control inventory, labels, and interaction meaning. The
  existing tests require accessible buttons, radio groups, live status
  announcements, and named regions.
* Preserve keyboard and focus visibility: 44px minimum touch targets, visible
  focus rings, arrow and Enter or Space selection for radio-style controls,
  and reduced-motion support.
* Preserve responsive order and overlay containment. Current mobile rules
  explicitly avoid horizontal overflow and cap both palette and overlay height.
* Preserve error and connection states as designed screens, not unstyled
  browser fallbacks. Connection error details currently appear in a tooltip.
* Preserve the minimap's separate occupancy representation. It intentionally
  communicates the wider quilt even when fine tiles are absent from the local
  cache.

### Deliberate Rethinking Opportunities

* Strengthen hierarchy between world navigation, placement guidance, and tile
  authoring. Several similarly styled translucent overlays compete for the
  canvas corners.
* Reduce visual density in the palette while retaining all shapes, palettes,
  swatches, custom color entry, summary, and collapse behavior.
* Make placement confidence more legible before a user attempts an invalid
  drop, without relying only on color.
* Clarify collaboration state and ownership while keeping participant chips,
  cursor markers, and selection halos compact.
* Give the minimap, grid guide, and canonical patch context a coherent shared
  visual hierarchy, especially on narrow screens where their canvas overlays
  may compete.
* Reconsider the pervasive pill treatment for long labels and dense tool
  groups. A more deliberate distinction between commands, selectors, and
  informational chips could improve scanability.

## Visual Deliverables Without Functional Changes

* Desktop and mobile annotated redesign frames for signed-out, canonical
  loading, canonical unavailable, canvas loading, render failure, and the
  active authoring workspace
* A responsive canvas-overlay choreography showing header, patch navigation,
  status, collaborators, grid guide, minimap, and palette at desktop, tablet,
  and narrow-mobile breakpoints
* A visual hierarchy and spacing specification using existing content and
  component boundaries rather than new controls or flows
* Updated color, typography, elevation, border, radius, focus, and motion
  token recommendations, including non-color placement states
* Tile palette presentation concepts that retain all current radio groups,
  labels, swatches, advanced color entry, active summary, and collapsed state
* Placement and collaboration feedback studies: ghost preview, validity,
  owner boundary, remote cursor, remote selection, participant roster, and
  connection status
* Minimap and grid-overlay visual treatments that retain click or drag pan,
  zoom, minimize, pattern selection, and compatibility feedback
* Component-level redlines for existing CSS and React surfaces only, with no
  change to user actions, state handling, test semantics, Vite, or the
  architecture

## Suggested Designer Prompt Scope

Design a visual UX refresh for Zzyix's authenticated Mosaic Atelier workspace.
Treat it as a collaborative digital craft table, not a dashboard or a generic
whiteboard. Improve information hierarchy and responsive overlay choreography
while preserving the 3D canvas as the focal interaction surface. Produce
desktop, tablet, and mobile specifications for the authentication, loading,
unavailable, error, and active authoring states. Retain every existing workflow
and control: tile shape, palette, swatches, custom color, placement preview,
grid patterns and compatibility, patch navigation, collaboration indicators,
minimap pan and zoom, account and connection status, and accessible keyboard
and live-announcement behavior. Work within the existing React, Vite, and
component architecture. Recommend only visual, layout, styling, asset, and
microcopy refinements that do not change functionality.

## Evidence

* apps/client/src/main.tsx identifies the React entry point and authentication
  plus error-boundary wrapping.
* apps/client/src/App.tsx defines the application states, canvas composition,
  canonical navigation, authoring controls, and protocol-gated mutation state.
* apps/client/src/App.css defines the shell, responsive breakpoints, visual
  layers, control styling, and canvas overlay positions.
* apps/client/src/render/MosaicScene.tsx defines 3D tile, ghost, validation,
  collaborator, lighting, and camera behavior.
* apps/client/src/ui/TilePalette.tsx,
  apps/client/src/ui/GridOverlayControls.tsx, and
  apps/client/src/ui/MinimapOverlay.tsx define the visible authoring and
  navigation controls.
* apps/client/src/styles/tokens/primitives.css,
  apps/client/src/styles/tokens/semantic.css, and
  apps/client/src/ui/palettes.ts define the token system and curated palettes.
* apps/client/src/App.test.tsx,
  apps/client/src/ui/TilePalette.test.tsx,
  apps/client/src/ui/GridOverlayControls.test.tsx, and
  apps/client/src/ui/MinimapOverlay.test.tsx establish the user-facing
  semantics and states that visual work must retain.

## Open Questions

* Is the redesign expected to remain inside the current warm craft direction,
  or may it explore a substantially different visual brand?
* Should the designer produce implementation-ready CSS and component redlines,
  or a design-system proposal and high-fidelity frames only?
* Which target device widths and accessibility standard should serve as the
  formal acceptance baseline beyond the existing 960px and 479px CSS rules?
