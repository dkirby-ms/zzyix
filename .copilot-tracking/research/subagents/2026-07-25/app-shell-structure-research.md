---
title: App Shell Structure Research for Issue 77
description: Deep repository research on canvas-first responsive app shell composition, control/data coupling, and test coverage in apps/client
ms.date: 2026-07-25
ms.topic: reference
status: Complete
---

## Scope

Research target: issue #77 canvas-first responsive app shell in apps/client.

Research goals covered:

* Locate current shell composition and where navigation, connection status, collaborators, undo, creation/palette controls, rotate/mirror controls, and canvas diagnostics live.
* Trace data flow/props/state and coupling that could complicate moving UI elements.
* Identify tests covering lobby, collaboration, camera, placement, and undo-related behavior.
* Produce evidence-backed insertion points for `AppHeader`, palette region, `CanvasActionBar`, and debug diagnostics container.

## Evidence Log

### Current Shell Composition and Control Locations

* App mode split (`lobby` vs `canvas`) is centralized in `App` render branch: apps/client/src/App.tsx:947.
* Lobby shell container is rendered as `<main className="lobby-shell">`: apps/client/src/App.tsx:948.
* Lobby UI is delegated to `LobbyScreen`: apps/client/src/App.tsx:950.
* Canvas shell container is rendered as `<main className="app-shell">`: apps/client/src/App.tsx:964.
* Controls/sidebar is delegated to `ControlsPanel`: apps/client/src/App.tsx:967.
* Canvas rendering surface container is `<section className="canvas-shell">`: apps/client/src/App.tsx:992.
* Connection status widget appears in top status strip via `StatusIndicator`: apps/client/src/App.tsx:994.
* Collaborator chips/roster are rendered in `collaborator-roster`: apps/client/src/App.tsx:1006.
* Scene/canvas interaction component is `MosaicScene` under Suspense boundary: apps/client/src/App.tsx:1017.
* Diagnostics overlay is `debug-overlay` gated by `ghostVisible`: apps/client/src/App.tsx:1066.
* Lobby contains create/join/navigation actions and canvas preset selection in `LobbyScreen`: apps/client/src/ui/LobbyScreen.tsx:55, apps/client/src/ui/LobbyScreen.tsx:65, apps/client/src/ui/LobbyScreen.tsx:72, apps/client/src/ui/LobbyScreen.tsx:119.
* Control groups for palette, transform (rotate/mirror), edit (undo), and return-to-lobby are in `ControlsPanel`: apps/client/src/ui/ControlsPanel.tsx:89, apps/client/src/ui/ControlsPanel.tsx:117, apps/client/src/ui/ControlsPanel.tsx:131, apps/client/src/ui/ControlsPanel.tsx:133, apps/client/src/ui/ControlsPanel.tsx:140.
* Layout/style anchoring for these regions is in `App.css` (`lobby-shell`, `app-shell`, `canvas-shell`, `status-strip`, `collaborator-roster`, `debug-overlay`): apps/client/src/App.css:16, apps/client/src/App.css:154, apps/client/src/App.css:282, apps/client/src/App.css:297, apps/client/src/App.css:327, apps/client/src/App.css:409.

### Data Flow, Props, State, and Coupling

* Control state is owned in `App` (`shape`, `paletteName`, `rotation`, `mirrored`, `cameraPan`, `mode`, `collaborators`): apps/client/src/App.tsx:199, apps/client/src/App.tsx:201, apps/client/src/App.tsx:203, apps/client/src/App.tsx:204, apps/client/src/App.tsx:208, apps/client/src/App.tsx:215, apps/client/src/App.tsx:223.
* Placement payload is composed from shell state in `activeTile` memo, coupling tile behavior to app-level state: apps/client/src/App.tsx:256.
* Pointer updates simultaneously drive networking, selection, and local ghost diagnostics (`emitPointerMove`, `emitSelectionUpdate`, `updateGhostTarget`): apps/client/src/App.tsx:868.
* Undo is coupled to server identity and authorship (`isServerTileId` + `placedBy === clientId`): apps/client/src/App.tsx:923.
* Keyboard undo path and button undo path both emit `remove_tile`, creating duplicated pathways that must stay aligned: apps/client/src/App.tsx:820, apps/client/src/App.tsx:832, apps/client/src/App.tsx:930.
* `ControlsPanel` is a prop-heavy presentational component with control callbacks/state from `App`: apps/client/src/ui/ControlsPanel.tsx:5.
* Palette selection has side effects in parent (`setPaletteName` and forced first swatch color reset): apps/client/src/App.tsx:973.
* Socket connection and status are derived at app shell level (`useSocketConnection`, `useConnectionStatus`) and fed into UI (`StatusIndicator`): apps/client/src/App.tsx:612, apps/client/src/App.tsx:632, apps/client/src/App.tsx:994.
* Collaboration state is snapshot-seeded and event-updated with periodic stale signal eviction: apps/client/src/App.tsx:349, apps/client/src/App.tsx:466, apps/client/src/App.tsx:474, apps/client/src/App.tsx:482, apps/client/src/App.tsx:781.
* Camera controls are split between scene-level interaction and app-level pan state updates (`onCameraPan` transformed by `cameraPolicy.panSensitivity`): apps/client/src/App.tsx:1033.
* `MosaicScene` has a large interaction prop surface (`onPointerMove`, `onPointerDown`, `onPointerUp`, `onRotateDrag`, `onCameraPan`, viewport/zoom callbacks): apps/client/src/render/MosaicScene.tsx:57, apps/client/src/render/MosaicScene.tsx:58, apps/client/src/render/MosaicScene.tsx:59, apps/client/src/render/MosaicScene.tsx:64.
* Socket event subscription wiring is centralized in `useSocketConnection`, which binds both core tile events and collaboration/chunk events when enabled: apps/client/src/network/useSocketConnection.ts:23, apps/client/src/network/useSocketConnection.ts:66, apps/client/src/network/useSocketConnection.ts:82.

### Test Coverage with Exact References

Lobby behavior:

* Lobby-first default and no implicit auto-join: apps/client/src/App.test.tsx:127.
* Explicit join transition to canvas mode: apps/client/src/App.test.tsx:140.
* Create action transition to canvas mode with preset payload: apps/client/src/App.test.tsx:157.

Collaboration behavior:

* Snapshot seeding + pointer/join/leave/selection reconciliation: apps/client/src/App.test.tsx:177.
* Stale collaborator signal eviction logic: apps/client/src/App.test.tsx:268.
* Snapshot merge preserving transient collaborator entries: apps/client/src/App.test.tsx:299.
* Pointer/selection throttling semantics: apps/client/src/App.test.tsx:318.
* Collaboration event subscription/unsubscription in socket hook: apps/client/src/network/useSocketConnection.test.ts:36, apps/client/src/network/useSocketConnection.test.ts:163.

Camera behavior:

* Pan + zoom policy propagation to `MosaicScene`: apps/client/src/App.test.tsx:414.
* Bounded snapshot world-bounds mapping into scene: apps/client/src/App.test.tsx:435.
* Pointer validity feedback under snapshot bounds: apps/client/src/App.test.tsx:477.

Placement behavior:

* Placement solver overlap rejection/out-of-bounds/valid guided placement: apps/client/src/domain/placementSolver.test.ts:12, apps/client/src/domain/placementSolver.test.ts:42, apps/client/src/domain/placementSolver.test.ts:57.
* Geometry transform mirror+rotation behavior: apps/client/src/domain/tileGeometry.test.ts:11.
* Controller placement/reconciliation flow (place/remove/snapshot): apps/client/src/interaction/controller.test.ts:120, apps/client/src/interaction/controller.test.ts:132, apps/client/src/interaction/controller.test.ts:165.

Undo behavior:

* App-level undo handler wired to `ControlsPanel` (`onUndo`) and keybind (`z`) paths: apps/client/src/App.tsx:820, apps/client/src/App.tsx:923, apps/client/src/App.tsx:986.
* Undo attribution continuity through snapshot (`placedBy`) for reconnect/resync scenarios: apps/client/src/interaction/controller.test.ts:410.
* Client-specific tile filtering basis for undo targeting: apps/client/src/interaction/controller.test.ts:421.

Connection status diagnostics behavior:

* `useConnectionStatus` lifecycle tests (connect/disconnecting transitions): apps/client/src/network/useConnectionStatus.test.ts:40, apps/client/src/network/useConnectionStatus.test.ts:59.
* `StatusIndicator` behavior coverage (error tooltip vs non-error states): apps/client/src/ui/StatusIndicator.test.tsx:10, apps/client/src/ui/StatusIndicator.test.tsx:11, apps/client/src/ui/StatusIndicator.test.tsx:29.

## Key Discoveries

* The app shell is already split at a high level (`lobby` branch vs `canvas` branch), but canvas-mode UI remains concentrated inside `App.tsx` with tightly interwoven control, diagnostics, and scene wiring.
* Navigation and creation controls are currently in `LobbyScreen` and `ControlsPanel`; there is no dedicated `AppHeader` abstraction today.
* `StatusIndicator`, confidence/metrics strip entries, collaborator roster, and debug diagnostics are all overlaid in the canvas container and currently assembled inline in `App.tsx`.
* Undo behavior has dual entry points (keyboard and button) and depends on authorship semantics (`placedBy`) and server tile identity; this is coupling-sensitive during UI movement.
* Camera, collaboration, chunk subscriptions, and diagnostics all terminate in app-level state, so moving visual components without extracting hook/view-model boundaries can cause prop plumbing growth and callback drift.

## Risks

* Prop drilling risk: `ControlsPanel` and `MosaicScene` already consume wide prop surfaces; moving controls without introducing composition boundaries could increase coupling and fragility.
* Behavior drift risk: duplicate undo pathways (keybind + button) can diverge if `CanvasActionBar` centralizes one path without sharing command logic.
* Diagnostics regression risk: `status-strip` currently combines connection, placement confidence, tile count, collaborator count, zoom tier, and bounds. Splitting these into new components risks losing synchronization unless sourced from one view-model.
* Collaboration visibility risk: collaborator chips and remote cursor/selection overlays are fed by different render paths (DOM overlay vs WebGL scene), so partial refactors may cause inconsistent presence feedback.
* Camera interaction risk: camera pan/zoom and viewport callbacks cross scene/app boundary; relocating controls that trigger camera changes must preserve sensitivity and callback semantics.

## Candidate Insertion Points

### AppHeader

* Candidate insertion point: canvas branch, directly inside `<main className="app-shell">` before `ControlsPanel` and `canvas-shell`: apps/client/src/App.tsx:964.
* Candidate scope: host top-level navigation (`Return to Lobby`), session/canvas label, and connection status summary that is currently split between `ControlsPanel` and `status-strip`.
* Migration note: move `onReturnToLobby` ownership from `ControlsPanel` call site to `AppHeader` first, then remove duplicated navigation surface from sidebar.

### Palette Region

* Candidate insertion point A: keep in sidebar by extracting from `ControlsPanel` section beginning at palette heading: apps/client/src/ui/ControlsPanel.tsx:89.
* Candidate insertion point B: if canvas-first flow requires near-canvas palette access, move to a dedicated panel adjacent to `canvas-shell` while preserving parent-owned `paletteName`, `color`, and reset rule in `App`: apps/client/src/App.tsx:201, apps/client/src/App.tsx:973.

### CanvasActionBar

* Candidate insertion point: inside `canvas-shell`, above `MosaicScene` and below/alongside status strip to house rotate/mirror/undo actions currently in `ControlsPanel`: apps/client/src/App.tsx:992, apps/client/src/App.tsx:1017.
* Source actions to migrate: rotate ±90, fine rotate ±15, mirror, undo callbacks currently passed to `ControlsPanel`: apps/client/src/App.tsx:979, apps/client/src/App.tsx:980, apps/client/src/App.tsx:981, apps/client/src/App.tsx:982, apps/client/src/App.tsx:983, apps/client/src/App.tsx:986.
* Coupling caution: ensure this action bar reuses the same command functions backing keyboard shortcuts (`r`, `f`, `z`) for parity: apps/client/src/App.tsx:806, apps/client/src/App.tsx:816, apps/client/src/App.tsx:820.

### Debug Diagnostics Container

* Candidate insertion point: replace inline `debug-overlay` block with a dedicated component mounted where current overlay is rendered (ghost-visible conditional): apps/client/src/App.tsx:1066.
* Data inputs to preserve: confidence, debug reason, target position, placed tile count from `ghost` and `sequencedState`: apps/client/src/App.tsx:1069, apps/client/src/App.tsx:1074, apps/client/src/App.tsx:1079, apps/client/src/App.tsx:1084.
* Styling continuity anchor: keep `debug-overlay`/`debug-row` class contract unless intentionally redesigning: apps/client/src/App.css:409, apps/client/src/App.css:425.

## Open Questions

* Should `AppHeader` exist in both lobby and canvas modes, or only in canvas mode with lobby-specific controls staying in `LobbyScreen`?
* Should undo be exposed in both sidebar and action bar during transition, or moved atomically to prevent duplicate affordances?
* Is the `status-strip` intended to remain lightweight (connection + counts) while verbose diagnostics move entirely to debug container?
* For canvas-first responsive behavior, should palette controls prioritize thumb-reachable bottom action regions on small screens, or remain grouped with shape/material in a collapsible side panel?
* Should keyboard shortcut command handlers be extracted to shared command functions before UI relocation to reduce parity risk?
