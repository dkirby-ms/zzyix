<!-- markdownlint-disable-file -->
# Release Changes: Canvas-First Responsive App Shell

**Related Plan**: canvas-first-responsive-app-shell-plan.instructions.md
**Implementation Date**: 2026-07-25

## Summary

Refactor the client canvas-mode shell into a canvas-first responsive architecture with a dedicated AppHeader, local CanvasActionBar, palette-focused ControlsPanel, debug-gated diagnostics, and overflow-safe responsive CSS.

## Changes

### Added

* apps/client/src/ui/AppHeader.tsx - New header component with back navigation, connection status, collaborator count, and undo affordance
* apps/client/src/ui/CanvasActionBar.tsx - New canvas-local action bar with rotate, mirror, and undo controls

### Modified

* apps/client/src/ui/ControlsPanel.tsx - Removed Transform/Edit/Keys/heading/lobby sections; now palette-focused only (`palette-region` class)
* apps/client/src/App.tsx - Added AppHeader and CanvasActionBar imports; restructured canvas branch into `canvas-workspace > canvas-shell + palette-region`; removed zoom/bounds spans from status-strip (consumer-safe only now)
* apps/client/src/App.css - Converted `.app-shell` to `grid-template-rows: auto 1fr` column-stack; added `.app-header`, `.app-header-title`, `.app-header-meta`, `.canvas-workspace`, `.canvas-action-bar`, `.palette-region` styles; removed deprecated `.controls-shell` family; hardened `.status-strip` with flex-wrap and max-width; added collaborator-chip truncation; updated 960px breakpoint; added 479px narrow zone
* apps/client/src/App.test.tsx - Added 320px viewport overflow regression test; added AppHeader/CanvasActionBar mocks; added back-navigation, component presence, and debug diagnostics-hidden tests (16/16 passing)

### Added (cont.)

* apps/client/src/config/debugFlags.ts - New env resolver for canvas debug visibility (VITE_CANVAS_DEBUG with DEV fallback)

### Modified (cont.)

* apps/client/src/App.tsx - Imported `resolveCanvasDebug`; added `canvasDebug` memo; gated `debug-overlay` behind `canvasDebug && ghostVisible`
* apps/client/src/App.tsx - Updated lobby return handler to clear `sessionId`, realtime capability state, active chunk subscriptions, and collaborator map
* apps/client/src/ui/AppHeader.tsx - Aligned title class to `.app-header-title` and grouped metadata/actions within `.app-header-meta`
* apps/client/src/App.css - Added `.return-btn`, `.collaborator-summary`, and `.connection-badge` style hooks for overflow-safe header metadata rendering
* apps/client/src/App.test.tsx - Removed AppHeader/CanvasActionBar/ControlsPanel mocks; switched assertions to real shell semantics; added debug-enabled overlay positive-path test; asserted socket/session reset after lobby return

### Removed

## Additional or Deviating Changes

* `connectionState` passed as `connectionState.status` (string) to AppHeader — the `ConnectionState` object from `useConnectionStatus` is not a plain string; spec was overly simplified
* AppHeader collaborator summary `<span>` has no `aria-label` to avoid collision with the existing `collaborator-roster` label queried by tests

## Release Summary

All four implementation phases completed successfully. 58/58 tests pass across 14 test files. Lint is clean. Production build succeeds.

**Files created (2):**
- `apps/client/src/ui/AppHeader.tsx` — canvas-mode header with back navigation, connection status, collaborator count, and undo affordance
- `apps/client/src/config/debugFlags.ts` — env resolver for `VITE_CANVAS_DEBUG` with `DEV` fallback
- `apps/client/src/ui/CanvasActionBar.tsx` — canvas-local action bar for rotate, mirror, and undo

**Files modified (4):**
- `apps/client/src/ui/ControlsPanel.tsx` — palette-only (Shape/Material/Palette); transform/edit/lobby sections removed
- `apps/client/src/App.tsx` — canvas branch restructured into `AppHeader + canvas-workspace > canvas-shell + palette-region`; debug overlay gated behind `canvasDebug`
- `apps/client/src/App.css` — canvas-first column-stack layout; new structural class rules; overflow safeguards for 320px+; deprecated `.controls-shell` removed
- `apps/client/src/App.test.tsx` — 3 new tests (AppHeader back navigation, component presence, debug diagnostics hidden); 320px overflow regression test; 16 → 58 total (all passing)

**No dependency or infrastructure changes.**

**Chunk size warning (MosaicScene 1 MB)** is pre-existing; not introduced by this change set.

## Additional Validation (2026-07-26 Rework)

* `npm run test --workspace apps/client -- App.test.tsx --run` - Pass (17/17)
* `npm run lint` - Pass
* `npm run test` - Pass
	* `apps/client`: 59/59 tests passing
	* `apps/server`: 66/66 tests passing
* `npm run build` - Pass
	* `apps/client` build pass (existing large chunk warning remains)
	* `apps/server` build pass
