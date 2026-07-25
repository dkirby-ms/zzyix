<!-- markdownlint-disable-file -->
# Task Review: UX Design Tokens and Accessible UI Primitives

## Metadata

* Review Date: 2026-07-25
* Plan: .copilot-tracking/plans/2026-07-25/ux-design-tokens-and-accessible-primitives-plan.instructions.md
* Changes Log: .copilot-tracking/changes/2026-07-25/ux-design-tokens-and-accessible-primitives-changes.md
* Research: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md
* Review Log: .copilot-tracking/reviews/2026-07-25/ux-design-tokens-and-accessible-primitives-plan-review.md

## Validation Scope Resolution

* Source priority used: attached and open artifacts first, then discovered related plan and research by date and task description
* Scope outcome: single artifact set for 2026-07-25 task
* Conversation-context inclusion: enabled and applied to select current changes log attachment as primary artifact

## Findings Summary

* Critical: 1
* Major: 4
* Minor: 6

## RPI Phase Validation

* Phase 1: Pass
  * Output: .copilot-tracking/reviews/rpi/2026-07-25/ux-design-tokens-and-accessible-primitives-plan-001-validation.md
  * Findings: 0 critical, 0 major, 2 minor
* Phase 2: Partial
  * Output: .copilot-tracking/reviews/rpi/2026-07-25/ux-design-tokens-and-accessible-primitives-plan-002-validation.md
  * Findings: 0 critical, 1 major, 0 minor
* Phase 3: Pass
  * Output: .copilot-tracking/reviews/rpi/2026-07-25/ux-design-tokens-and-accessible-primitives-plan-003-validation.md
  * Findings: 0 critical, 0 major, 0 minor
* Phase 4: Failed
  * Output: .copilot-tracking/reviews/rpi/2026-07-25/ux-design-tokens-and-accessible-primitives-plan-004-validation.md
  * Findings: 1 critical, 0 major, 1 minor

## Implementation Quality Validation

* Status: Failed
* Output: .copilot-tracking/reviews/implementation/2026-07-25/ux-design-tokens-and-accessible-primitives-plan-implementation-validation.md
* Findings: 0 critical, 3 major, 3 minor

## Synthesized Findings

### Critical

1. Bundle-size acceptance gate failed and blocks Phase 4 completion.
   * Evidence:
     * .copilot-tracking/plans/2026-07-25/ux-design-tokens-and-accessible-primitives-plan.instructions.md:100
     * .copilot-tracking/changes/2026-07-25/ux-design-tokens-and-accessible-primitives-changes.md:62
     * .copilot-tracking/changes/2026-07-25/ux-design-tokens-and-accessible-primitives-changes.md:63

### Major

1. Changes-log artifact mismatch: `VisuallyHidden.css` is documented as removed but remains in repository.
   * Evidence:
     * .copilot-tracking/changes/2026-07-25/ux-design-tokens-and-accessible-primitives-changes.md:52
     * apps/client/src/ui/primitives/VisuallyHidden.css:1
2. Touch-target minimum is not guaranteed for the status error-details trigger path.
   * Evidence:
     * apps/client/src/ui/StatusIndicator.css:14
     * apps/client/src/ui/StatusIndicator.tsx:45
3. Wrapper test coverage is insufficient for newly added primitive surfaces.
   * Evidence:
     * apps/client/src/ui/primitives/Tooltip.test.tsx:1
     * apps/client/src/ui/primitives/Dialog.tsx:1
     * apps/client/src/ui/primitives/AlertDialog.tsx:1
     * apps/client/src/ui/primitives/ToggleGroup.tsx:1
     * apps/client/src/ui/primitives/Tabs.tsx:1
     * apps/client/src/ui/primitives/Toast.tsx:1
4. Phase 2 status remains partial until artifact mismatch is resolved.
   * Evidence:
     * .copilot-tracking/reviews/rpi/2026-07-25/ux-design-tokens-and-accessible-primitives-plan-002-validation.md

### Minor

1. Validation command form deviated from plan toolchain (`pnpm` planned, `npm` used).
   * Evidence:
     * .copilot-tracking/plans/2026-07-25/ux-design-tokens-and-accessible-primitives-plan.instructions.md:97
     * .copilot-tracking/changes/2026-07-25/ux-design-tokens-and-accessible-primitives-changes.md:56
2. Phase-attribution traceability in release changes is broad and increases manual validation effort.
   * Evidence:
     * .copilot-tracking/changes/2026-07-25/ux-design-tokens-and-accessible-primitives-changes.md:19
3. `classnames` helper is duplicated across multiple primitive wrapper files.
   * Evidence:
     * apps/client/src/ui/primitives/Tooltip.tsx:5
     * apps/client/src/ui/primitives/Dialog.tsx:5
     * apps/client/src/ui/primitives/AlertDialog.tsx:5
     * apps/client/src/ui/primitives/ToggleGroup.tsx:5
     * apps/client/src/ui/primitives/Tabs.tsx:5
     * apps/client/src/ui/primitives/Toast.tsx:5
4. Semantic token migration remains partial in `App.css` by design and should continue incrementally.
   * Evidence:
     * apps/client/src/App.css:170
     * apps/client/src/App.css:231
     * apps/client/src/App.css:308
5. Global reduced-motion baseline may suppress some desirable non-essential transitions.
   * Evidence:
     * apps/client/src/styles/base.css:25
6. Icon-adapter convention exists but lacks automated enforcement.
   * Evidence:
     * apps/client/src/ui/icons/index.ts:1

## Validation Commands

* `npm run lint`
  * Status: Pass
* `npm run test --workspace=apps/client`
  * Status: Pass
  * Result: 8 passed files, 49 passed tests
* `npm run build --workspace=apps/client`
  * Status: Pass with warning
  * Warning: chunk-size warning for large JS asset
  * Output highlights:
    * dist/assets/index-BSwV22kq.js: 1,573.06 kB (gzip 442.38 kB)

## Missing Work and Deviations

* Missing work
  * Satisfy bundle-size acceptance threshold or formally approve/redefine gate metric.
  * Resolve Phase 2 artifact mismatch by either removing `apps/client/src/ui/primitives/VisuallyHidden.css` or correcting the changes log.
  * Add accessibility-focused tests for newly introduced wrappers beyond tooltip/status flows.
  * Enforce 44x44 touch-target guarantee for the status error-details trigger path.
* Deviations
  * Validation command execution used npm workspace commands instead of plan-specified pnpm commands due environment constraints.

## Follow-Up Recommendations

### Deferred From Scope

* Continue semantic-token replacement for remaining hardcoded style values in `apps/client/src/App.css`.
* Consolidate duplicated `classnames` logic into shared utility.
* Add lint rule or import-boundary rule to enforce icon usage via `apps/client/src/ui/icons/index.ts`.

### Discovered During Review

* Clarify bundle-size gate definition (raw total bytes vs JS-only vs gzip delta) and codify it in plan templates.
* Standardize validation command language across plans to repository-available tooling.
* Align release changes logs with repository state before review closure.

## Overall Status

* Needs Rework

Status rationale:

* Critical bundle-size gate remains failed.
* Major correctness and accessibility gaps remain unresolved.
* Phase 2 remains partial until artifact-state mismatch is fixed.

## Reviewer Notes

* RPI validation was refreshed for all four phases and outputs were updated under .copilot-tracking/reviews/rpi/2026-07-25/.
* Implementation quality validation was completed and persisted under .copilot-tracking/reviews/implementation/2026-07-25/.
* Command validation was re-run in this workspace and corroborates lint/test pass and build pass-with-warning, with unresolved bundle-size gate failure as the blocker.
