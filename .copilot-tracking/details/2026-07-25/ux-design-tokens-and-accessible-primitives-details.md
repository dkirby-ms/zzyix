<!-- markdownlint-disable-file -->
# Implementation Details: UX Design Tokens and Accessible UI Primitives

## Context Reference

Sources: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md, user request in chat with #prompt:task-plan.prompt.md, and repository workspace structure context.

## Implementation Phase 1: Foundation Tokens and Base Styling

<!-- parallelizable: false -->

### Step 1.1: Create token and base style files with primitive and semantic layers

Create a dedicated token architecture under apps/client/src/styles using a primitive-to-semantic split. Ensure all requested token domains are represented: color, spacing, radius, elevation, typography, focus, and motion.

Files:
* apps/client/src/styles/tokens/primitives.css - Raw scale values for color, spacing, radius, elevation, typography, motion, and touch-target minimum
* apps/client/src/styles/tokens/semantic.css - Semantic aliases and intent-based tokens used by components
* apps/client/src/styles/base.css - Global focus ring, reduced-motion fallback rules, and visually-hidden utility
* apps/client/src/styles/index.css - Token import chain (primitives -> semantic -> base)

Success criteria:
* Token files include all required categories with stable naming conventions.
* Base styles include visible focus indicators and visually hidden utility class.

Context references:
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 8-13) - User requirements for tokens, focus, touch targets, and reduced motion
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 80-88) - DTCG two-tier token model and Radix/lucide recommendations
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 108-199) - Token examples and category structure

Dependencies:
* Existing CSS files under apps/client/src are available for additive integration.

### Step 1.2: Wire new global style entrypoint from main.tsx

Import apps/client/src/styles/index.css at app bootstrap so tokens and base accessibility styles load before component-level styles.

Files:
* apps/client/src/main.tsx - Add import for ./styles/index.css

Success criteria:
* App boot loads the token/base stylesheet stack globally.
* Existing imports remain compatible with no runtime regressions.

Context references:
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 278-279) - Selected approach and import chain
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 322-323) - Token import order and migration safety

Dependencies:
* Step 1.1 completion

### Step 1.3: Validate phase changes

Run lint and build commands for files modified in this phase. Skip command-level validation only if parallel work is actively modifying the same files.

Validation commands:
* pnpm --filter client lint - Validate style and TypeScript quality in client package
* pnpm --filter client build - Validate Vite build output and CSS integration

## Implementation Phase 2: Accessible Primitives and Icon Convention

<!-- parallelizable: false -->

### Step 2.0: Install UI primitive and icon dependencies in client workspace

Install the selected libraries in the client package and capture lockfile updates as part of the implementation diff.

Commands:
* npm install --workspace apps/client radix-ui lucide-react
* Optional pnpm equivalent: pnpm --filter client add radix-ui lucide-react

Files:
* apps/client/package.json - Add dependency entries for radix-ui and lucide-react
* package-lock.json or pnpm-lock.yaml - Record resolved dependency graph updates

Discrepancy references:
* Addresses DR-01 by converting dependency assumptions into explicit executable steps.

Success criteria:
* Required libraries are present in the client dependency manifest.
* Lockfile updates are committed with dependency additions.

Context references:
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 278-279) - Selected approach requires adding Radix and lucide
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 82-88) - Primitive set and icon rationale

Dependencies:
* Node package manager available in local environment

### Step 2.1: Add accessible primitives wrappers under ui/primitives

Implement thin project-specific wrappers around Radix primitives for Tooltip, Dialog, AlertDialog, ToggleGroup, Tabs, Toast, and a VisuallyHidden helper component. Keep wrappers unopinionated and style through local CSS files and shared tokens.

Files:
* apps/client/src/ui/primitives/Tooltip.tsx - Wrapper around radix tooltip with token-based classes
* apps/client/src/ui/primitives/Tooltip.css - Tooltip styles using semantic color/focus tokens
* apps/client/src/ui/primitives/Dialog.tsx - Wrapper around radix dialog with accessible defaults
* apps/client/src/ui/primitives/Dialog.css - Dialog styles with tokenized surface/border/elevation
* apps/client/src/ui/primitives/AlertDialog.tsx - Wrapper around radix alert dialog with focus-safe actions
* apps/client/src/ui/primitives/AlertDialog.css - Alert dialog styles using semantic tokens
* apps/client/src/ui/primitives/ToggleGroup.tsx - Wrapper around radix toggle group
* apps/client/src/ui/primitives/ToggleGroup.css - Toggle styles with active and focus-visible states
* apps/client/src/ui/primitives/Tabs.tsx - Wrapper around radix tabs with keyboard-first interaction
* apps/client/src/ui/primitives/Tabs.css - Tabs styles and active-state styling
* apps/client/src/ui/primitives/Toast.tsx - Toast provider and utility composition
* apps/client/src/ui/primitives/Toast.css - Toast and viewport styles with reduced-motion support
* apps/client/src/ui/primitives/VisuallyHidden.tsx - Reusable visually hidden utility wrapper

Success criteria:
* Required accessible primitives exist under a single project namespace.
* Wrappers expose ergonomic props while preserving ARIA behavior from Radix.

Context references:
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 9-10) - Required primitive set and icon convention requirement
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 82-87) - Primitive coverage and ARIA behavior
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 269-272) - Provider and component API constraints
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 287-319) - Preferred file tree

Dependencies:
* Step 1.1 completion
* Step 2.0 completion

### Step 2.2: Establish icon convention module backed by lucide-react

Create a single icon export surface and enforce component imports from the local module rather than direct package imports.

Files:
* apps/client/src/ui/icons/index.ts - Re-export curated icon set from lucide-react

Success criteria:
* All new primitives and updated UI imports can consume icons from one local module.
* Icon color inherits from currentColor and semantic tokenized text/icon styles.

Context references:
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 88-88) - lucide-react currentColor behavior
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 326-327) - Icon convention recommendation

Dependencies:
* Step 2.1 completion

### Step 2.3: Add providers in app root composition

Compose TooltipProvider and ToastProvider at the app root and include a toast viewport to ensure primitives function consistently across all screens.

Files:
* apps/client/src/App.tsx - Add provider composition for tooltip and toast

Success criteria:
* Tooltip and toast primitives render correctly with one global provider stack.
* Provider setup does not change existing lobby/canvas interaction behavior.

Context references:
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 269-270) - Provider requirements
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 324-325) - Root composition placement guidance

Dependencies:
* Step 2.1 completion

### Step 2.4: Validate phase changes

Validation commands:
* pnpm --filter client lint - Validate TSX wrapper code and styling references
* pnpm --filter client test -- --run - Verify unit tests remain green

## Implementation Phase 3: Existing UI Migration and Accessibility Hardening

<!-- parallelizable: false -->

### Step 3.1: Incrementally migrate App.css and StatusIndicator.css to semantic tokens

Update current UI styles to consume semantic tokens while preserving existing class names and layout behavior. Maintain compatibility with the current lobby and canvas controls.

Files:
* apps/client/src/App.css - Replace hardcoded values and legacy root usage with semantic tokens; retain compatibility variables during migration
* apps/client/src/ui/StatusIndicator.css - Replace hardcoded status colors with semantic status token variables
* apps/client/src/ui/StatusIndicator.tsx - Replace browser title-only tooltip behavior with primitive-based tooltip usage where applicable

Success criteria:
* Existing controls retain behavior and visual hierarchy.
* Status indicator uses semantic status token palette.

Discrepancy references:
* Addresses DR-03 by explicitly preserving scope boundaries and excluding domain-specific tile picker and palette layout changes.

Context references:
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 59-63) - Current status indicator hardcoded color issue
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 92-95) - Additive migration convention
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 312-317) - Incremental migration target files

Dependencies:
* Phase 1 completion
* Phase 2 completion
* Scope guard: do not modify domain-specific tile picker or palette layout files

### Step 3.2: Enforce minimum touch targets and keyboard-visible focus styles

Adjust button and swatch sizing to meet touch target minimums and ensure keyboard focus states remain clearly visible with the new focus ring tokens.

Files:
* apps/client/src/App.css - Add min-height >= 44px for interactive controls and swatches
* apps/client/src/styles/base.css - Ensure global :focus-visible uses semantic focus tokens

Success criteria:
* Interactive controls meet or exceed 44x44 px target area.
* Keyboard users can consistently identify focused elements.

Context references:
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 12-13) - Minimum touch target and focus indicator requirement
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 104-105) - Existing gap in focus-visible and swatch sizing
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 223-229) - Focus ring token example
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 327-327) - Touch target implementation detail

Dependencies:
* Step 3.1 completion

### Step 3.3: Implement reduced-motion fallbacks

Guard non-essential animations and transitions under prefers-reduced-motion and remove invalid pulse or toast transition effects for reduced-motion users.

Files:
* apps/client/src/App.css - Add reduced-motion guard for invalid-pulse and button transitions
* apps/client/src/styles/base.css - Add shared reduced-motion fallbacks for primitive transitions
* apps/client/src/ui/primitives/Toast.css - Ensure toast enter/exit animations respect reduced-motion settings

Success criteria:
* Animation/transition behavior degrades to no-motion under reduced-motion preference.
* Existing interaction behavior remains intact in standard motion mode.

Context references:
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 11-11) - Reduced-motion requirement
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 57-58) - Existing invalid-pulse risk
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 232-243) - Reduced-motion pattern

Dependencies:
* Step 3.1 completion

### Step 3.4: Validate phase changes

Validation commands:
* pnpm --filter client lint - Verify CSS/TS consistency
* pnpm --filter client test -- --run - Validate existing behavior remains covered

## Implementation Phase 4: Validation

<!-- parallelizable: false -->

### Step 4.1: Run full project validation

Execute all validation commands for the project:
* pnpm lint
* pnpm --filter client build
* pnpm --filter client test -- --run

Bundle-size acceptance gate:
* Build baseline and modified client assets, then compare aggregate assets size in apps/client/dist/assets.
* Pass threshold: total built asset size delta <= 30000 bytes.
* Example commands: `pnpm --filter client build` and `du -sb apps/client/dist/assets`

Discrepancy references:
* Addresses DR-02 by defining explicit bundle-size validation threshold and measurement method.

### Step 4.2: Fix minor validation issues

Iterate on lint errors, build warnings, and test failures. Apply fixes directly when corrections are straightforward and isolated.

### Step 4.3: Report blocking issues

When validation failures require changes beyond minor fixes:
* Document the issues and affected files.
* Provide the user with next steps.
* Recommend additional research and planning rather than inline fixes.
* Avoid large-scale refactoring within this phase.

## Implementation Phase 5: Post-Review Remediation

<!-- parallelizable: false -->

### Step 5.1: Resolve VisuallyHidden stylesheet artifact mismatch

Remove the stale `VisuallyHidden.css` artifact that was previously logged as removed so repository state matches the release changes record.

Files:
* apps/client/src/ui/primitives/VisuallyHidden.css - Remove duplicate utility stylesheet

Success criteria:
* Repository state matches recorded removal in the changes log.
* No primitive import depends on the removed stylesheet.

Dependencies:
* Phase 4 completion

### Step 5.2: Guarantee status trigger touch-target minimum

Apply explicit tokenized minimum dimensions to the status error-details trigger to guarantee 44x44 touch targets on that interactive path.

Files:
* apps/client/src/ui/StatusIndicator.css - Add `min-width` and `min-height` using `--touch-target-min`

Success criteria:
* Status error-details trigger meets minimum touch target dimensions.
* Existing indicator visuals and interaction remain unchanged.

Dependencies:
* Step 5.1 completion

### Step 5.3: Add wrapper smoke tests for remaining primitives

Add lightweight render-path and class/role smoke tests for primitive wrappers that lacked direct coverage.

Files:
* apps/client/src/ui/primitives/Dialog.test.tsx
* apps/client/src/ui/primitives/AlertDialog.test.tsx
* apps/client/src/ui/primitives/ToggleGroup.test.tsx
* apps/client/src/ui/primitives/Tabs.test.tsx
* apps/client/src/ui/primitives/Toast.test.tsx

Success criteria:
* New wrapper tests pass and validate core render roles/classes.
* Existing client tests remain green.

Dependencies:
* Step 5.2 completion

### Step 5.4: Validate remediation scope

Validation commands:
* npm run lint --workspace=apps/client
* npm run test --workspace=apps/client -- --run

Expected outcome:
* Lint passes
* Tests pass with expanded wrapper coverage
* Bundle-size blocker remains tracked as out-of-scope for this remediation pass

## Dependencies

* Node.js and pnpm toolchain used by the client workspace
* Radix UI packages for required primitives
* lucide-react for icon convention support

## Success Criteria

* Shared token architecture and base accessibility primitives are implemented in apps/client/src.
* Existing lobby/canvas behavior is preserved while meeting focus, touch-target, and reduced-motion requirements.
