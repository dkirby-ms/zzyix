---
applyTo: '.copilot-tracking/changes/2026-07-25/ux-design-tokens-and-accessible-primitives-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: UX Design Tokens and Accessible UI Primitives

## Overview

Implement a tokenized and accessible client-side UI foundation for apps/client/src by introducing semantic CSS design tokens, Radix-based primitive wrappers, icon conventions, and reduced-motion/touch-target/focus accessibility hardening without disrupting existing lobby and canvas behavior.

## Objectives

### User Requirements

* Introduce shared CSS tokens for color, spacing, radius, elevation, typography, focus, and motion. Source: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 8-8)
* Add accessible UI primitives: tooltip, dialog, alert dialog, toggle group, tabs, toast, and visually hidden labels. Source: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 9-9)
* Establish icon convention and reduced-motion support. Source: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 10-11)
* Ensure minimum 44x44 touch targets and visible keyboard focus indicators. Source: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 12-13)
* Scope styles safely to avoid regressions in existing lobby/canvas controls. Source: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 13-13)

### Derived Objectives

* Preserve additive migration behavior by retaining class names and updating styles incrementally. Derived from: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 92-95)
* Standardize provider placement for tooltip and toast at the app root to avoid duplicate provider stacks. Derived from: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 269-270, 324-325)
* Create a local icon adapter module to isolate feature code from direct third-party icon imports. Derived from: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 88-88, 326-327)

## Context Summary

### Project Files

* apps/client/src/App.css - Global stylesheet with existing button/swatch/animation behaviors requiring token and accessibility hardening
* apps/client/src/index.css - Minimal reset currently lacking token architecture
* apps/client/src/main.tsx - Bootstrap entrypoint for global style import wiring
* apps/client/src/ui/StatusIndicator.css - Hardcoded status colors to migrate to semantic tokens
* apps/client/src/ui/StatusIndicator.tsx - Candidate for tooltip primitive integration

### References

* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md - Primary research and selected implementation scenario
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/prompts/hve-core/task-plan.prompt.md - Planning prompt requirements used for this output

### Standards References

* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 80-81) - DTCG two-tier primitive/semantic token model
* .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 82-87) - Radix accessibility coverage and primitive set feasibility

## Implementation Checklist

### [x] Implementation Phase 1: Foundation Tokens and Base Styling

<!-- parallelizable: false -->

* [x] Step 1.1: Create primitive and semantic token files plus base styles
  * Details: .copilot-tracking/details/2026-07-25/ux-design-tokens-and-accessible-primitives-details.md (Lines 12-32)
* [x] Step 1.2: Wire global styles import in client bootstrap
  * Details: .copilot-tracking/details/2026-07-25/ux-design-tokens-and-accessible-primitives-details.md (Lines 34-50)
* [x] Step 1.3: Validate phase changes
  * Run lint and build commands for modified files
  * Skip only if validation conflicts with parallel phases

### [x] Implementation Phase 2: Accessible Primitives and Icon Convention

<!-- parallelizable: false -->

* [x] Step 2.0: Install Radix and lucide dependencies in client workspace
  * Details: .copilot-tracking/details/2026-07-25/ux-design-tokens-and-accessible-primitives-details.md (Lines 64-88)
* [x] Step 2.1: Implement Radix wrappers for required primitives under ui/primitives
  * Details: .copilot-tracking/details/2026-07-25/ux-design-tokens-and-accessible-primitives-details.md (Lines 90-121)
* [x] Step 2.2: Create local icon export convention module
  * Details: .copilot-tracking/details/2026-07-25/ux-design-tokens-and-accessible-primitives-details.md (Lines 123-139)
* [x] Step 2.3: Add tooltip and toast providers at app root
  * Details: .copilot-tracking/details/2026-07-25/ux-design-tokens-and-accessible-primitives-details.md (Lines 141-157)
* [x] Step 2.4: Validate phase changes
  * Run lint and targeted tests for client package

### [x] Implementation Phase 3: Existing UI Migration and Accessibility Hardening

<!-- parallelizable: false -->

* [x] Step 3.1: Migrate App.css and StatusIndicator styles to semantic tokens incrementally
  * Details: .copilot-tracking/details/2026-07-25/ux-design-tokens-and-accessible-primitives-details.md (Lines 169-193)
* [x] Step 3.2: Enforce 44x44 touch targets and visible keyboard focus states
  * Details: .copilot-tracking/details/2026-07-25/ux-design-tokens-and-accessible-primitives-details.md (Lines 195-214)
* [x] Step 3.3: Add prefers-reduced-motion fallbacks across legacy and primitive styles
  * Details: .copilot-tracking/details/2026-07-25/ux-design-tokens-and-accessible-primitives-details.md (Lines 216-235)
* [x] Step 3.4: Validate phase changes
  * Run lint and targeted tests for behavior safety
* [x] Step 3.5: Enforce scope guard exclusions
  * Keep domain-specific tile picker and palette layout files out of this implementation
  * Details: .copilot-tracking/details/2026-07-25/ux-design-tokens-and-accessible-primitives-details.md (Lines 190-193)

### [x] Implementation Phase 4: Validation

<!-- parallelizable: false -->

* [x] Step 4.1: Run full project validation
  * Execute all lint commands (pnpm lint and client-scoped lint)
  * Execute build scripts for modified components
  * Run test suites covering modified code
  * Enforce bundle-size acceptance threshold (<= 30000 bytes total asset delta)
  * Details: .copilot-tracking/details/2026-07-25/ux-design-tokens-and-accessible-primitives-details.md (Lines 247-262)
* [x] Step 4.2: Fix minor validation issues
  * Iterate on lint errors and build warnings
  * Apply straightforward isolated fixes directly
* [x] Step 4.3: Report blocking issues
  * Document issues requiring additional research
  * Provide next steps and recommended follow-up planning
  * Avoid large-scale fixes in this phase

### [x] Implementation Phase 5: Post-Review Remediation

<!-- parallelizable: false -->

* [x] Step 5.1: Resolve artifact mismatch for VisuallyHidden stylesheet
  * Removed stale file and aligned repository state with release changes tracking.
* [x] Step 5.2: Guarantee 44x44 touch target on status error-details trigger path
  * Enforced tokenized minimum dimensions for the interactive status trigger.
* [x] Step 5.3: Expand primitive wrapper smoke-test coverage
  * Added focused wrapper tests for Dialog, AlertDialog, ToggleGroup, Tabs, and Toast.
* [x] Step 5.4: Validate remediation changes
  * Executed client lint and tests with npm workspace commands in this environment.

## Planning Log

See .copilot-tracking/plans/logs/2026-07-25/ux-design-tokens-and-accessible-primitives-log.md for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Node.js and pnpm workspace tooling
* Radix UI primitive packages
* lucide-react icon package
* Existing React + TypeScript + Vite client setup

## Success Criteria

* Token architecture and accessibility primitives are implemented under apps/client/src with primitive and semantic layers. Traces to: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 8-13, 276-327)
* Existing lobby/canvas behavior remains stable while focus visibility, touch target sizing, and reduced-motion support meet requirements. Traces to: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 12-13, 22-24, 104-105)
* Status indicator and related UI styles use semantic token aliases instead of hardcoded values. Traces to: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md (Lines 59-60, 176-180)
