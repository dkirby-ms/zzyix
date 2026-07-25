<!-- markdownlint-disable-file -->
# Implementation Validation: UX Design Tokens and Accessible Primitives

## Metadata

* Date: 2026-07-25
* Scope: full-quality
* Plan: .copilot-tracking/plans/2026-07-25/ux-design-tokens-and-accessible-primitives-plan.instructions.md
* Changes: .copilot-tracking/changes/2026-07-25/ux-design-tokens-and-accessible-primitives-changes.md
* Research: .copilot-tracking/research/2026-07-25/ux-design-tokens-research.md

## Status

* Failed

## Severity Counts

* Critical: 0
* Major: 3
* Minor: 3

## Findings by Category

### Performance

#### Major IV-001: Bundle-size acceptance gate is failing by a large margin

* Evidence:
  * .copilot-tracking/changes/2026-07-25/ux-design-tokens-and-accessible-primitives-changes.md:65
  * .copilot-tracking/changes/2026-07-25/ux-design-tokens-and-accessible-primitives-changes.md:84
* Impact: Task acceptance criterion remains unmet, blocking release readiness for this work item.
* Recommendation: Add size-budget checks in CI for client chunks and split or lazy-load primitives not used on initial route, then re-measure against the <=30000-byte delta target.

### Accessibility

#### Major IV-002: Touch-target minimum is not enforced for the status error-details trigger

* Evidence:
  * apps/client/src/ui/StatusIndicator.css:14
  * apps/client/src/ui/StatusIndicator.css:1
  * apps/client/src/ui/StatusIndicator.tsx:45
* Impact: The stated 44x44 touch-target requirement is not guaranteed for at least one interactive control.
* Recommendation: Add min-height and min-width using tokenized touch-target values on the trigger class, or enforce the constraint on the indicator child.

### Testing

#### Major IV-003: New primitive wrappers are largely untested beyond tooltip and status paths

* Evidence:
  * apps/client/src/ui/primitives/Tooltip.test.tsx:1
  * apps/client/src/ui/StatusIndicator.test.tsx:10
  * apps/client/src/ui/primitives/Dialog.tsx:1
  * apps/client/src/ui/primitives/AlertDialog.tsx:1
  * apps/client/src/ui/primitives/ToggleGroup.tsx:1
  * apps/client/src/ui/primitives/Tabs.tsx:1
  * apps/client/src/ui/primitives/Toast.tsx:1
  * apps/client/src/ui/primitives/VisuallyHidden.tsx:1
* Impact: Keyboard, focus, and ARIA regressions in new wrappers could ship undetected.
* Recommendation: Add at least one accessibility-focused interaction test per primitive wrapper.

### Maintainability

#### Minor IV-004: Classname utility is duplicated across primitive wrappers

* Evidence:
  * apps/client/src/ui/primitives/Tooltip.tsx:5
  * apps/client/src/ui/primitives/Dialog.tsx:5
  * apps/client/src/ui/primitives/AlertDialog.tsx:5
  * apps/client/src/ui/primitives/ToggleGroup.tsx:5
  * apps/client/src/ui/primitives/Tabs.tsx:5
  * apps/client/src/ui/primitives/Toast.tsx:5
  * apps/client/src/ui/primitives/VisuallyHidden.tsx:4
* Impact: Repeated utility logic increases maintenance overhead and inconsistency risk.
* Recommendation: Move to a shared helper module.

#### Minor IV-005: Changes log says VisuallyHidden.css was removed, but it still exists

* Evidence:
  * .copilot-tracking/changes/2026-07-25/ux-design-tokens-and-accessible-primitives-changes.md:52
  * apps/client/src/ui/primitives/VisuallyHidden.css:1
  * apps/client/src/ui/primitives/VisuallyHidden.tsx:10
* Impact: Artifact drift weakens release-note and audit accuracy.
* Recommendation: Delete the stale file or correct the changes log to match repository state.

#### Minor IV-006: Semantic-token migration remains partial in App.css

* Evidence:
  * apps/client/src/App.css:170
  * apps/client/src/App.css:231
  * apps/client/src/App.css:308
* Impact: Reduces consistency and themeability benefits of the token architecture.
* Recommendation: Continue incremental conversion of hardcoded visual values to semantic tokens.

## Category Totals

* Correctness: 1
* Accessibility: 1
* Performance: 1
* Maintainability: 3
* Testing: 1

## Top Risks

* Bundle-size gate failure remains a release blocker.
* Touch-target requirement is not fully met for one interactive path.
* Wrapper coverage is insufficient for confidence in accessibility behavior.

## Open Questions

1. Is the <=30000-byte bundle delta an absolute merge gate for this task?
2. Should 44x44 enforcement apply to every interactive control, including compact status controls?
3. Should minimum per-primitive accessibility test requirements be codified in the plan template?
