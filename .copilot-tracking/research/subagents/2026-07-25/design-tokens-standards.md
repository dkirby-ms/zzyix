# Design Tokens & Accessible UI Primitives Research

**Date:** 2026-07-25
**Status:** Complete
**Topic:** CSS design token architecture and accessible UI primitive libraries for React + TypeScript + Vite

---

## 1. CSS Design Token Standard Categories

### 1.1 Standard Token Categories

The W3C Design Tokens Community Group (DTCG) published its first stable specification in October 2025. Industry consensus has converged on these top-level categories:

| Category      | CSS custom property prefix     | What it covers                                   |
|---------------|-------------------------------|--------------------------------------------------|
| **Color**     | `--color-*`                   | Brand, semantic, neutral, status colors          |
| **Spacing**   | `--space-*`                   | Padding, margin, gap values                      |
| **Radius**    | `--radius-*`                  | Border-radius values                             |
| **Elevation** | `--shadow-*`                  | Box shadows expressing z-depth                   |
| **Typography**| `--font-*`                    | Size, weight, family, line-height, letter-spacing|
| **Focus**     | `--focus-*`                   | Focus ring color, width, offset                  |
| **Motion**    | `--duration-*`, `--ease-*`    | Transition/animation timing                      |
| **Z-Index**   | `--layer-*`                   | Stacking context values                          |

### 1.2 Token Tier Architecture

The industry uses a **two- or three-tier model**:

```
Primitive Tokens  →  Semantic Tokens  →  (Component Tokens, optional)
(scale values)       (intent-based)       (component-scoped)
```

**Tier 1 – Primitive tokens** (raw scale values, not for direct use in components):
```css
/* colors */
--color-amber-500: oklch(78% 0.19 65);
--color-amber-900: oklch(35% 0.10 65);
/* spacing */
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-4: 1rem;      /* 16px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
/* radius */
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 14px;
--radius-full: 9999px;
/* elevation */
--shadow-1: 0 1px 2px oklch(0% 0 0 / 0.08);
--shadow-2: 0 4px 12px oklch(0% 0 0 / 0.12);
/* typography */
--font-size-xs:  0.75rem;
--font-size-sm:  0.875rem;
--font-size-md:  1rem;
--font-size-lg:  1.125rem;
--font-size-xl:  1.25rem;
--font-size-2xl: 1.5rem;
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;
/* motion */
--duration-quick:    80ms;
--duration-moderate: 200ms;
--duration-gentle:   320ms;
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
```

**Tier 2 – Semantic tokens** (reference primitives, carry design intent):
```css
/* Semantic tokens alias into primitives */
--color-primary:        var(--color-amber-500);
--color-text-primary:   var(--color-slate-900);
--color-text-secondary: var(--color-slate-600);
--color-surface:        var(--color-white);
--color-surface-raised: var(--color-slate-50);
--color-border:         var(--color-slate-200);
--color-error:          var(--color-red-600);
--color-success:        var(--color-green-600);

--space-component-padding-sm: var(--space-2);
--space-component-padding-md: var(--space-4);
--space-component-gap:        var(--space-2);

--font-size-body:    var(--font-size-md);
--font-size-label:   var(--font-size-sm);
--font-size-heading: var(--font-size-2xl);

--radius-component: var(--radius-md);
--shadow-card:      var(--shadow-2);
```

### 1.3 Naming Convention: Recommended for This Project

Use **kebab-case**, **category-prefixed**, with scale numbers or semantic names depending on tier:

```
--{category}-{subcategory?}-{scale|intent}
```

Examples:
- `--color-primary` (semantic)
- `--color-amber-500` (primitive scale)
- `--space-4` (primitive scale, matches index × 4px)
- `--radius-md` (primitive named scale)
- `--focus-ring-color` (semantic focus)
- `--duration-moderate` (semantic motion)

**Reference:** Open Props naming (open-props.style) is the most battle-tested public convention. It uses `--size-{1-15}`, `--font-size-{00-8}`, `--radius-{1-6}`, `--shadow-{1-6}`. This project can follow a simplified subset.

---

## 2. Radix UI Primitives

### 2.1 Available Primitives

Radix UI provides a comprehensive set of WAI-ARIA-compliant headless primitives. The full list (current as of 2026) includes:

| Primitive             | Package / Import                  | Key features                                    |
|-----------------------|-----------------------------------|-------------------------------------------------|
| Accordion             | `radix-ui/accordion`              | Keyboard-nav, ARIA expanded                     |
| Alert Dialog          | `radix-ui/alert-dialog`           | Focus trap, screen reader announcements          |
| Avatar                | `radix-ui/avatar`                 | Image + fallback                                |
| Checkbox              | `radix-ui/checkbox`               | Indeterminate state                             |
| Collapsible           | `radix-ui/collapsible`            | Show/hide content                               |
| Context Menu          | `radix-ui/context-menu`           | Right-click menu                                |
| Dialog                | `radix-ui/dialog`                 | Focus trap, scroll lock, Esc key                |
| Dropdown Menu         | `radix-ui/dropdown-menu`          | Full keyboard nav, sub-menus                    |
| Form                  | `radix-ui/form`                   | Built-in validation                             |
| Hover Card            | `radix-ui/hover-card`             | Preview on hover                                |
| Label                 | `radix-ui/label`                  | Associates with control                         |
| Menubar               | `radix-ui/menubar`                | Desktop menu patterns                           |
| Navigation Menu       | `radix-ui/navigation-menu`        | Site navigation                                 |
| Popover               | `radix-ui/popover`                | Floating content, portal                        |
| Progress              | `radix-ui/progress`               | ARIA progressbar                                |
| Radio Group           | `radix-ui/radio-group`            | ARIA radio group                                |
| Scroll Area           | `radix-ui/scroll-area`            | Custom scrollbars                               |
| Select                | `radix-ui/select`                 | Accessible custom select                        |
| Separator             | `radix-ui/separator`              | ARIA separator                                  |
| Slider                | `radix-ui/slider`                 | ARIA slider, keyboard moves value               |
| Switch                | `radix-ui/switch`                 | Toggle switch, ARIA role=switch                 |
| Tabs                  | `radix-ui/tabs`                   | ARIA tablist, auto/manual activation            |
| Toast                 | `radix-ui/toast`                  | ARIA live region, swipe to dismiss              |
| Toggle                | `radix-ui/toggle`                 | ARIA pressed state                              |
| Toggle Group          | `radix-ui/toggle-group`           | ARIA roving tabindex                            |
| Toolbar               | `radix-ui/toolbar`                | ARIA toolbar                                    |
| Tooltip               | `radix-ui/tooltip`                | ARIA tooltip, hover/focus                       |

### 2.2 Installation

**Recommended approach — single package (tree-shakeable):**
```bash
npm install radix-ui
```
```tsx
import { Dialog, Tooltip, Tabs, Toast, ToggleGroup } from "radix-ui";
// or subpath for better tree-shaking:
import * as Dialog from "radix-ui/dialog";
import * as Tooltip from "radix-ui/tooltip";
```

**Alternative — individual packages:**
```bash
npm install @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-tabs
```

The `radix-ui` unified package is now preferred; it is tree-shakeable and avoids version drift.

### 2.3 Keyboard Navigation (Built In)

Radix handles all WAI-ARIA keyboard patterns automatically:

**Tooltip:**
| Key | Behavior |
|-----|----------|
| `Tab` | Opens tooltip without delay when trigger receives focus |
| `Escape` | Closes open tooltip |

**Dialog / Alert Dialog:**
| Key | Behavior |
|-----|----------|
| `Space` / `Enter` | Opens dialog from trigger |
| `Tab` / `Shift+Tab` | Moves focus within dialog (trapped) |
| `Escape` | Closes dialog, returns focus to trigger |

**Tabs:**
| Key | Behavior |
|-----|----------|
| `Tab` | Focuses active tab trigger, then moves to content |
| `ArrowRight` / `ArrowLeft` | Cycles through tab triggers (horizontal) |
| `ArrowDown` / `ArrowUp` | Cycles through tab triggers (vertical) |
| `Home` / `End` | Jumps to first/last tab |

**Toggle Group:**
Implements roving tabindex; arrow keys navigate between items.

### 2.4 Styling Approach (Headless)

Radix components ship with zero styles. Apply styles via:
- `className` props on each part
- CSS targeting data attributes (`[data-state="open"]`, `[data-disabled]`, `[data-orientation]`)
- CSS custom properties for positioning hints (e.g., `--radix-tooltip-trigger-width`)

```tsx
import * as Tooltip from "radix-ui/tooltip";
import "./tooltip.css";

<Tooltip.Root>
  <Tooltip.Trigger className="tooltip-trigger">Hover me</Tooltip.Trigger>
  <Tooltip.Portal>
    <Tooltip.Content className="tooltip-content" sideOffset={4}>
      Label text
      <Tooltip.Arrow className="tooltip-arrow" />
    </Tooltip.Content>
  </Tooltip.Portal>
</Tooltip.Root>
```

```css
/* tooltip.css — styling with CSS tokens */
.tooltip-content {
  background: var(--color-surface-inverse);
  color: var(--color-text-inverse);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  animation: fade-in var(--duration-moderate) var(--ease-standard);
}

.tooltip-content[data-state="closed"] {
  animation: fade-out var(--duration-quick) var(--ease-standard);
}
```

### 2.5 Approximate Bundle Size Per Primitive

Bundle sizes (gzip, tree-shaken, rough estimates from bundlephobia-style analysis):

| Primitive | Approx. gzip |
|-----------|-------------|
| Tooltip   | ~4 KB       |
| Dialog    | ~5 KB       |
| Tabs      | ~3 KB       |
| Toast     | ~4 KB       |
| Toggle Group | ~2 KB    |
| Alert Dialog | ~5 KB    |

The shared `@radix-ui/react-primitive` and `@radix-ui/react-compose-refs` internals are shared across primitives, so adding a second component costs less than the first.

---

## 3. Alternative Accessible Primitive Libraries

### 3.1 Comparison Table

| Library | CSS Custom Props | Component Set | a11y | Bundle (rough) | Tailwind Dependency | TypeScript | Last Updated |
|---------|-----------------|---------------|------|----------------|---------------------|------------|-------------|
| **Radix UI** | ✅ Via className + data attrs | Very large (~30+) | Excellent (WAI-ARIA) | ~4-6 KB/component | None | ✅ Full | Active 2025-26 |
| **Headless UI** | ✅ Via data-* attrs | Small (~10) | Good (WAI-ARIA) | ~3-5 KB/component | Designed for Tailwind; plain CSS works | ✅ Full | Active 2025 |
| **React Aria** (Adobe) | ✅ Via className hooks | Very large (~40+) | Exceptional (WCAG-focused) | ~8-15 KB/component (heavier) | None | ✅ Full | Active 2026 |
| **Ark UI** | ✅ Data attributes | Large (~30+) | Good (state-machine-based) | ~5-8 KB/component | None | ✅ Full | Active 2025-26 |
| **shadcn/ui** | Partial (Tailwind CSS vars) | Large (Radix wrappers) | Excellent (inherits Radix) | Component code copied to project | Hard Tailwind dependency | ✅ Full | Active 2026 |

### 3.2 Detailed Pros/Cons for a CSS-Custom-Property-Only Project

#### Radix UI (Recommended)
**Pros:**
- Largest primitive set; covers all listed requirements (tooltip, dialog, alert-dialog, toggle-group, tabs, toast)
- Excellent WAI-ARIA conformance, battle-tested on production design systems
- Truly headless — styles with any className approach, CSS modules, plain CSS, or CSS custom properties
- Data attributes (`[data-state="open"]`, `[data-disabled]`) make CSS-selector targeting straightforward
- `asChild` prop gives full element control without wrapper divs
- Tree-shaken `radix-ui` package avoids per-primitive version management
- Active community, company-backed (Vercel)

**Cons:**
- Requires writing all styles from scratch (intentional, but more setup)
- Some patterns (e.g., Toast) require provider setup

#### Headless UI (Tailwind Labs)
**Pros:**
- Simple API, smaller surface area to learn
- Data attribute styling pattern works without Tailwind

**Cons:**
- Significantly smaller component set — lacks Tooltip, Toast, Tabs natively
- Documentation examples are exclusively Tailwind-flavored, making CSS token integration less documented
- Backed by Tailwind Labs; optimization priorities align with Tailwind

#### React Aria (Adobe)
**Pros:**
- Best-in-class accessibility — built by accessibility specialists at Adobe
- Extremely fine-grained hooks (e.g., `useButton`, `useFocusRing`) allow deep customization
- Has `prefers-reduced-motion`, color contrast testing, etc. built in

**Cons:**
- Heavier bundle per component
- More complex API compared to Radix
- Hook-based model requires more wiring for simple use cases

#### Ark UI
**Pros:**
- State-machine-based internals (XState/Zag) produce very predictable behavior
- Good component coverage, Radix-competitive
- Data attribute styling is idiomatic

**Cons:**
- Smaller ecosystem and community than Radix
- Less documentation and fewer examples with plain CSS
- Heavier runtime state machine dependency

#### shadcn/ui
**Cons (for this project):**
- Hard Tailwind CSS dependency — not suitable for a CSS custom property only project
- Components are copied/pasted into the project (not installed as a package)
- Styling is Tailwind class-based, not CSS variable-based

---

## 4. CSS Token File Architecture

### 4.1 File Structure Recommendation

**Split by layer** (primitive vs. semantic) but keep related categories together. For a small-to-mid project, this structure works well:

```
src/
  styles/
    tokens/
      primitives.css    ← raw scale values (colors, sizes, radii, motion)
      semantic.css      ← intent-based aliases (--color-primary refs --color-amber-500)
    base.css            ← reset, body defaults, box-sizing
    index.css           ← @import chain
```

For a larger system, split primitives further:
```
tokens/
  color.css
  space.css
  typography.css
  motion.css
  elevation.css
  focus.css
```

### 4.2 Import Strategy

**In `src/styles/index.css`** (imported once in `main.tsx`):
```css
@import "./tokens/primitives.css";
@import "./tokens/semantic.css";
@import "./base.css";
```

**In `main.tsx`:**
```tsx
import "./styles/index.css";
```

Do **not** import tokens in `App.css` — that file is component-scoped by convention and may be processed differently in future.

### 4.3 Scoping Tokens to Avoid Legacy Leakage

To prevent CSS custom properties from leaking into legacy/unrelated components:

```css
/* Option A: Scope to a wrapper */
.app-shell {
  --color-primary: var(--color-amber-500);
  /* … all semantic tokens */
}

/* Option B: Use :root but layer primitives under .legacy-override reset */
:root {
  --color-primary: var(--color-amber-500);
}

/* Legacy sections that should not inherit new tokens */
.legacy-widget {
  /* Reset or override specific tokens */
  --color-primary: #0070f3; /* legacy brand */
}
```

For this project (a greenfield client), `:root` is fine since there are no legacy components currently. Scope to a specific component tree only if truly needed.

---

## 5. Accessible Touch Targets and Focus Styles

### 5.1 Minimum 44×44px Touch Targets (WCAG 2.5.5)

```css
/* Method 1: direct sizing — preferred for buttons and icons */
.btn {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* Method 2: expand clickable area without visual change */
.icon-btn {
  position: relative;
  width: 24px;
  height: 24px;
}

.icon-btn::before {
  content: "";
  position: absolute;
  inset: -10px; /* expands tap target by 10px on all sides */
}

/* With tokens */
.btn {
  min-width: var(--touch-target-size, 44px);
  min-height: var(--touch-target-size, 44px);
  padding: var(--space-component-padding-sm) var(--space-component-padding-md);
}
```

### 5.2 Focus Ring with CSS Tokens

```css
/* In tokens/focus.css */
:root {
  --focus-ring-color:  var(--color-primary);
  --focus-ring-width:  2px;
  --focus-ring-offset: 3px;
  --focus-ring-style:  solid;
}

/* Remove browser default, apply token-based ring */
:focus-visible {
  outline: var(--focus-ring-width) var(--focus-ring-style) var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm); /* optional: match element shape */
}

/* For dark surfaces where default focus ring is invisible */
.surface-dark :focus-visible {
  --focus-ring-color: var(--color-focus-on-dark, white);
}
```

### 5.3 `prefers-reduced-motion` Pattern

```css
/* Canonical motion pattern: motion-first, reduced-motion opt-out */

/* Default: assume motion is OK */
.animated-element {
  transition: transform var(--duration-moderate) var(--ease-standard),
              opacity  var(--duration-moderate) var(--ease-standard);
}

@keyframes slide-in-up {
  from { transform: translateY(8px); opacity: 0; }
  to   { transform: translateY(0);   opacity: 1; }
}

.panel-enter {
  animation: slide-in-up var(--duration-moderate) var(--ease-standard) forwards;
}

/* Reduced motion override */
@media (prefers-reduced-motion: reduce) {
  /* Keep state changes but remove transforms/fades */
  .animated-element {
    transition: none;
  }

  .panel-enter {
    animation: none;
    /* Element appears instantly — still rendered, just no motion */
  }
}

/* Alternative: define motion in the media query (motion-optional pattern) */
@media (prefers-reduced-motion: no-preference) {
  .tab-indicator {
    transition: left var(--duration-moderate) var(--ease-standard);
  }
}
```

**Token for motion scale:**
```css
:root {
  --motion-duration-multiplier: 1;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-duration-multiplier: 0;
  }
}

.element {
  /* Derived transition: collapses to 0ms when reduced motion requested */
  transition: transform calc(var(--duration-moderate) * var(--motion-duration-multiplier));
}
```

---

## 6. Icon Library Recommendation

### 6.1 Comparison

| Library | Installation | Tree-shakeable | CSS token color | Bundle per icon | TypeScript |
|---------|-------------|----------------|-----------------|-----------------|------------|
| **lucide-react** | `npm install lucide-react` | ✅ Per-icon import | ✅ `currentColor` | ~1-3 KB | ✅ |
| **react-icons** | `npm install react-icons` | Partial | ✅ `currentColor` | Larger (bulk import common) | Partial |
| **@heroicons/react** | `npm install @heroicons/react` | ✅ | ✅ `currentColor` | ~1-2 KB | ✅ |
| **SVG sprite** | Manual | N/A | ✅ `currentColor` | Smallest runtime | N/A |

### 6.2 Recommendation: `lucide-react`

`lucide-react` is the best fit for a CSS custom property–based project because:

1. **`currentColor` by default** — icons inherit the computed `color` of their parent, which means setting `color: var(--color-icon)` on a button automatically colors any contained Lucide icon.
2. **Perfect tree-shaking** — each icon is a standalone React component, only what you import ships.
3. **Props match CSS mental model** — `size`, `color`, `strokeWidth` as props, or inherits from CSS.
4. **~950+ icons**, MIT licensed.
5. **TypeScript-first** — fully typed.

```bash
npm install lucide-react
```

```tsx
import { Settings, X, ChevronDown } from "lucide-react";

// Color is inherited from parent via currentColor
<button className="icon-btn">
  <Settings aria-hidden="true" />
  <span className="sr-only">Settings</span>
</button>
```

```css
.icon-btn {
  color: var(--color-icon, var(--color-text-secondary));
}

.icon-btn:hover {
  color: var(--color-icon-hover, var(--color-text-primary));
}
```

---

## 7. Recommended Token File Structure (Code Examples)

### 7.1 `src/styles/tokens/primitives.css`

```css
/* ============================================================
   PRIMITIVE TOKENS — Raw scale values
   Do not use directly in components; reference via semantic tokens.
   ============================================================ */

:root {
  /* --- COLOR PALETTE --- */
  /* Warm brand palette (matches existing --accent, --ink, --warm theme) */
  --color-brown-50:  #fdf8f0;
  --color-brown-100: #f6ecdd;
  --color-brown-200: #e8d5b5;
  --color-brown-600: #ca7a4c;
  --color-brown-800: #7a4a2e;
  --color-brown-900: #2f251f;

  --color-neutral-0:   #ffffff;
  --color-neutral-50:  #fafafa;
  --color-neutral-100: #f4f4f5;
  --color-neutral-200: #e4e4e7;
  --color-neutral-400: #a1a1aa;
  --color-neutral-700: #3f3f46;
  --color-neutral-900: #18181b;

  --color-red-600:   #dc2626;
  --color-green-600: #16a34a;

  /* --- SPACING SCALE (4px base) --- */
  --space-1:  0.25rem;   /* 4px  */
  --space-2:  0.5rem;    /* 8px  */
  --space-3:  0.75rem;   /* 12px */
  --space-4:  1rem;      /* 16px */
  --space-5:  1.25rem;   /* 20px */
  --space-6:  1.5rem;    /* 24px */
  --space-8:  2rem;      /* 32px */
  --space-10: 2.5rem;    /* 40px */
  --space-12: 3rem;      /* 48px */

  /* --- BORDER RADIUS --- */
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   14px;
  --radius-xl:   18px;
  --radius-full: 9999px;

  /* --- ELEVATION (shadows) --- */
  --shadow-1: 0 1px 2px oklch(0% 0 0 / 0.06);
  --shadow-2: 0 4px 12px oklch(0% 0 0 / 0.10);
  --shadow-3: 0 18px 40px oklch(0% 0 0 / 0.12);

  /* --- TYPOGRAPHY SCALE --- */
  --font-size-xs:   0.75rem;    /* 12px */
  --font-size-sm:   0.8125rem;  /* 13px */
  --font-size-base: 1rem;       /* 16px */
  --font-size-lg:   1.125rem;   /* 18px */
  --font-size-xl:   1.25rem;    /* 20px */
  --font-size-2xl:  1.55rem;    /* ~25px */
  --font-size-3xl:  2rem;       /* 32px */

  --font-weight-normal:   400;
  --font-weight-medium:   500;
  --font-weight-semibold: 600;
  --font-weight-bold:     700;

  --font-family-sans:  'Sora', system-ui, sans-serif;
  --font-family-serif: 'Fraunces', Georgia, serif;
  --font-family-mono:  ui-monospace, 'Cascadia Code', monospace;

  --line-height-tight:  1.25;
  --line-height-normal: 1.5;
  --line-height-loose:  1.75;

  /* --- MOTION --- */
  --duration-instant:  0ms;
  --duration-quick:    80ms;
  --duration-moderate: 200ms;
  --duration-gentle:   320ms;

  --ease-standard:   cubic-bezier(0.4, 0, 0.2, 1);
  --ease-decelerate: cubic-bezier(0, 0, 0.2, 1);
  --ease-accelerate: cubic-bezier(0.4, 0, 1, 1);
}
```

### 7.2 `src/styles/tokens/semantic.css`

```css
/* ============================================================
   SEMANTIC TOKENS — Intent-based aliases of primitives
   Use these in component styles.
   ============================================================ */

:root {
  /* --- COLOR SEMANTIC --- */
  --color-primary:          var(--color-brown-600);
  --color-primary-hover:    var(--color-brown-800);

  --color-text-primary:     var(--color-brown-900);
  --color-text-secondary:   color-mix(in srgb, var(--color-brown-900) 78%, transparent);
  --color-text-inverse:     var(--color-neutral-0);
  --color-text-disabled:    var(--color-neutral-400);

  --color-surface:          var(--color-brown-100);
  --color-surface-raised:   rgba(247, 240, 227, 0.78);  /* matches existing --panel */
  --color-surface-overlay:  rgba(39, 25, 16, 0.12);

  --color-border:           rgba(75, 56, 42, 0.18);      /* matches existing --panel-border */
  --color-border-strong:    rgba(66, 47, 37, 0.24);

  --color-error:            var(--color-red-600);
  --color-success:          var(--color-green-600);

  --color-icon:             var(--color-text-secondary);
  --color-icon-hover:       var(--color-text-primary);

  /* --- SPACING SEMANTIC --- */
  --space-component-xs: var(--space-2);
  --space-component-sm: var(--space-3);
  --space-component-md: var(--space-4);
  --space-component-lg: var(--space-6);

  /* --- TYPOGRAPHY SEMANTIC --- */
  --font-size-body:    var(--font-size-base);
  --font-size-label:   var(--font-size-sm);
  --font-size-caption: var(--font-size-xs);
  --font-size-heading: var(--font-size-2xl);
  --font-size-title:   var(--font-size-xl);

  /* --- RADIUS SEMANTIC --- */
  --radius-button:    var(--radius-md);
  --radius-card:      var(--radius-xl);  /* matches existing --radius: 18px */
  --radius-input:     var(--radius-md);
  --radius-tag:       var(--radius-full);

  /* --- ELEVATION SEMANTIC --- */
  --shadow-card:    var(--shadow-3);     /* matches existing lobby-panel shadow */
  --shadow-panel:   var(--shadow-2);
  --shadow-tooltip: var(--shadow-2);

  /* --- FOCUS --- */
  --focus-ring-color:  var(--color-primary);
  --focus-ring-width:  2px;
  --focus-ring-offset: 3px;

  /* --- MOTION SEMANTIC --- */
  --duration-ui-feedback:  var(--duration-quick);
  --duration-ui-open:      var(--duration-moderate);
  --duration-ui-expand:    var(--duration-gentle);
  --ease-ui:               var(--ease-standard);

  /* --- TOUCH TARGETS --- */
  --touch-target-min: 44px;

  /* --- Z-INDEX LAYERS --- */
  --layer-base:    0;
  --layer-raised:  10;
  --layer-overlay: 100;
  --layer-modal:   200;
  --layer-toast:   300;
  --layer-tooltip: 400;
}
```

### 7.3 Focus Ring Usage

```css
/* In base.css */

/* Remove browser outline globally, apply token-based focus ring */
*:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-sm);
}

/* Override for full-radius elements */
.btn-round:focus-visible,
[role="switch"]:focus-visible {
  border-radius: var(--radius-full);
}

/* High-contrast surface override */
.surface-dark *:focus-visible {
  --focus-ring-color: white;
}
```

### 7.4 `prefers-reduced-motion` Pattern

```css
/* In base.css — wrap all transitions/animations in motion preference */

/* Motion-safe: transitions are opt-in */
@media (prefers-reduced-motion: no-preference) {
  :root {
    --_transition-duration: var(--duration-moderate);
  }
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --_transition-duration: 0ms;
  }
}

/* Component example */
.dialog-overlay {
  opacity: 0;
  transition: opacity var(--duration-ui-open) var(--ease-ui);
}

.dialog-overlay[data-state="open"] {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .dialog-overlay {
    transition: none;
  }
}

/* Preferred shorthand for animation */
.panel-enter {
  animation: slide-up var(--duration-ui-open) var(--ease-decelerate) forwards;
}

@keyframes slide-up {
  from { transform: translateY(8px); opacity: 0; }
  to   { transform: translateY(0);   opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .panel-enter {
    animation: none;
    opacity: 1;
  }
}
```

---

## 8. Selected Recommendation for This Project

### 8.1 Primitive Library: Radix UI

**Rationale:**
- Covers all required components: Tooltip, Dialog, Alert Dialog, Toggle Group, Tabs, Toast
- Completely headless — integrates perfectly with CSS custom property styling
- Best-in-class WAI-ARIA conformance; keyboard navigation is handled automatically
- Works with the project's existing plain CSS approach (no Tailwind required)
- `npm install radix-ui` — single unified package, tree-shakeable
- Active maintenance by Vercel team; largest community/ecosystem

### 8.2 Icon Library: `lucide-react`

**Rationale:**
- Uses `currentColor` by default → icons inherit parent `color` → map directly to `var(--color-icon)` without extra props
- Best tree-shaking of any option (each icon is a standalone import)
- ~950 icons, MIT licensed, TypeScript-first
- No styling lock-in; works identically with CSS custom properties

### 8.3 Token Architecture: Two-tier split files

- `src/styles/tokens/primitives.css` — raw scale values (not consumed directly)
- `src/styles/tokens/semantic.css` — intent-based aliases (what components use)
- Import chain through `src/styles/index.css`, imported once in `main.tsx`

---

## 9. References

- [W3C Design Tokens Community Group — Stable spec 2025.10](https://www.w3.org/community/design-tokens/)
- [Radix UI Primitives — Introduction](https://www.radix-ui.com/primitives/docs/overview/introduction)
- [Radix UI Tooltip docs](https://www.radix-ui.com/primitives/docs/components/tooltip)
- [Radix UI Dialog docs](https://www.radix-ui.com/primitives/docs/components/dialog)
- [Radix UI Tabs docs](https://www.radix-ui.com/primitives/docs/components/tabs)
- [Headless UI React — Dropdown Menu](https://headlessui.com/react/menu)
- [Open Props — CSS design token naming reference](https://open-props.style/)
- [Lucide React — Getting started](https://lucide.dev/guide/react/getting-started)
- [Lucide React — Color (currentColor)](https://lucide.dev/guide/react/basics/color)
- [WCAG 2.5.5 — Target Size (AA)](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
- [MDN — prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
