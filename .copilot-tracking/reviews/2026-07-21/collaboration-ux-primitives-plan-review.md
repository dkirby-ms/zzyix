<!-- markdownlint-disable-file -->
# Task Review: Collaboration UX Primitives

## Review Metadata

* Review Date: 2026-07-21
* Related Plan: .copilot-tracking/plans/2026-07-21/collaboration-ux-primitives-plan.instructions.md
* Changes Log: .copilot-tracking/changes/2026-07-21/collaboration-ux-primitives-changes.md
* Research Document: .copilot-tracking/research/2026-07-21/collaboration-ux-primitives-research.md
* Reviewer Mode: Task Reviewer

## Review Scope Resolution

* Scope source priority applied: attached changes log, related plan path in changes log, matched-date research artifact.
* Plan phases discovered: 4
* Validation approach: parallel RPI phase validation, implementation quality validation, and command verification.

## Status

* Current phase: Phase 4 complete.
* Overall status: Needs Rework.

## RPI Validation Synthesis

### Per-Phase Status

* Phase 1: Passed.
	* Source: .copilot-tracking/reviews/rpi/2026-07-21/collaboration-ux-primitives-plan-001-validation.md
* Phase 2: Passed with minor reproducibility note.
	* Source: .copilot-tracking/reviews/rpi/2026-07-21/collaboration-ux-primitives-plan-002-validation.md
* Phase 3: Partial.
	* Source: .copilot-tracking/reviews/rpi/2026-07-21/collaboration-ux-primitives-plan-003-validation.md
* Phase 4: Partial.
	* Source: .copilot-tracking/reviews/rpi/2026-07-21/collaboration-ux-primitives-plan-004-validation.md

### Aggregated RPI Severity Counts

* Critical: 0
* Major: 2
* Minor: 4

### RPI Findings

* Major: Missing direct automated tests for throttling semantics supporting contention resilience in apps/client/src/App.tsx.
	* Evidence: apps/client/src/App.tsx#L413, apps/client/src/App.tsx#L454, apps/client/src/App.test.tsx#L213
* Major: Multi-socket leave correctness is not fully validated through the actual disconnect emission gate path.
	* Evidence: apps/server/src/index.ts#L1095, apps/server/src/index.integration.test.ts#L235
* Minor: Validation command reproducibility ambiguity noted for server tests when using root alias; explicit workspace test command is deterministic.
	* Evidence: .copilot-tracking/reviews/rpi/2026-07-21/collaboration-ux-primitives-plan-002-validation.md
* Minor: Client lint warnings remain during final validation.
	* Evidence: apps/client/src/App.tsx#L86, apps/client/src/App.tsx#L119
* Minor: Changes-log file count summary appears inconsistent with listed modified files.
	* Evidence: .copilot-tracking/changes/2026-07-21/collaboration-ux-primitives-changes.md#L59
* Minor: Changes-log claim references deterministic throttling-related assertions, but explicit throttle assertions are not evident.
	* Evidence: .copilot-tracking/changes/2026-07-21/collaboration-ux-primitives-changes.md#L49, apps/client/src/App.test.tsx#L213

## Implementation Quality Validation

* Validator: Implementation Validator
* Scope: full-quality
* Source summary: subagent output in review session

### Quality Severity Counts

* Critical: 0
* Major: 4
* Minor: 0

### Quality Findings

* Major: Process-local multi-socket membership can misreport leave behavior under scaled multi-replica conditions.
	* Evidence: apps/server/src/index.ts#L55, apps/server/src/index.ts#L415, apps/server/src/index.ts#L1096, docs/decisions/2026-07-15-deployment-architecture-v01.md#L95
* Major: Remote selection rendering does repeated linear tile lookup per collaborator on render path.
	* Evidence: apps/client/src/render/MosaicScene.tsx#L300
* Major: Snapshot reconciliation can preserve ghost-present collaborators after snapshot omission; stale eviction does not clear present state.
	* Evidence: apps/client/src/App.tsx#L111, apps/client/src/App.tsx#L134, apps/client/src/App.tsx#L747
* Major: Selection fanout integration coverage does not exercise full production handler guards and membership checks end-to-end.
	* Evidence: apps/server/src/index.integration.test.ts#L501, apps/server/src/index.ts#L1039

## Validation Commands

### Executed Commands and Results

* `npm run lint:client`: Pass with warnings.
	* Warning evidence: apps/client/src/App.tsx#L86, apps/client/src/App.tsx#L119
* `npm run lint:server`: Pass.
* `npm run test:client`: Pass (5 files, 32 tests).
* `npm run test:server`: Pass (5 files, 48 tests).
* `npm run build:client`: Pass with non-blocking Vite chunk-size warning.
* `npm run build:server`: Pass.

## Missing Work and Deviations

* Missing: Deterministic tests for pointer/selection throttling behaviors under contention remain unimplemented.
* Missing: Disconnect-handler-path integration validation for last-socket-only `client_left` fanout remains incomplete.
* Deviation: Release summary metadata in the changes log appears internally inconsistent in modified-file counts.
* Deviation: Validation command wording around server tests should prefer explicit workspace invocation for reproducibility.

## Follow-Up Recommendations

### Deferred from Scope

* Evaluate and optimize client bundle chunking to address repeated non-blocking Vite warning.

### Discovered During Review

* Add fake-timer tests in apps/client/src/App.test.tsx for throttled pointer/selection emission behavior.
* Add server integration tests that drive real `selection_update` and disconnect handler paths with membership mismatch and multi-socket churn.
* Decide presence authority model: snapshot-authoritative roster vs transient-preserving roster, then codify tests.
* For multi-replica readiness, move leave-gating membership source from process-local memory to shared state or enforce deployment constraints explicitly.
* Refactor remote selection tile resolution to use O(1) tile index mapping in render path.

## Overall Status Determination

* Status: Needs Rework.
* Rationale: No critical findings, but unresolved major findings remain across Phase 3 traceability and implementation quality validation.

## Reviewer Notes

* Phase 1 and Phase 2 implementation goals are substantially met with validated code and tests.
* Remaining risk is concentrated in churn/contention correctness and verification depth rather than baseline functionality.
