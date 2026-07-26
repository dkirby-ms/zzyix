# CSS & Component Styling Analysis — zzyix Client App

**Date:** 2026-07-25
**Status:** Complete
**Scope:** `apps/client/src/`

---

## 1. CSS Files Inventory

### `apps/client/src/index.css` (9 lines)

Minimal global reset only:

```css
html, body, #root {
  margin: 0;
  padding: 0;
  min-height: 100%;
}
body {
  min-width: 320px;
}
```

No typography, no custom properties here.

---

### `apps/client/src/App.css` (~435 lines)

The primary stylesheet. Covers everything: layout shells, buttons, lobby, canvas area, debug overlay, responsive breakpoints.

**Key sections:**

- **Lines 1–11** — Google Fonts import (`Fraunces` serif + `Sora` sans-serif) and `:root` custom properties block.
- **Lines 13–14** — `* { box-sizing: border-box }` universal box model.
- **Lines 16–50** — `.lobby-shell` — full-page grid centering for the lobby view.
- **Lines 32–50** — `.lobby-panel` — glazed frosted-glass card.
- **Lines 51–200** — All lobby child classes: `.lobby-header`, `.lobby-actions`, `.lobby-create-config`, `.lobby-preset-grid`, `.lobby-preset`, `.lobby-error`, `.lobby-empty`, `.lobby-list`, `.lobby-row`, `.lobby-meta`, `.lobby-chip`.
- **Lines 201–210** — `.app-shell` — two-column grid (sidebar + canvas).
- **Lines 211–220** — `.backdrop-gradient` — fixed full-page decorative radial-gradient background.
- **Lines 221–240** — `.controls-shell` — frosted sidebar panel.
- **Lines 200–215** — `.controls-shell h2` section headers.
- **Lines 216–240** — `.shape-grid`, `.pill-row`, `.rotation-display`.
- **Lines 230–260** — **Global `button` styles** (pill shape, translucent warm background).
  - `button:hover` — `translateY(-1px)`, no explicit `:focus-visible` rule.
  - `button.active` — warm gradient highlight.
  - `button:disabled` — `opacity: 0.45`, `cursor: not-allowed`.
- **Lines 262–275** — `.color-row` + `.swatch` + `.swatch.active` (outline highlight).
- **Lines 276–310** — `.canvas-shell` (Three.js canvas container), `.status-strip`, `.collaborator-roster`, `.collaborator-chip`.
- **Lines 325–360** — `.invalid-pulse` animation, `.hint-list` styles.
- **Lines 361–395** — `@media (max-width: 960px)` responsive overrides — lobby goes single-column, app shell switches to `grid-template-rows`, controls limited to `34dvh`.
- **Lines 400–435** — `.debug-overlay` and related debug classes (dark overlay, not visible in production UI).

---

### `apps/client/src/ui/StatusIndicator.css` (~95 lines)

Component-scoped CSS file (imported directly in `StatusIndicator.tsx`).

- `.status-indicator` — flex row, `padding: 8px 12px`, `border-radius: 4px`, `font-size: 12px`.
- `.status-dot` — `8×8px` circle with `pulse-dot` keyframe animation (opacity 1 → 0.6).
- Five state variants — `.status-connected`, `.status-connecting`, `.status-reconnecting`, `.status-error`, `.status-disconnected`, `.status-unknown`.
  - Each uses hardcoded RGBA colors (`#4caf50`, `#ffc107`, `#ff9800`, `#f44336`, `#9e9e9e`, `#646464`) — **not** using any CSS custom properties or design tokens.
- `.status-text` — `white-space: nowrap`, overflow ellipsis.

---

## 2. CSS Custom Properties (Variables)

Defined **only** in `App.css :root` (lines 3–10):

```css
:root {
  --ink:          #2f251f;
  --warm:         #f6ecdd;
  --panel:        rgba(247, 240, 227, 0.78);
  --panel-border: rgba(75, 56, 42, 0.18);
  --accent:       #ca7a4c;
  --radius:       18px;
}
```

Usage within App.css:
- `--ink` → `.lobby-shell` and `.app-shell` text color.
- `--warm` → not directly applied (defined but unused in App.css body — available for future use).
- `--panel` → `.lobby-panel`, `.controls-shell` background.
- `--panel-border` → `.lobby-panel`, `.controls-shell` border color.
- `--accent` → not directly applied (defined but unused inline — available for future use).
- `--radius` → `.lobby-panel`, `.controls-shell`, `.canvas-shell` border-radius.

**StatusIndicator.css uses zero custom properties** — all colors are hardcoded hex/rgba literals.

---

## 3. Component Files

### `apps/client/src/ui/`

| File | Description |
|---|---|
| `ControlsPanel.tsx` | Sidebar panel with shape/material/palette/color pickers, rotation controls, undo/clear, return to lobby. All styling via `App.css` class names (`.controls-shell`, `.shape-grid`, `.pill-row`, `.color-row`, `.swatch`, `.hint-list`). Pure functional component. |
| `LobbyScreen.tsx` | Full-screen lobby listing available sessions. Uses `.lobby-panel`, `.lobby-header`, `.lobby-actions`, `.lobby-preset-grid`, `.lobby-preset`, `.lobby-row`, `.lobby-meta`, `.lobby-chip`. Includes `aria-live="polite"` and `aria-pressed` on preset buttons. Functional component (named export). |
| `StatusIndicator.tsx` | Connection state badge. Imports `./StatusIndicator.css`. Maps `ConnectionState` union to display text + class names. Uses `React.FC<StatusIndicatorProps>`. Has `title` attribute (tooltip via native browser). |
| `palettes.ts` | Color data only — four named palettes (`terracotta`, `lagoon`, `dusk`, `quarry`), each with 5 hex swatches. Exports `PaletteName` type and `getCollaboratorColor(clientId)` hash function. |
| `icons/` | Directory with subdirs `actions/`, `navigation/`, `social/`, `status/` — all **empty** as of this analysis. |

### `apps/client/src/render/`

| File | Description |
|---|---|
| `MosaicScene.tsx` | Three.js canvas component via `@react-three/fiber`. Handles 3D tile rendering, camera (orthographic), OrbitControls, pointer events, ghost tile, remote cursors/selections. No CSS — fully canvas-based. |
| `materials.ts` | Three.js `MeshStandardMaterial` definitions for ceramic/glass/stone tile surfaces and remote selection highlight material. No CSS. |

### `apps/client/src/interaction/`

| File | Description |
|---|---|
| `controller.ts` | Pure domain logic — ghost tile state machine, optimistic placement reconciliation, sequenced snapshot application. No React, no CSS. |
| `controller.test.ts` | Unit tests for `controller.ts`. |

---

## 4. Package Dependencies

From `apps/client/package.json`:

### Runtime dependencies

```json
{
  "@react-three/drei": "^10.7.7",
  "@react-three/fiber": "^9.6.1",
  "react": "^19.2.7",
  "react-dom": "^19.2.7",
  "socket.io-client": "^4.8.2",
  "three": "^0.185.1",
  "zustand": "^5.0.14"
}
```

**No UI component library** (no Radix, MUI, shadcn, Chakra, Ant Design, etc.).
**No CSS-in-JS** (no styled-components, emotion, vanilla-extract, etc.).
**No design system** tokens package.
**No CSS utility framework** (no Tailwind, UnoCSS, etc.).

The entire UI is hand-crafted plain CSS.

### Dev dependencies (relevant)

```json
{
  "vite": "^8.1.1",
  "typescript": "~7.0.2",
  "vitest": "^4.1.10",
  "@testing-library/react": "^16.3.2"
}
```

---

## 5. App.tsx Structure

- ~1000-line functional component `App()`.
- All hooks at top level: `useState`, `useCallback`, `useMemo`, `useRef`, `useEffect`.
- State managed locally in `App` (no zustand used in UI layer — zustand is installed but appears unused by the React tree).
- Two render branches:
  - **Lobby mode** (`mode === 'lobby'`): renders `<main className="lobby-shell">` → `<LobbyScreen>`.
  - **Canvas mode**: renders `<main className="app-shell">` → `<ControlsPanel>` + `<section className="canvas-shell">` → `<MosaicScene>`.
- `StatusIndicator` rendered in the canvas-mode status strip (line ~947).
- `ControlsPanel` — arrow function component, named export.
- `LobbyScreen` — named function export.

---

## 6. Interactive Component Implementations

| Pattern | Implementation |
|---|---|
| **Buttons** | Native `<button>` elements styled globally in `App.css` (lines 230–260). No custom component abstraction. |
| **Tooltips** | None implemented. `StatusIndicator` uses `title` attr (native browser tooltip only). |
| **Dialogs / Modals** | None implemented. |
| **Dropdowns / Select** | None. |
| **Tabs** | None. |
| **Toasts / Alerts** | None. Errors shown as inline `<p className="lobby-error">` text. |
| **Color Picker** | Custom swatch grid — `.color-row` with `.swatch` buttons. |
| **Focus Management** | No `focus-trap`, no programmatic focus management. |
| **Icons** | `ui/icons/` subdirs exist but are all empty — no icon system in place. |

---

## 7. Global CSS Reset / Base Typography

- **Reset**: Minimal — `margin: 0`, `padding: 0`, `min-height: 100%` on `html/body/#root` in `index.css`. No full reset (no `normalize.css`, no `@layer base`).
- **Box model**: `* { box-sizing: border-box }` in `App.css`.
- **Base font**: Set on layout shells (`.lobby-shell`, `.app-shell`) via `font-family: 'Sora', sans-serif;` — NOT set on `body`. `Fraunces` serif applied to `h1` headings only.
- **No base line-height** set globally.
- **No base font-size** on `:root` or `body` — relies on browser default (typically 16px).

---

## 8. Color Palette / Spacing Approach

### Colors

**Warm earth tones** — the design language is a warm, parchment/terracotta aesthetic:

| Token | Value | Used for |
|---|---|---|
| `--ink` | `#2f251f` | Text |
| `--warm` | `#f6ecdd` | (defined, not directly applied) |
| `--panel` | `rgba(247,240,227,0.78)` | Panel backgrounds |
| `--panel-border` | `rgba(75,56,42,0.18)` | Panel borders |
| `--accent` | `#ca7a4c` | (defined, not directly applied inline) |
| Button active | `linear-gradient(120deg, #ffd7b0, #f3b78c)` | Hardcoded in button rule |
| Backdrop | `#ebe3d1`, `#d9d2c4`, etc. | Hardcoded in `.backdrop-gradient` |

**StatusIndicator colors are entirely separate** — Material Design-inspired greens/yellows/reds, completely outside the warm palette.

### Spacing

- All spacing is **hardcoded `rem`/`px` values** — no spacing scale tokens.
- Common values: `0.5rem`, `0.72rem`, `0.86rem`, `1rem`, `1.2rem`.
- No consistent spacing scale (8px grid, 4px grid, etc.).
- Border radii: `--radius: 18px` for panels; `999px` for pills; `12px`, `14px` hardcoded elsewhere.

---

## 9. Focus Styles / Touch-Target Considerations

- **No `:focus-visible` styles** anywhere in the codebase.
- **No `:focus` styles** other than browser defaults.
- **No `touch-action` declarations**.
- **No `min-height: 44px`** touch target enforcement.
- Button padding: `0.5rem 0.82rem` → at 16px base ≈ 8px × 13px vertical padding — buttons likely meet 44px touch target height when content is present, but not explicitly enforced.
- `.swatch` has `min-height: 36px` — **below** the 44px WCAG touch target recommendation.

---

## 10. TypeScript/React Component Patterns

- **All functional components** — no class components.
- **Arrow function components** (`export const Foo = (props) => { ... }`) for `ControlsPanel` and `StatusIndicator`.
- **Named function components** (`export function LobbyScreen`) for `LobbyScreen`.
- **`React.FC<Props>` typing** used on `StatusIndicator` only.
- **Plain typed props** (destructured inline) used on `ControlsPanel` and `LobbyScreen`.
- **Hooks used in App.tsx**: `useState`, `useCallback`, `useMemo`, `useRef`, `useEffect`.
- **No `useContext`** — no React Context in use.
- **No custom hook abstractions** for UI concerns (focus, theme, etc.).
- **Prop drilling** — state flows down from `App` to `ControlsPanel` and `LobbyScreen` via props.
- **CSS Modules NOT used** — all classNames are global BEM-ish strings from `App.css`.

---

## Migration Risk Assessment

### Global CSS Changes — What Would Break

| Change | Risk | Components Affected |
|---|---|---|
| Modifying global `button` styles | **HIGH** — affects every button in `ControlsPanel`, `LobbyScreen`, all lobby actions | All buttons (approx. 15–20 instances) |
| Adding `:root` custom properties | **LOW** — additive, nothing would break | None |
| Removing `--radius`, `--panel`, etc. | **HIGH** — used across `.lobby-panel`, `.controls-shell`, `.canvas-shell` | Layout shells |
| Changing `font-family` on shells | **MEDIUM** — would cascade to all text in UI | `.lobby-shell`, `.app-shell` descendants |
| Changing `.pill-row` layout | **MEDIUM** — affects material/palette/transform/edit sections in ControlsPanel | ControlsPanel sections |
| Changing `.swatch` sizing | **LOW-MEDIUM** — visual change only, no logic coupling | Color picker swatches |
| Replacing plain CSS with Tailwind | **HIGH** — would require rewriting all class names in all JSX | All components |
| Adding CSS Modules | **HIGH** — file-by-file migration, global classNames must be preserved or renamed | All components |
| Extracting button as component | **LOW** — no logic coupling, pure styling | Drop-in replacement |

### StatusIndicator isolation
StatusIndicator.css is component-scoped and imported locally — changes there affect only that one component.

### No external CSS dependencies
There are no third-party CSS frameworks to audit for breaking changes. All risk is self-contained.

---

## Key File References

| File | Lines | Significance |
|---|---|---|
| `apps/client/src/App.css` | 3–10 | Only `:root` custom properties |
| `apps/client/src/App.css` | 230–260 | Global `button` styles (hover, active, disabled) |
| `apps/client/src/App.css` | 262–275 | `.swatch` — 36px min-height (below 44px touch target) |
| `apps/client/src/App.css` | 361–395 | `@media (max-width: 960px)` responsive breakpoint |
| `apps/client/src/ui/StatusIndicator.css` | 1–95 | Hardcoded color palette separate from design tokens |
| `apps/client/src/ui/ControlsPanel.tsx` | 1–145 | All button patterns, aria-label on color swatches |
| `apps/client/src/ui/LobbyScreen.tsx` | 67–85 | `aria-pressed` on preset buttons (good pattern) |
| `apps/client/src/ui/StatusIndicator.tsx` | 1–37 | `title` attr for tooltip (browser-native only) |
| `apps/client/src/App.tsx` | 898–985 | App render tree — lobby branch and canvas branch |
