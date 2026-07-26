<!-- markdownlint-disable-file -->
# Task Review: Visual Tile Picker

## Review Metadata

* Date: 2026-07-26
* Related Plan: .copilot-tracking/plans/2026-07-26/visual-tile-picker-plan.instructions.md
* Changes Log: .copilot-tracking/changes/2026-07-26/visual-tile-picker-changes.md
* Research Document: .copilot-tracking/research/2026-07-26/visual-tile-picker-research.md
* Review Log: .copilot-tracking/reviews/2026-07-26/visual-tile-picker-plan-review.md

## Validation Scope

* Artifact discovery complete from attached changes log and linked plan/research files.
* Plan phases identified: 5
* Phase-level RPI validation: Complete
* Implementation quality validation: Complete
* Validation commands: Complete

## Findings Summary

* Critical: 0
* Major: 2
* Minor: 5

## Phase Validation Results

* Phase 1: Partial
	* Verdict: Partial due to evidence specificity gap only.
	* Evidence: .copilot-tracking/reviews/rpi/2026-07-26/visual-tile-picker-plan-001-validation.md
	* Findings: 0 critical, 0 major, 1 minor.
* Phase 2: Passed
	* Verdict: Pass with one modality-test evidence gap.
	* Evidence: .copilot-tracking/reviews/rpi/2026-07-26/visual-tile-picker-plan-002-validation.md
	* Findings: 0 critical, 0 major, 1 minor.
* Phase 3: Partial
	* Verdict: Partial due to missing explicit CSS-state/visual assertion evidence.
	* Evidence: .copilot-tracking/reviews/rpi/2026-07-26/visual-tile-picker-plan-003-validation.md
	* Findings: 0 critical, 1 major, 1 minor.
* Phase 4: Passed
	* Verdict: Full pass with complete test and drift-guard traceability.
	* Evidence: .copilot-tracking/reviews/rpi/2026-07-26/visual-tile-picker-plan-004-validation.md
	* Findings: 0 critical, 0 major, 0 minor.
* Phase 5: Partial
	* Verdict: Partial due to missing reproducible command artifacts in original change log.
	* Evidence: .copilot-tracking/reviews/rpi/2026-07-26/visual-tile-picker-plan-005-validation.md
	* Findings: 0 critical, 1 major, 1 minor.

## Implementation Quality Findings

Source: Implementation Validator run, full-quality scope.

* Major
	* Missing explicit keyboard-path interaction tests for shape radios (arrow navigation and Space/Enter activation).
		* Evidence: apps/client/src/ui/TilePalette.test.tsx
	* Placement persistence coverage does not include rejected-ack or delayed-ack timing variants.
		* Evidence: apps/client/src/App.test.tsx
* Minor
	* Shape radio accessible names use token strings instead of user-facing label text.
		* Evidence: apps/client/src/ui/TilePalette.tsx
	* Tile palette callbacks rely on unchecked string-to-union assertions.
		* Evidence: apps/client/src/ui/TilePalette.tsx
	* Preview path generation is recomputed on each render without memoization (low impact for current shape count).
		* Evidence: apps/client/src/ui/TileShapePreview.tsx, apps/client/src/ui/tileShapePreviewGeometry.ts

## Validation Command Results

Commands executed during this review:

* `npm run --prefix apps/client lint`
	* Result: Pass
* `npm run --prefix apps/client build`
	* Result: Pass
	* Note: Existing non-blocking chunk-size warning persisted.
* `npm run --prefix apps/client test -- --run`
	* Result: Pass
	* Summary: 16/16 test files passed, 79/79 tests passed.

Diagnostic checks:

* `get_errors` on all changed implementation files: no editor diagnostics reported.
* Port/process hygiene check:
	* `lsof -i :3001 && lsof -i :5173` produced no output, indicating no listeners on both ports.

## Missing Work and Deviations

* Missing reproducible validation transcript links in the original changes log for Phase 5 Step 5.1.
* CSS interaction-state validation evidence is weaker than requested by plan Step 3.3.
* Modality test evidence is incomplete for explicit keyboard and touch-equivalent paths.
* Additional deviating change documented and accepted:
	* Geometry utility extracted to separate helper module to satisfy lint/export constraints.
	* Nullability fix in preview test introduced during validation.

## Follow-Up Recommendations

### Deferred from Scope

* Track and prioritize mitigation of the existing Vite chunk-size warning in a separate performance-focused task.
* Consider optional visual regression tooling for future UI-state hardening (for example snapshot/diff in CI).

### Discovered During Review

* Add keyboard-path tests for shape selection radios in tile palette coverage.
* Add rejected/delayed placement acknowledgement regression variants to app integration tests.
* Consider replacing token-based accessible names with user-facing labels for shape radios.
* Add small runtime guard for ToggleGroup callback value narrowing instead of direct assertion casts.

## Overall Status

Needs Rework

## Reviewer Notes

Review completed across all required phases.

Status rationale:

* 0 critical findings.
* 2 major findings remain open.
* 5 minor findings remain open.

Because major findings remain in testing and evidence completeness, this review is marked Needs Rework.