<!-- markdownlint-disable-file -->
# Task Research: UX Design Tokens and Accessible UI Primitives

Establish the shared visual tokens and accessible component primitives needed for the UX overhaul in issue #72 (zzyix project). This research covers semantic CSS tokens, accessible component primitives (Radix UI or equivalent), icon conventions, and reduced-motion support.

## Task Implementation Requests

* Shared CSS tokens: color, spacing, radius, elevation, typography, focus, and motion
* Accessible primitives: tooltip, dialog, alert dialog, toggle group, tabs, toast, visually hidden labels
* Icon convention established
* Reduced-motion support via `prefers-reduced-motion`
* Minimum 44×44 px touch targets and visible keyboard focus indicators
* Scoped component styles to avoid disrupting existing lobby/canvas controls

## Scope and Success Criteria

* Scope: `apps/client/src/` CSS and component layer only; no server changes; no domain-specific tile picker or palette layout
* Assumptions: React + TypeScript + Vite stack; existing global CSS in `App.css` and `index.css`; no design-system library currently adopted
* Success Criteria:
  * CSS custom properties cover all token categories (color, spacing, radius, elevation, typography, focus, motion)
  * Accessible primitives adopted without introducing a competing full visual theme
  * Existing lobby and canvas controls retain current behavior
  * Keyboard focus visible, touch targets ≥ 44×44 px
  * `prefers-reduced-motion` media query respected

## Outline

1. Current CSS / styling state in `apps/client/src/`
2. Existing component structure and any existing design primitives
3. Candidate libraries: Radix UI primitives, shadcn/ui, CSS Modules vs. CSS custom properties
4. Token architecture options
5. Selected approach with rationale
6. Implementation file tree

## Potential Next Research

* Existing CSS globals and any CSS variable usage
  * Reasoning: understand scope of migration risk
  * Reference: apps/client/src/App.css, apps/client/src/index.css
* Radix UI primitives API and bundle impact
  * Reasoning: primary candidate for accessible primitives
  * Reference: https://www.radix-ui.com/primitives
* Current package.json to understand installed dependencies
  * Reasoning: avoid redundant installs; check for existing UI libraries

## Research Executed

### File Analysis

* apps/client/src/index.css (9 lines)
  * Minimal reset only: margin/padding/min-height on html, body, #root; min-width: 320px on body
  * Zero custom properties, no typography
* apps/client/src/App.css (~435 lines)
  * Lines 1–11: Google Fonts import (Fraunces + Sora) and `:root` with only 6 CSS custom properties
  * Lines 230–260: **Global `button` styles** — pill shape, translateY hover, no `:focus-visible`
  * Lines 262–275: `.swatch` buttons with `min-height: 36px` (below 44px WCAG minimum)
  * Lines 325–360: `.invalid-pulse` animation (no reduced-motion guard)
  * Lines 361–395: `@media (max-width: 960px)` responsive breakpoints
* apps/client/src/ui/StatusIndicator.css (~95 lines)
  * All colors are hardcoded hex/rgba (`#4caf50`, `#ffc107`, etc.) — zero CSS custom property usage
* apps/client/package.json
  * Dependencies: React 19, Three.js/R3F, socket.io-client, zustand — **no UI library, no CSS-in-JS, no Tailwind**
  * icons/ directory exists with subdirs (actions/, navigation/, social/, status/) — all empty

### Code Search Results

* Existing CSS custom properties in App.css :root (lines 3–10):
  * `--ink: #2f251f` — used as text color
  * `--warm: #f6ecdd` — defined but not applied inline
  * `--panel: rgba(247, 240, 227, 0.78)` — used on .lobby-panel, .controls-shell
  * `--panel-border: rgba(75, 56, 42, 0.18)` — used on panels
  * `--accent: #ca7a4c` — defined but not applied inline
  * `--radius: 18px` — used on panels and canvas shell
* LobbyScreen.tsx: has `aria-live="polite"` and `aria-pressed` on preset buttons — good baseline
* ControlsPanel.tsx: all native `<button>` elements, no ARIA roles
* StatusIndicator.tsx: uses `title` attribute for tooltip only (browser-native, no custom tooltip)

### External Research

* W3C DTCG stable spec (October 2025): two-tier token model (primitive → semantic)
  * Source: [Design Tokens Community Group](https://www.w3.org/community/design-tokens/)
* Radix UI primitives: [radix-ui.com/primitives](https://www.radix-ui.com/primitives)
  * All required primitives covered: Tooltip, Dialog, Alert Dialog, Toggle Group, Tabs, Toast
  * Installed as `npm install radix-ui` (unified, tree-shakeable)
  * Completely headless — styled via `className` and `[data-state="*"]` CSS attribute selectors
  * WAI-ARIA compliant: Dialog focus-traps + Escape, Tabs roving tabindex, ToggleGroup roving tabindex, Tooltip hover/focus/Escape
  * ~4–6 KB gzip per primitive; shared internals reduce marginal cost per additional primitive
* lucide-react: uses `currentColor`, enabling CSS token-based icon coloring with no extra props

### Project Conventions

* Pure hand-crafted global CSS — no CSS Modules, no CSS-in-JS
* All class names are global strings (e.g., `.lobby-panel`, `.controls-shell`)
* Migration must be additive: existing class names preserved; new token variables added to `:root`

## Key Discoveries

### Project Structure

No existing design system, no UI library, no icon library. Three CSS files: a 9-line reset, a 435-line global stylesheet, and a 95-line component-scoped CSS file for StatusIndicator. Only 6 CSS custom properties defined, 2 of which go unused inline. The icons/ directory tree exists but is empty — an intentional placeholder awaiting this work item.

### Implementation Patterns

Global button styles in App.css are the highest migration risk: ~15–20 button instances across all components depend on them. No `:focus-visible` styles exist anywhere. Swatches have `min-height: 36px` (4px below WCAG minimum). No dialog, tooltip, toast, or dropdown primitives exist yet.

### Complete Examples

**Token file structure:**
```css
/* src/styles/tokens/primitives.css */
:root {
  /* — Color scale (OKLCH for perceptual uniformity) — */
  --color-amber-300: oklch(88% 0.17 73);
  --color-amber-500: oklch(78% 0.19 65);   /* accent */
  --color-amber-700: oklch(58% 0.15 60);
  --color-brown-900: oklch(22% 0.04 45);   /* --ink */
  --color-cream-100: oklch(97% 0.03 80);   /* --warm */
  --color-white: oklch(100% 0 0);

  /* — Spacing (4px base) — */
  --space-1: 0.25rem;   /* 4px  */
  --space-2: 0.5rem;    /* 8px  */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */

  /* — Radius — */
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   14px;
  --radius-pill: 9999px;

  /* — Elevation / Shadow — */
  --shadow-1: 0 1px 2px oklch(0% 0 0 / 0.08);
  --shadow-2: 0 4px 12px oklch(0% 0 0 / 0.12);

  /* — Typography — */
  --font-family-display: "Fraunces", Georgia, serif;
  --font-family-body:    "Sora", system-ui, sans-serif;
  --font-size-xs:  0.75rem;
  --font-size-sm:  0.875rem;
  --font-size-md:  1rem;
  --font-size-lg:  1.125rem;
  --font-size-xl:  1.25rem;
  --font-size-2xl: 1.5rem;
  --font-weight-normal:   400;
  --font-weight-semibold: 600;
  --font-weight-bold:     700;

  /* — Motion — */
  --duration-quick:    80ms;
  --duration-moderate: 200ms;
  --duration-gentle:   320ms;
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);

  /* — Touch target — */
  --touch-target-min: 44px;
}
```

```css
/* src/styles/tokens/semantic.css */
:root {
  /* Color intent */
  --color-primary:        var(--color-amber-500);
  --color-primary-hover:  var(--color-amber-700);
  --color-text-primary:   var(--color-brown-900);   /* replaces --ink */
  --color-surface:        var(--color-cream-100);   /* replaces --warm */
  --color-panel:          rgba(247, 240, 227, 0.78);/* replaces --panel */
  --color-panel-border:   rgba(75, 56, 42, 0.18);  /* replaces --panel-border */
  --color-error:          oklch(55% 0.22 27);
  --color-success:        oklch(55% 0.18 145);
  --color-icon:           var(--color-text-primary);

  /* StatusIndicator semantic colors */
  --color-status-connected:    oklch(60% 0.18 145);
  --color-status-connecting:   oklch(75% 0.18 85);
  --color-status-error:        oklch(55% 0.22 27);
  --color-status-disconnected: oklch(60% 0 0);

  /* Component */
  --radius-component: var(--radius-lg);   /* replaces --radius (18px) */
  --radius-button:    var(--radius-pill);
  --shadow-panel:     var(--shadow-2);

  /* Typography */
  --font-size-body:    var(--font-size-md);
  --font-size-label:   var(--font-size-sm);
  --font-size-heading: var(--font-size-2xl);

  /* Focus */
  --focus-ring-color:  var(--color-primary);
  --focus-ring-width:  2px;
  --focus-ring-offset: 3px;

  /* Motion */
  --transition-standard: var(--duration-moderate) var(--ease-standard);
}
```

**Radix Tooltip with tokens:**
```tsx
// src/ui/primitives/Tooltip.tsx
import * as RadixTooltip from "radix-ui/tooltip";
import "./Tooltip.css";

export function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="tooltip-content" sideOffset={4}>
          {content}
          <RadixTooltip.Arrow className="tooltip-arrow" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
```

**Focus ring token usage:**
```css
/* In src/styles/base.css — global override */
:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
```

**Reduced-motion pattern:**
```css
/* Transitions default to on; reduced-motion collapses them */
.btn {
  transition: transform var(--transition-standard);
}

@media (prefers-reduced-motion: reduce) {
  .btn { transition: none; }
  .invalid-pulse { animation: none; }
}
```

**Visually hidden label:**
```tsx
// src/ui/primitives/VisuallyHidden.tsx
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="visually-hidden">{children}</span>;
}
```
```css
/* base.css */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

### API and Schema Documentation

* Radix UI Tooltip: requires `TooltipProvider` ancestor (add once in App.tsx or main.tsx)
* Radix UI Toast: requires `ToastProvider` + `ToastViewport` in App root
* Radix UI Tabs: `activationMode="automatic"` (default) vs `"manual"` (user presses Enter)
* Radix UI ToggleGroup: `type="single"` or `type="multiple"`; `rovingFocus` prop (default true)

## Technical Scenarios

### Scenario A: Pure CSS Custom Property Tokens + Radix UI Headless Primitives (SELECTED)

**Description:** Add a `src/styles/tokens/` directory with `primitives.css` and `semantic.css`. Import chain feeds into existing `main.tsx`. Existing `--ink`, `--warm`, `--accent`, `--radius` variables are superseded by semantic tokens (backwards-compatible during migration since component CSS references old names; we migrate component by component). Radix UI added via `npm install radix-ui`. lucide-react for icons.

**Requirements:**
* No breaking changes to existing lobby or canvas controls during migration
* CSS custom properties available globally via `:root`
* Radix primitives wrapped in thin project-specific components under `src/ui/primitives/`

**Preferred Approach:**

```text
apps/client/src/
  styles/
    tokens/
      primitives.css      ← NEW: raw scale values
      semantic.css        ← NEW: intent aliases (replaces 6 :root vars)
    base.css              ← NEW: reset + :focus-visible + .visually-hidden + reduced-motion
    index.css             ← NEW: @import chain (replaces src/index.css)
  ui/
    primitives/
      Tooltip.tsx         ← NEW: wraps radix-ui/tooltip
      Tooltip.css
      Dialog.tsx          ← NEW: wraps radix-ui/dialog
      Dialog.css
      AlertDialog.tsx     ← NEW: wraps radix-ui/alert-dialog
      AlertDialog.css
      ToggleGroup.tsx     ← NEW: wraps radix-ui/toggle-group
      ToggleGroup.css
      Tabs.tsx            ← NEW: wraps radix-ui/tabs
      Tabs.css
      Toast.tsx           ← NEW: wraps radix-ui/toast + ToastProvider
      Toast.css
      VisuallyHidden.tsx  ← NEW: sr-only utility component
    icons/
      index.ts            ← NEW: re-exports from lucide-react (Icon convention)
    StatusIndicator.tsx   ← MIGRATE: replace hardcoded colors with tokens
    StatusIndicator.css   ← MIGRATE: swap hex values for --color-status-* tokens
  App.css                 ← MIGRATE (incremental): reference semantic tokens; add
                             min-height: var(--touch-target-min) to .swatch and buttons;
                             add prefers-reduced-motion guards to .invalid-pulse
  main.tsx                ← ADD: import "./styles/index.css"
```

**Implementation Details:**

1. **Token import order**: `main.tsx` imports `styles/index.css` first. `index.css` imports primitives → semantic → base. `App.css` continues to be imported in `App.tsx` (component scoping).
2. **Migration safety**: Existing `App.css :root` variables (`--ink`, `--panel`, etc.) remain during migration. Semantic tokens add parallel definitions; component CSS is updated one file at a time.
3. **TooltipProvider placement**: Wrap at `App.tsx` top level (`<TooltipProvider>`); a single provider covers all tooltips.
4. **ToastProvider + Viewport**: Add `<Toast.Provider>` + `<Toast.Viewport>` in App.tsx root, render Viewport at end of DOM.
5. **Icon convention**: `src/ui/icons/index.ts` re-exports named icons from `lucide-react`. Components import `{ ShapeIcon } from "@/ui/icons"` — one import source of truth.
6. **Touch targets**: `.btn, button { min-height: var(--touch-target-min); }` in base.css overrides App.css defaults; swatch fix: `min-height: 44px`.

#### Considered Alternatives

**Scenario B: shadcn/ui**
Rejected — hard Tailwind CSS dependency conflicts with this project's CSS custom property approach. Would require migrating all existing CSS to Tailwind utility classes, far exceeding the issue scope.

**Scenario C: React Aria (Adobe)**
Rejected — heavier bundle (~8–15 KB per component vs. ~4–6 KB for Radix), more complex hook-based API requires more wiring for simple components. For a small team project, Radix's simpler component API delivers the same ARIA coverage with less overhead. React Aria's advantages (fine-grained hook composition) are not needed here.

**Scenario D: Headless UI**
Rejected — component set too small: no Tooltip or Toast natively, which are both required by the acceptance criteria. Would require mixing in a second library to fill gaps.

**Scenario E: Single flat tokens.css file**
Rejected — a single file conflates scale values with intent aliases, making future theming harder. The primitive/semantic split is a small cost now for significant future flexibility (dark mode, high-contrast mode).

