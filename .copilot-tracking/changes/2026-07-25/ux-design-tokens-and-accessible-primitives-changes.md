<!-- markdownlint-disable-file -->
# Release Changes: UX Design Tokens and Accessible UI Primitives

**Related Plan**: ux-design-tokens-and-accessible-primitives-plan.instructions.md
**Implementation Date**: 2026-07-25

## Summary

Implement a tokenized and accessible UI foundation in the client app with semantic CSS tokens, Radix-based primitive wrappers, icon conventions, and accessibility hardening while preserving existing lobby and canvas behavior.

## Changes

### Added

* apps/client/src/styles/tokens/primitives.css - Added primitive token scale for color, spacing, radius, elevation, typography, focus, motion, and touch target sizing
* apps/client/src/styles/tokens/semantic.css - Added semantic token aliases and compatibility aliases for existing style variables
* apps/client/src/styles/base.css - Added global focus-visible styling, visually-hidden utility, and reduced-motion fallback rules
* apps/client/src/styles/index.css - Added token and base import chain for global style composition
* apps/client/src/ui/primitives/Tooltip.tsx - Added Radix tooltip wrapper with provider and trigger/content helpers
* apps/client/src/ui/primitives/Tooltip.css - Added tokenized tooltip styles
* apps/client/src/ui/primitives/Dialog.tsx - Added Radix dialog wrapper primitives
* apps/client/src/ui/primitives/Dialog.css - Added tokenized dialog styles
* apps/client/src/ui/primitives/AlertDialog.tsx - Added Radix alert dialog wrapper primitives
* apps/client/src/ui/primitives/AlertDialog.css - Added tokenized alert dialog styles
* apps/client/src/ui/primitives/ToggleGroup.tsx - Added Radix toggle group wrapper primitives
* apps/client/src/ui/primitives/ToggleGroup.css - Added tokenized toggle group styles
* apps/client/src/ui/primitives/Tabs.tsx - Added Radix tabs wrapper primitives
* apps/client/src/ui/primitives/Tabs.css - Added tokenized tabs styles
* apps/client/src/ui/primitives/Toast.tsx - Added Radix toast wrapper and provider utilities
* apps/client/src/ui/primitives/Toast.css - Added tokenized toast and viewport styles
* apps/client/src/ui/primitives/VisuallyHidden.tsx - Added visually hidden wrapper component
* apps/client/src/ui/icons/index.ts - Added local icon adapter exports backed by lucide-react
* apps/client/src/ui/StatusIndicator.test.tsx - Added accessibility interaction tests for status error tooltip keyboard focus behavior
* apps/client/src/ui/primitives/Tooltip.test.tsx - Added low-cost smoke test for tooltip wrapper render path

### Modified

* apps/client/src/main.tsx - Wired global stylesheet import for the token and base style stack
* apps/client/src/App.tsx - Added root TooltipProvider and ToastProvider composition with toast viewport
* apps/client/package.json - Added Radix primitive packages and lucide-react dependencies
* package-lock.json - Updated dependency lock graph for UI primitives and icon packages
* apps/client/src/App.css - Migrated selected hardcoded status/debug colors to semantic tokens, added touch-target minimums, focus-visible rules, and reduced-motion fallbacks
* apps/client/src/ui/StatusIndicator.css - Migrated state colors to semantic status token variables and added reduced-motion fallback
* apps/client/src/ui/StatusIndicator.tsx - Replaced title-only error affordance with primitive Tooltip composition and keyboard-focusable button trigger for accessible error details
* apps/client/src/styles/tokens/semantic.css - Added semantic status background/border/ring aliases used by existing UI states
* apps/client/src/styles/base.css - Strengthened global focus-visible fallback values and reduced-motion no-animation fallback behavior
* apps/client/src/ui/primitives/VisuallyHidden.tsx - Consolidated visually-hidden utility usage to shared base class
* apps/client/src/test/setup.ts - Added minimal ResizeObserver test polyfill for Radix tooltip tests in JSDOM

### Removed

* apps/client/src/ui/primitives/VisuallyHidden.css - Removed duplicate visually-hidden utility stylesheet in favor of shared base utility

## Additional or Deviating Changes

* Validation command deviation for Phase 1
	* Plan-specified pnpm filter commands could not target the client package in this repository state, so equivalent npm client-scoped lint and build commands were used and passed.
* Validation command deviation for Phase 2
	* Plan-specified pnpm filter commands could not be executed in this repository state, so equivalent npm workspace lint and test commands were used and passed.
* Validation command deviation for Phase 3
	* Direct `pnpm` binary was unavailable in PATH for the execution shell; equivalent npm workspace lint and test commands were used and passed.
* Phase 4 bundle-size gate failure
	* Baseline client build assets measured from clean HEAD: 1176436 bytes.
	* Modified client build assets measured after implementation: 1587574 bytes.
	* Delta: 411138 bytes, exceeding the acceptance threshold of 30000 bytes.
* Phase 4 Step 4.2 remediation loop completed with targeted isolated fixes
	* Keyboard-focus reliability fixed for status error tooltip trigger by using a semantic button trigger.
	* Added focused coverage for status tooltip keyboard interaction and tooltip wrapper render path.
	* Consolidated duplicate visually-hidden utility definitions to one canonical class in base styles.
	* Re-ran required validations with npm equivalents per environment constraints.

## Release Summary

Implemented tokenized styling and accessible UI primitive foundations in the client app with additive migration safety.

Code changes summary (excluding .copilot-tracking artifacts):
* Added 21 files: token/base stylesheet stack, Radix primitive wrappers, icon adapter module, and targeted accessibility test coverage.
* Modified 10 files: client dependency manifest, lockfile, app root composition, bootstrap style wiring, existing UI style/component migration targets, and test setup/utilities.
* Removed 1 file: duplicate visually-hidden utility stylesheet consolidated to base styles.

Validation summary:
* Lint and client tests passed using workspace npm commands.
* Client build passed with the existing large-chunk warning unchanged.
* Bundle-size acceptance gate failed: +411138 bytes vs required <= 30000 bytes.

Deployment notes:
* No infrastructure or server runtime changes were made.
* Additional optimization work is required before the bundle-size gate can be considered passing.
