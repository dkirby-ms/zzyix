---
title: Active Tile and Palette State Repo Analysis
description: Repository-grounded research for GitHub issue #79 consolidating active tile and palette UI state
ms.date: 2026-07-26
ms.topic: reference
---

## Scope and Research Questions

* Scope: client-side UI state architecture for tile configuration and placement interactions in apps/client.
* Scope exclusions: server contracts, persistence schemas, and non-UI domain sequencing semantics.
* Primary questions:
  * Which App-level states currently represent active tile configuration, palette behavior, gesture/pointer behavior, and placement feedback?
  * Which keyboard and pointer handlers mutate those states?
  * How is active tile configuration passed to MosaicScene and into placement/interaction logic?
  * What tests currently cover these transitions, and where are coverage gaps?
  * What concrete branch evidence exists for issue #75 linkage?
  * What migration risks are highest when consolidating into a typed ActiveTile model?

## Evidence Log

### Code Search Highlights

* Active tile and related App state declarations:
  * apps/client/src/App.tsx:199
  * apps/client/src/App.tsx:202
  * apps/client/src/App.tsx:203
  * apps/client/src/App.tsx:204
  * apps/client/src/App.tsx:205
  * apps/client/src/App.tsx:207
  * apps/client/src/App.tsx:208
  * apps/client/src/App.tsx:209
  * apps/client/src/App.tsx:210
  * apps/client/src/App.tsx:211
  * apps/client/src/App.tsx:212
* ActiveTile derivation and placement handlers:
  * apps/client/src/App.tsx:261
  * apps/client/src/App.tsx:894
  * apps/client/src/App.tsx:911
* Keyboard mutators:
  * apps/client/src/App.tsx:828
  * apps/client/src/App.tsx:829
  * apps/client/src/App.tsx:834
  * apps/client/src/App.tsx:838
  * apps/client/src/App.tsx:842
  * apps/client/src/App.tsx:846
* MosaicScene wiring in App:
  * apps/client/src/App.tsx:1018
  * apps/client/src/App.tsx:1020
  * apps/client/src/App.tsx:1021
  * apps/client/src/App.tsx:1028
  * apps/client/src/App.tsx:1029
  * apps/client/src/App.tsx:1030
  * apps/client/src/App.tsx:1031
  * apps/client/src/App.tsx:1039
* MosaicScene interaction contract and pointer button gesture handling:
  * apps/client/src/render/MosaicScene.tsx:42
  * apps/client/src/render/MosaicScene.tsx:54
  * apps/client/src/render/MosaicScene.tsx:55
  * apps/client/src/render/MosaicScene.tsx:56
  * apps/client/src/render/MosaicScene.tsx:57
  * apps/client/src/render/MosaicScene.tsx:58
  * apps/client/src/render/MosaicScene.tsx:222
  * apps/client/src/render/MosaicScene.tsx:252
  * apps/client/src/render/MosaicScene.tsx:269
* Existing typed ActiveTile model source:
  * apps/client/src/interaction/controller.ts:39
  * apps/client/src/interaction/controller.ts:176
  * apps/client/src/interaction/controller.ts:232
* Palette open/collapsed state search:
  * Search for open/collapse terms in App and TilePalette returned no matches for an open/collapsed UI state field.

### File Analysis

* apps/client/src/App.tsx
  * Owns both domain/network state and UI-interaction state.
  * Active tile is not stored as one state object; it is reconstructed via useMemo from primitive state values.
* apps/client/src/interaction/controller.ts
  * Already defines ActiveTile type used by updateGhostTarget and tryPlaceTile.
  * Placement pipeline already expects a typed ActiveTile input.
* apps/client/src/render/MosaicScene.tsx
  * Receives activeShape only, while ghost color/material/visibility and rotation/mirroring are passed through ghost transform.
  * Handles right-button rotate drag and middle-button pan gestures internally in InteractionPlane.
* apps/client/src/ui/TilePalette.tsx
  * Stateless controlled component; receives shape/material/paletteName/color and emits callbacks.
* apps/client/src/App.test.tsx
  * Broad integration coverage around palette fallback, pointer emit throttling, placement ACK behavior, camera pan, chunk streaming, and debug overlay visibility.
  * No explicit keyboard shortcut regression tests for rotation/mirror/undo key paths.
* apps/client/src/ui/TilePalette.test.tsx
  * Good semantic and callback coverage for radio-like palette controls.
* .copilot-tracking research/change artifacts for #75 clues:
  * .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md:27
  * .copilot-tracking/changes/2026-07-26/tile-palette-active-selection-summary-changes.md:37
  * .copilot-tracking/changes/2026-07-26/tile-palette-active-selection-summary-changes.md:69
  * .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md:39

## Key Discoveries

### 1) Current App-Level State Variables

* Active tile configuration primitives:
  * shape: apps/client/src/App.tsx:202
  * material: apps/client/src/App.tsx:203
  * paletteName: apps/client/src/App.tsx:204
  * color: apps/client/src/App.tsx:205
  * rotation: apps/client/src/App.tsx:207
  * mirrored: apps/client/src/App.tsx:208
* Placement feedback and transient interaction state:
  * ghost: apps/client/src/App.tsx:209
  * ghostVisible: apps/client/src/App.tsx:210
  * invalidPulse: apps/client/src/App.tsx:211
* View/pointer-related transient state:
  * cameraPan: apps/client/src/App.tsx:212
  * zoomTier: apps/client/src/App.tsx:229
* Collaborative/domain/network state co-located in same component:
  * sequencedState: apps/client/src/App.tsx:199
  * sessionId/mode/sessions/collaborators/chunk state: apps/client/src/App.tsx:216-230 (range described; key anchors include 216, 218, 223, 227).
* Consolidated typed view exists only as derived object, not source of truth:
  * activeTile useMemo from primitives: apps/client/src/App.tsx:261
* Palette open/collapsed state:
  * No existing App or TilePalette open/collapsed boolean/state found by direct term search.

### 2) Current Handlers and Actions Mutating Those Values

* Palette and color mutation:
  * handlePaletteChange mutates paletteName and potentially color with fallback message: apps/client/src/App.tsx:272-286.
  * direct color set from TilePalette onColor callback: apps/client/src/App.tsx:1097.
* Keyboard shortcuts:
  * R / Shift+R quantized rotation: apps/client/src/App.tsx:829-832.
  * ] and [ fine rotation increments: apps/client/src/App.tsx:834-840.
  * F mirror toggle: apps/client/src/App.tsx:842-843.
  * Z undo via remove_tile socket flow: apps/client/src/App.tsx:846-877.
* Pointer/click placement flow:
  * updatePointer emits pointer move, recomputes ghost target/validity, emits hovered selection, sets ghostVisible: apps/client/src/App.tsx:894-909.
  * attemptPlace validates ghost, performs optimistic placement, sends place_tile ack flow, may trigger invalidPulse: apps/client/src/App.tsx:911-946.
  * invalid pulse toggling timer: apps/client/src/App.tsx:353-356.
* Camera and rotate drag callbacks from scene:
  * onRotateDrag mutates rotation continuously: apps/client/src/App.tsx:1031-1033.
  * onCameraPan mutates cameraPan: apps/client/src/App.tsx:1039-1043.
* Pointer gesture button-mode behavior lives in MosaicScene InteractionPlane:
  * Right mouse drag -> onRotateDrag via movementX: apps/client/src/render/MosaicScene.tsx:223-231.
  * Middle mouse drag -> onCameraPan delta: apps/client/src/render/MosaicScene.tsx:232-241.
  * Primary down/up -> onPointerDown/onPointerUp placement pipeline: apps/client/src/render/MosaicScene.tsx:252-266 and 269-284.

### 3) MosaicScene Props and Active Tile Flow

* App passes shape separately and ghost composite separately:
  * activeShape from shape: apps/client/src/App.tsx:1020.
  * ghost object includes transform/confidence/color/material/visible: apps/client/src/App.tsx:1021-1027.
* MosaicScene prop contract confirms this split:
  * activeShape prop: apps/client/src/render/MosaicScene.tsx:44.
  * ghost prop type includes transform/color/material/visible: apps/client/src/render/MosaicScene.tsx:24-30.
* Interaction callbacks passed from App into rendering layer:
  * onPointerMove/onPointerDown/onPointerUp/onRotateDrag/onCameraPan: apps/client/src/App.tsx:1028-1043.
* Placement/interaction logic consumes typed ActiveTile before scene render:
  * updateGhostTarget(pointer, activeTile, ...): apps/client/src/App.tsx:896.
  * tryPlaceTile(activeTile, ghost, ...): apps/client/src/App.tsx:912.

### 4) Existing Tests and Coverage Gaps

* Existing strong coverage:
  * Pointer + selection emit throttling and trailing flush: apps/client/src/App.test.tsx:328.
  * Camera pan wiring and policy defaults: apps/client/src/App.test.tsx:424.
  * Palette fallback behavior and live announcement: apps/client/src/App.test.tsx:825 and 847.
  * Placement ACK success/rejection preserving active selection: apps/client/src/App.test.tsx:867 and 940.
  * Debug overlay visibility based on debug flag plus pointer activity: apps/client/src/App.test.tsx:1077 and 1092.
  * TilePalette control semantics and callback behavior: apps/client/src/ui/TilePalette.test.tsx:17, 37, 55, 177.
* Coverage gaps relevant to #79 migration:
  * No keyboard shortcut tests for R/[/]/F/Z mutation behavior in App.
  * No test directly asserting mirrored/rotation values passed through ghost transform after keyboard or drag actions.
  * No test validating invalidPulse timing/class toggle behavior.
  * No test of right-button and middle-button gesture event paths in real MosaicScene interaction plane (App test uses mocked scene buttons, not pointer button combinations).
  * No test around palette open/collapsed transitions because such state is currently not implemented.

### 5) Dependency Linkage and Clues for Issue #75

* Branch artifacts indicate dependency context but not hard proof in code history:
  * Declared baseline assumption: #75 behavior already reflected in branch.
    * .copilot-tracking/research/2026-07-25/canvas-first-responsive-app-shell-research.md:27
  * Later validation notes indicate #75/#78 could not be explicitly confirmed from local commit metadata and were fenced.
    * .copilot-tracking/changes/2026-07-26/tile-palette-active-selection-summary-changes.md:37
    * .copilot-tracking/changes/2026-07-26/tile-palette-active-selection-summary-changes.md:69
  * Current #79 research note references dependency chain (#79 depends on #75).
    * .copilot-tracking/research/2026-07-26/consolidate-active-tile-and-palette-ui-state-research.md:39
* Practical interpretation:
  * There is process-level evidence of dependency awareness.
  * There is no definitive repository-internal proof artifact (merged PR reference/commit SHA mapping) in the inspected files.

### 6) Regression Risks During Migration

* Risk: desynchronization between primitive states and derived activeTile object.
  * Today activeTile is useMemo-derived from shape/color/material/rotation/mirrored; migration that partly consolidates can leave dual write paths.
* Risk: ghost update pipeline regressions.
  * updatePointer and attemptPlace both rely on activeTile correctness at call time.
  * Any stale closure or reducer dispatch ordering issue can alter placement feedback/validity.
* Risk: keyboard shortcut behavior drift.
  * Rotation quantization and fine adjustment semantics are currently hardcoded and may accidentally change when routing through new actions.
* Risk: scene prop contract mismatch.
  * MosaicScene currently consumes activeShape plus ghost composite; switching to single activeTile prop can cause render/interaction regressions if not migrated atomically.
* Risk: accidental coupling of transient UI state with collaborative sequenced state.
  * App currently co-locates all states; refactor can unintentionally move collaborative fields into UI reducer or vice versa.
* Risk: untested gesture paths.
  * Right/middle mouse-specific behavior currently lacks dedicated integration tests.

## Alternatives Evaluated

### Alternative A: Minimal App Refactor with useState ActiveTile Object

* Design:
  * Replace shape/material/color/rotation/mirrored primitives with one useState<ActiveTile>.
  * Keep paletteName, fallback announcement, ghost/invalidPulse/cameraPan/zoomTier as separate transient state fields.
* Trade-offs:
  * Lowest mechanical change and easiest incremental migration.
  * Can still devolve into ad hoc partial updates and scattered setActiveTile calls.
  * Less explicit transition semantics than reducer actions.
* Complexity: low.
* Migration risk: medium-low.
* Testability: moderate; behavior remains integration-heavy unless helper updaters are extracted.

### Alternative B: App-Level useReducer for ActiveTile + Palette UI Transients

* Design:
  * Introduce dedicated reducer state slice for UI tile controls:
    * activeTile (shape/color/material/rotation/mirrored)
    * paletteState (paletteName, fallbackAnnouncement)
  * Keep gesture/placement transients (ghost, ghostVisible, invalidPulse, cameraPan, zoomTier) outside reducer.
  * Keep sequencedState/session/collaborator/chunk/network state untouched.
* Trade-offs:
  * Clear action semantics and centralized transitions reduce regression risk.
  * Slightly larger initial change surface than Alternative A.
  * Requires careful action naming to avoid reducer bloat.
* Complexity: medium.
* Migration risk: low-medium (if done in two steps).
* Testability: high; reducer can be unit-tested exhaustively for transition matrix.

### Alternative C: useActiveTileController Hook Encapsulating Reducer + Selectors

* Design:
  * Build a hook that wraps reducer logic and exposes:
    * activeTile
    * paletteName / fallback announcement
    * typed action dispatch helpers
    * derived helpers (applyPaletteChange, rotateStep, toggleMirror).
  * App uses hook outputs; controller/scene contracts stay stable.
* Trade-offs:
  * Best separation of concerns and future reuse.
  * Slightly more abstraction overhead and migration effort.
  * If over-designed, could duplicate simple local logic.
* Complexity: medium-high.
* Migration risk: medium (new abstraction layer).
* Testability: very high; hook tests + reducer tests isolate behavior.

### Alternative D: Global UI Context for Active Tile State

* Design:
  * Move active tile/palette/gesture state into context provider consumed by App, TilePalette, and scene-related layers.
* Trade-offs:
  * Simplifies prop threading if many consumers emerge.
  * Overkill for current single-owner App architecture.
  * Higher accidental coupling risk with network/domain concerns if boundaries are not strict.
* Complexity: high.
* Migration risk: high.
* Testability: moderate to high, but setup complexity increases.

## Recommended Approach with Rationale

* Recommendation: Alternative B now, with an implementation path compatible with later evolution to Alternative C.
* Rationale:
  * Keeps migration scope bounded to #79 goals.
  * Aligns with existing typed ActiveTile contract already defined in interaction/controller.ts.
  * Preserves current architectural boundary where sequenced collaborative state remains independent.
  * Enables deterministic, table-driven unit tests for active tile and palette transitions.
  * Avoids introducing global context complexity prematurely.

## Implementation Sketch

### Proposed State Shape

```ts
type ActiveTileUiState = {
  activeTile: ActiveTile
  palette: {
    paletteName: PaletteName
    fallbackAnnouncement: string
  }
}

type PlacementUiState = {
  ghost: GhostState
  ghostVisible: boolean
  invalidPulse: boolean
}

type GestureUiState = {
  cameraPan: { x: number; y: number }
  zoomTier: 'fine' | 'aggregate'
}
```

### Proposed Actions

```ts
type ActiveTileUiAction =
  | { type: 'set-shape'; shape: TileShape }
  | { type: 'set-material'; material: ActiveTile['material'] }
  | { type: 'set-color'; color: string }
  | { type: 'rotate-quarter'; direction: 1 | -1 }
  | { type: 'rotate-fine'; delta: number }
  | { type: 'toggle-mirror' }
  | { type: 'set-palette'; paletteName: PaletteName; color: string; fallbackAnnouncement: string }
```

### Proposed Boundary Rules

* Keep in ActiveTileUiState:
  * shape/color/material/rotation/mirrored
  * paletteName/fallbackAnnouncement
* Keep outside (transient gesture/feedback):
  * ghost, ghostVisible, invalidPulse, cameraPan, zoomTier
* Keep outside (collaborative/domain/network):
  * sequencedState, sessionId/mode/sessions/collaborators/chunk subscriptions/socket state

### Migration Sequence

1. Introduce reducer and state initialization while preserving existing prop names and external behavior.
2. Swap TilePalette callbacks to dispatch reducer actions.
3. Route keyboard/drag handlers through reducer actions.
4. Remove legacy primitive state fields and use activeTile from reducer directly.
5. Keep MosaicScene prop contract stable in first pass; optionally refactor scene prop shape in a later, isolated pass.

## Suggested Test Plan

* Add reducer unit tests:
  * set-shape/material/color transitions
  * set-palette preserve-or-fallback and announcement rules
  * rotate-quarter with quantization and rotate-fine normalization
  * toggle-mirror idempotence and reversibility
* Add App keyboard tests:
  * R and Shift+R quarter-step behavior
  * [ and ] fine-step behavior
  * F mirror toggle
  * Z undo trigger path with mocked socket ack/reject
* Add App integration assertions that active tile state remains stable through placement ack success and reject (existing tests can be adapted to new state source).
* Add explicit invalidPulse behavior test (class added then cleared after timeout).
* Add targeted interaction tests for right-button rotate and middle-button pan paths in MosaicScene (component-level pointer event tests).
* Preserve and rerun existing tests covering pointer throttling, palette fallback, and placement flow.

## Open Questions

* Should palette open/collapsed behavior be introduced in #79, or tracked as a separate follow-up? There is no current open/collapsed state implementation to consolidate.
* Should rotation/mirror live exclusively in ActiveTileUiState, or should mirrored/rotation also be represented in a separate gesture slice for future drag previews?
* Is there a canonical reference artifact (PR/commit) for issue #75 that should be cited in #79 implementation notes to close dependency traceability?

## Research Status

* Status: Complete for requested repository analysis scope.
* Blockers: None for analysis; only dependency traceability for #75 remains evidence-incomplete within inspected local artifacts.
