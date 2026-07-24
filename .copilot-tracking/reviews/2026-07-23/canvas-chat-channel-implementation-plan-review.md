<!-- markdownlint-disable-file -->
# Task Review: Canvas Chat Channel Implementation

## Review Metadata

* Date: 2026-07-23
* Plan: .copilot-tracking/plans/2026-07-23/canvas-chat-channel-implementation-plan.instructions.md
* Changes Log: .copilot-tracking/changes/2026-07-23/canvas-chat-channel-implementation-changes.md
* Research: .copilot-tracking/research/2026-07-23/canvas-chat-feature-research.md
* Scope Resolution: Explicit attachment and open file context

## Validation Progress

* Phase 1 (Artifact Discovery): Complete
* Phase 2 (RPI Validation): Complete
* Phase 3 (Quality Validation): Complete
* Phase 4 (Review Completion): Complete

## Findings Summary

* Critical: 1
* Major: 8
* Minor: 2

Severity count method:

* Counts are synthesized and de-duplicated across four RPI phase reports and one implementation-quality review.
* Raw (non-deduplicated) validator totals were higher due to repeated findings across phases.

## Phase Validation Results

### Phase 1: Contracts and Persistence Foundation

* Verdict: Needs Rework (Partial)
* Evidence file: .copilot-tracking/reviews/rpi/2026-07-23/canvas-chat-channel-implementation-plan-001-validation.md
* Key outcomes:
	* Contracts and schema/migration work are implemented.
	* Configuration lock is partial: `ackTimeoutMs` and `retentionDays` are defined but not enforced in runtime behavior.

### Phase 2: Server Chat Event Pipeline

* Verdict: Needs Rework (Partial)
* Evidence file: .copilot-tracking/reviews/rpi/2026-07-23/canvas-chat-channel-implementation-plan-002-validation.md
* Key outcomes:
	* Runtime validators, send/replay handlers, and persistence flow are implemented.
	* Integration coverage is weak for true end-to-end socket behaviors.
	* Observability signals are implemented but not validated via smoke/assertion outputs.

### Phase 3: Client Networking and Chat UI

* Verdict: Needs Rework (Failed)
* Evidence file: .copilot-tracking/reviews/rpi/2026-07-23/canvas-chat-channel-implementation-plan-003-validation.md
* Key outcomes:
	* Hook wiring and chat panel exist.
	* Critical test gap for required chat-specific client tests.
	* Replay and error-feedback behavior gaps remain.

### Phase 4: Validation

* Verdict: Needs Rework (Failed)
* Evidence file: .copilot-tracking/reviews/rpi/2026-07-23/canvas-chat-channel-implementation-plan-004-validation.md
* Key outcomes:
	* Lint/test/build pass in independent reruns.
	* Scale-readiness validation is partial due to missing observability-proof outputs.

## Synthesized Findings (Ordered by Severity)

### Critical

1. Required chat-specific client tests are not implemented to the depth claimed by plan completion.
	 * Evidence:
		 * .copilot-tracking/plans/2026-07-23/canvas-chat-channel-implementation-plan.instructions.md:98
		 * apps/client/src/network/useSocketConnection.test.ts:1
		 * apps/server/src/index.integration.test.ts:955

### Major

1. Idempotent chat retries are rebroadcast to the room, creating duplicate visible chat events.
	 * Evidence:
		 * apps/server/src/index.ts:1885
		 * apps/server/src/index.ts:1886
		 * apps/server/src/db/repository.ts:989

2. Replay flow is one-shot on client session entry and does not iterate when replay has additional pages.
	 * Evidence:
		 * apps/client/src/App.tsx:470
		 * apps/server/src/index.ts:1938

3. Replay request can be missed if requested before socket connection is available, with no reconnect-triggered recovery path.
	 * Evidence:
		 * apps/client/src/App.tsx:490
		 * apps/client/src/App.tsx:805

4. Chat send DB failures are surfaced as INVALID_PAYLOAD, which conflates server errors with client input errors.
	 * Evidence:
		 * apps/server/src/db/repository.ts:1042
		 * apps/server/src/index.ts:1869

5. Configured retentionDays is not enforced for chat messages in retention cleanup.
	 * Evidence:
		 * apps/server/src/contracts.ts:35
		 * apps/server/src/db/repository.ts:1093

6. Observability acceptance criteria remain unproven in smoke/test outputs.
	 * Evidence:
		 * apps/server/src/index.ts:216
		 * apps/server/src/index.ts:1888
		 * apps/server/src/index.ts:1940

7. Chat rejection feedback is console-only rather than user-visible in UI.
	 * Evidence:
		 * apps/client/src/App.tsx:512
		 * apps/client/src/ui/ChatPanel.tsx:12

8. Chat panel integration/layout selectors are inconsistent and may not apply intended side-panel behavior.
	 * Evidence:
		 * apps/client/src/App.tsx:1100
		 * apps/client/src/App.css:399

### Minor

1. Phase validation evidence is summarized in release notes but lacks phase-scoped command artifact traceability.
	 * Evidence:
		 * .copilot-tracking/changes/2026-07-23/canvas-chat-channel-implementation-changes.md:58

2. Migration journal timestamp/order metadata may reduce audit clarity.
	 * Evidence:
		 * apps/server/migrations/meta/_journal.json:36

## Implementation Quality Findings

Implementation validator completed with severity summary 0 critical, 6 major, 1 minor (before de-duplication with RPI findings).

Primary categories raised:

* Design and reliability
* API/error semantics
* Test coverage
* General operational completeness

Implementation-quality report source:

* In-chat subagent result from Implementation Validator (full-quality scope)
* Related evidence also captured in repository files cited above

## Validation Commands

Independent validation reruns completed during this review:

* `npm run lint` (repo root): Pass
* `npm test` (apps/server): Pass, 77/77 tests
* `npm test` (apps/client): Pass, 46/46 tests
* `npm run build` (repo root/workspaces): Pass

Diagnostics check on changed files:

* No compiler/lint diagnostics reported for:
	* apps/server/src/index.ts
	* apps/server/src/db/repository.ts
	* apps/server/src/contracts.ts
	* apps/client/src/App.tsx
	* apps/client/src/network/useSocketConnection.ts
	* apps/client/src/ui/ChatPanel.tsx

Command note:

* Client production build reports a large chunk warning; non-blocking for this review.

## Missing Work and Deviations

Missing or incomplete against plan/research intent:

* Chat-specific test implementation depth does not meet Phase 3 expectations.
* Replay continuity is incomplete for multi-page and reconnect edge cases.
* Idempotent retry behavior conflicts with duplicate-broadcast avoidance.
* Retention and observability acceptance criteria are only partially closed.

Documented deviation preserved from changes log:

* Integration tests were described as descriptive/assertion style with realistic end-to-end deferral.

## Follow-Up Recommendations

### Deferred from Scope

* Replace descriptive chat integration assertions with real socket-backed integration tests.
* Add observability smoke assertions that prove chat markers/counters during test runs.
* Decide and implement chat retention scheduling for `retentionDays`.

### Discovered During Review

* Prevent rebroadcast for idempotent sends.
* Add replay pagination loop in client using `hasMore` and `nextAfterSeq`.
* Trigger replay recovery on reconnect after connection is established.
* Differentiate DB failure acknowledgement reasons from payload validation failures.
* Add user-facing send rejection status in chat UI.

## Overall Status

Needs Rework

Reviewer notes:

* Core implementation landed successfully and passes lint/build/tests.
* Behavioral and validation-depth gaps are significant enough to block sign-off.
* Most follow-up items are targeted and should be resolved without architectural rework.
