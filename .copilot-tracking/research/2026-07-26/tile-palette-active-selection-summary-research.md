<!-- markdownlint-disable-file -->
# Task Research: Tile Palette and Active Selection Summary (Issue #76)

Research for implementing a focused Tile Palette UX that groups tile type, color, and material controls in creation order and keeps active selection visible at all times.

## Task Implementation Requests

* Design and implement a dedicated TilePalette interaction model for shape, color, and material.
* Preserve/define deterministic theme-switch color fallback behavior with accessibility announcement.
* Ensure selected tile state persists after successful placement and validate with tests/docs updates.

## Scope and Success Criteria

* Scope: Client-side UI architecture, state flow, accessibility semantics, and tests for palette behavior. Out of scope: free-form color picker, favorites/recent combos, introducing new material types.
* Assumptions:
  * Issue dependencies (#75 and #78) are either complete or can be accounted for via integration assumptions.
  * Existing client has modular UI/state layers for control panel and placement state that can be extended.
  * Accessibility testing expectations are aligned with current test stack in apps/client.
* Success Criteria:
  * Evidence-backed map of current palette/theme/material/tile state flow and where to modify it.
  * At least two viable implementation alternatives evaluated with one selected approach.
  * Concrete implementation guidance with file-level references, test strategy, and pitfalls.

## Outline

1. Collect current UI composition and state ownership for tile, color, material, and theme.
2. Analyze existing accessibility patterns (selected/focus/hover/pressed semantics and announcements).
3. Identify placement lifecycle behavior to confirm state persistence after successful placement.
4. Evaluate implementation alternatives for introducing TilePalette and summary surface.
5. Select approach and produce actionable implementation handoff.

## Potential Next Research

* Confirm product keyboard contract for segmented controls (arrow-roving vs tab-only).
  * Reasoning: Final semantics influence component choice (button group vs radiogroup behavior).
  * Reference: apps/client/src/ui/primitives/ToggleGroup.tsx, apps/client/src/ui/ControlsPanel.tsx
* Confirm whether active summary updates require live announcements or visual-only updates.
  * Reasoning: Impacts additional live-region implementation and test surface.
  * Reference: apps/client/src/ui/CanvasLoadingFallback.tsx, apps/client/src/App.tsx

## Supplemental Planning Research

* Added follow-up findings in .copilot-tracking/research/subagents/2026-07-26/tile-palette-active-selection-summary-planning-research.md.
* Keyboard contract guidance: current ControlsPanel implies tab-only behavior today, while the existing ToggleGroup primitive supports a stronger radio-like single-select model for material and palette rows.
* Announcement guidance: keep the active summary visual-only and reserve live announcements for automatic fallback color changes.
* Documentation targets: apps/client/README.md and apps/client/IMPLEMENTATION_NOTES.md should be updated when TilePalette replaces ControlsPanel behavior.

## Research Executed

### File Analysis

* apps/client/src/App.tsx
  * Canvas-mode composition order is AppHeader -> CanvasActionBar -> overlays -> MosaicScene -> ControlsPanel (lines 955-1093).
  * Active selection inputs are App-owned state: shape/material/paletteName/color (lines 202-205).
  * Active placement payload derives from activeTile memo (lines 260-269).
  * Palette change currently forces color reset to first swatch: setColor(palettes[name][0]) (lines 1087-1090).
  * Placement success path does not reset palette controls after ack (lines 893-927).
* apps/client/src/ui/ControlsPanel.tsx
  * Current grouping includes Shape, Material, Palette, Color swatches in creation-like order (lines 30-89).
  * Selected visuals are class-based (active), without explicit aria-pressed/aria-selected for these controls (lines 39, 55, 71, 85).
* apps/client/src/ui/palettes.ts
  * Palette names and swatch arrays are static and deterministic (lines 1-8).
* apps/client/src/interaction/controller.ts
  * tryPlaceTile copies activeTile shape/color/material into placed tile candidate (lines 232-246).
* apps/client/src/App.css
  * 44px tokenized target applied to button and swatch sizing via var(--touch-target-min) (lines 284-293, 324-328).
  * Selected swatch visual cue is .swatch.active ring (lines 331-334).
* apps/client/src/styles/tokens/primitives.css
  * --touch-target-min is 44px (line 63).
* apps/client/src/ui/primitives/ToggleGroup.tsx
  * Existing segmented/radio primitive already available for material and palette selection semantics.
* apps/client/src/ui/CanvasLoadingFallback.tsx and apps/client/src/App.tsx
  * Existing announcement pattern: role=status + aria-live=polite for loading; role=alert for hard error fallback.

### Code Search Results

* Search term: onPaletteName
  * Match: apps/client/src/App.tsx:1087-1090 confirms deterministic first-swatch fallback behavior.
* Search term: activeTile
  * Match: apps/client/src/App.tsx:260-269 and usage in placement path at 893-917.
* Search term: swatch active
  * Match: apps/client/src/App.css:331-334 confirms selected swatch cue.
* Search term: aria-pressed
  * Match: apps/client/src/ui/LobbyScreen.tsx shows existing explicit selected-state pattern not used in ControlsPanel.
* Search term: role=\"status\"|role=\"alert\"
  * Match: apps/client/src/ui/CanvasLoadingFallback.tsx and apps/client/src/App.tsx (CanvasErrorBoundary).

### External Research

* None required. Repository-local evidence sufficiently answers the technical scenario.

### Project Conventions

* Standards referenced: existing React component decomposition (App orchestration + presentational controls), tokenized CSS architecture, role/name-first RTL test style.
* Instructions followed: Task Research mode workflow with subagent-only research delegation.

## Key Discoveries

### Project Structure

* UI orchestration is centralized in apps/client/src/App.tsx with presentational child controls.
* Palette source-of-truth data is in apps/client/src/ui/palettes.ts.
* Control visuals are primarily in apps/client/src/App.css and token files under apps/client/src/styles/tokens/.
* Existing primitives for semantically rich segmented controls live in apps/client/src/ui/primitives/.

### Implementation Patterns

* Stateful container + dumb controls: ControlsPanel emits callbacks, App owns mutation/state.
* Placement pipeline preserves active control state across successful placements (no reset branch).
* Accessibility semantics currently strong in some surfaces (loading/error/primitives) but weaker in ControlsPanel selected-state metadata.
* Token-driven minimum touch size already satisfies 44px swatch requirement if retained during refactor.

### Complete Examples

```tsx
const [paletteName, setPaletteName] = useState<PaletteName>("warm");
const [color, setColor] = useState<string>(palettes.warm[0]);

const activeTile = useMemo(
  () => ({
    shape,
    color,
    rotation,
    mirrored,
    material,
  }),
  [shape, color, rotation, mirrored, material],
);

<ControlsPanel
  shape={shape}
  material={material}
  paletteName={paletteName}
  color={color}
  onShape={setShape}
  onMaterial={setMaterial}
  onPaletteName={(name) => {
    setPaletteName(name);
    setColor(palettes[name][0]);
  }}
  onColor={setColor}
/>
```

### API and Schema Documentation

* TileShape and MaterialVariant domain types: apps/client/src/domain/tileGeometry.ts:4-6.
* ControlsPanel contract boundary: apps/client/src/ui/ControlsPanel.tsx:5-14.
* Segmented primitive contract option: apps/client/src/ui/primitives/ToggleGroup.tsx.

### Configuration Examples

```text
--touch-target-min: 44px  (apps/client/src/styles/tokens/primitives.css:63)
.swatch min-height/min-width: var(--touch-target-min)  (apps/client/src/App.css:324-328)
button min-height/min-width: var(--touch-target-min)   (apps/client/src/App.css:284-293)
```

## Technical Scenarios

### Tile Palette Integration Strategy

Current implementation already has shape/material/palette/swatch controls but lacks a dedicated active-selection summary and deterministic color-preservation policy during palette switch. It also relies on visual-only selected states for core palette controls.

**Requirements:**

* Group tile, color, and material controls in creation order.
* Keep active tile summary persistently visible.
* Preserve selected state after placement.
* Theme switch keeps active color when possible with explicit/announced fallback.
* Material control exposes selected/hover/focus/pressed states.

**Preferred Approach:**

* Refactor ControlsPanel into a dedicated TilePalette surface that reuses existing App state ownership, upgrades material/palette controls to segmented single-select semantics, introduces named swatches with explicit selected indicators, and implements color-preserving palette-switch policy with announced explicit fallback.

```text
apps/client/src/ui/
  TilePalette.tsx                    # new dedicated component replacing ControlsPanel internals
  TilePalette.test.tsx               # focused a11y/interaction tests
apps/client/src/App.tsx              # compose TilePalette + active summary + fallback announcer state
apps/client/src/App.css              # tile palette styles, selected/check states, 44px swatches retained
apps/client/src/ui/palettes.ts       # optional: add accessible display names per swatch
apps/client/src/App.test.tsx         # integration tests for persistence + theme fallback announcement
```

**Implementation Details:**

1. Keep App as the single source of truth for shape/material/paletteName/color to minimize regression risk.
2. Add palette-switch handler policy:
   * If current color exists in target palette, preserve it.
   * Else choose deterministic fallback (recommended: first swatch) and set an announcement message.
3. Add a lightweight live-region announcer in App for fallback events only (aria-live="polite", role="status").
4. Add active selection summary directly under TilePalette controls:
   * Shape label, material label, palette name, and selected color name.
   * Keep summary visible without expanding/collapsing additional UI.
5. For material controls, use existing ToggleGroup primitive in single-select mode to guarantee selected/hover/focus/pressed states with semantic role coverage.
6. For swatches, keep 44px touch targets and add:
   * check indicator for selected swatch,
   * accessible human-readable name (not hex only),
   * aria-pressed=true (or radiogroup semantics if swatches also move to ToggleGroup).
7. Preserve post-placement selection behavior (already true) and add explicit tests as regression guard.
8. Testing plan:
   * Component tests for TilePalette semantics and keyboard interaction.
   * App integration test for palette switch preserve-or-fallback behavior and announcement.
   * App integration test that placement success leaves active palette state unchanged.

```tsx
const handlePaletteChange = (name: PaletteName) => {
  setPaletteName(name);
  const next = palettes[name];
  const preserved = next.includes(color) ? color : next[0];
  setColor(preserved);

  if (preserved !== color) {
    setPaletteAnnouncement(
      `Palette changed to ${name}. ${colorName(color)} unavailable; selected ${colorName(preserved)}.`,
    );
  }
};

// Summary stays visible at all times in the palette region.
<section aria-label="Active tile summary">
  <p>Shape: {shape}</p>
  <p>Material: {material}</p>
  <p>Palette: {paletteName}</p>
  <p>Color: {colorName(color)}</p>
</section>
```

#### Considered Alternatives

### Alternative A: Minimal patch on existing ControlsPanel (Not selected)

* Description: Keep ControlsPanel intact and only add summary panel plus improved aria attributes/check mark and preserve-or-fallback palette logic.
* Benefits: Lowest code churn, fastest delivery.
* Trade-offs: Harder to maintain long-term if issue #76 is part of larger UX reorganization; may retain mixed concerns and naming mismatch with "TilePalette" objective.
* Rejection reason: Issue explicitly calls for dedicated TilePalette grouping and stronger interaction semantics; incremental patch risks partial alignment.

### Alternative B: Full migration to primitive-driven segmented/radio architecture for shape, material, and swatches (Not selected)

* Description: Replace all control rows with ToggleGroup-based semantic controls and rework CSS around primitive state attributes.
* Benefits: Strong a11y semantics and consistent keyboard behavior.
* Trade-offs: Larger refactor surface and higher regression risk in one iteration.
* Rejection reason: Over-scoped for current acceptance criteria; best deferred after the focused TilePalette extraction.

### Selected approach

* Hybrid extraction: introduce dedicated TilePalette component now, reuse existing state ownership and styling tokens, apply primitive semantics where highest value (material segmented control first), and implement deterministic preserve-or-fallback palette change with explicit announcement.

Rationale:

* Meets all acceptance criteria with bounded risk.
* Preserves proven placement data path and post-placement persistence behavior.
* Adds clear migration path for future semantic upgrades without blocking delivery.
