---
title: Quiet Witness Resident Presence Phase 3 Validation
description: Evidence-based validation of local controls, attribution, gates, and study events
ms.date: 2026-08-09
ms.topic: validation
---

## Validation Status

Partial. Local controls, gate behavior, attribution detail, and event-name restrictions have
verified implementation evidence. Two Major requirements gaps remain in the study-event
contract and App-level non-mutation tests. Focused Vitest execution was interrupted with exit
code 130, so this session did not independently confirm the claimed focused test pass.

## Scope and Sources

This validation covers only Implementation Phase 3 from the plan at
`.copilot-tracking/plans/2026-08-09/quiet-witness-resident-presence-plan.instructions.md`.
Evidence was compared against the changes log, research, details, implementation files, and
relevant unit and E2E tests. No production files were modified during validation.

## Phase Requirements

* Add feature-and-consent-gated local witness visibility, reset, detail, and study-condition
	event state in `App.tsx`: plan lines 76-84; details lines 120-143
* Provide a pressed `Witness signals` toggle and `Reset prototype signals` command while
	keeping hide, reset, and detail state separate from canonical state: details lines 120-133
* Record only condition shown, unaided notice, detail opened, hide, reset, and condition
	completion as study-safe events: details line 122; research lines 162-167
* Test default-off gating, keyboard detail, explicit Fantome attribution, non-mutation of
	tile, collaborator, revision, cache, and owner-attribution fixtures, and payload exclusion
	of raw canvas data: details lines 145-169
* Support the moderated no-signal and one-signal study with 1-7 ratings for intrigue,
	discomfort, invisibility, and confusion, plus a perceived-authorship answer: research
	lines 193-209

## Evidence Review

### Controls and Gates

Verified. `getWitnessSignalGates` derives both environment gates in
`apps/client/src/App.tsx` lines 146-149. The shared predicate requires both values in
`apps/client/src/domain/witnessSignals.ts` lines 36-43. Witness controls render only when
that predicate is true in `apps/client/src/App.tsx` lines 1643-1675, and the rendered signal
array is also gated in lines 493-496.

The controls update witness-only state declared in `apps/client/src/App.tsx` lines 408-413.
The hide handler changes only `witnessSignalsVisible` in lines 1648-1654. Reset restores the
fixture, visibility, and detail state in lines 1657-1664. The App test checks one-gate-off and
both-gates-on behavior in `apps/client/src/App.test.tsx` lines 433-448.

### Attribution Detail and Accessibility

Verified. The detail dialog says that the mark was observed by Fantome and did not change the
mosaic in `apps/client/src/App.tsx` lines 1677-1681. The keyboard-focused test invokes the
details button with Enter and asserts both attribution and non-mutation copy in
`apps/client/src/App.test.tsx` lines 451-464. This satisfies the Phase 3 attribution and
keyboard-detail requirements.

### Study Events

Partially verified. `apps/client/src/App.tsx` lines 151-159 creates a bounded event object,
and lines 503-518 record detail, unaided notice, and condition-shown events. The controls
record hide, reset, and condition-completed events in lines 1648-1664 and 1669-1672. The App
test asserts all required names and excludes `canvas` and `feedback` fields in
`apps/client/src/App.test.tsx` lines 491-520.

The event is dispatched only as a browser `CustomEvent` in `apps/client/src/App.tsx` line 500.
The only client listener is the test listener in `apps/client/src/App.test.tsx` lines 498-520;
there is no verified product-telemetry consumer.

### Change-Log Coverage

The changes log identifies `App.tsx` and `App.test.tsx` as the Phase 3 implementation and test
surfaces. Current Git status adds the domain and render dependencies and modifies App and scene
files, all of which are listed in the changes log. No additional Phase 3 production file was
found outside that accounting.

## Findings

### Critical

No Critical findings.

### Major

* The study-event schema cannot represent the required counterbalanced study or its results.
	`CanvasWitnessStudyEvent` fixes `condition` to `'one-signal'` and permits only an optional
	list of construct names in `apps/client/src/test/canvasTestApi.ts` lines 39-43. The App event
	factory also always emits `condition: 'one-signal'` in `apps/client/src/App.tsx` lines 151-159.
	There is no no-signal condition, 1-7 response value, or perceived-authorship answer field.
	This conflicts with the research requirement to compare no-signal and one-signal conditions
	and record those responses in research lines 193-209. The current completion event merely
	repeats construct identifiers, as asserted in `apps/client/src/App.test.tsx` lines 512-516.

* The Phase 3 App-level non-mutation test does not cover all required canonical fixtures.
	Details lines 152-155 require tests to fail for tile, collaborator, revision, cache, or
	owner-attribution changes. The test captures only tile count, tile transforms, remote cursor
	count, and remote selection count in `apps/client/src/App.test.tsx` lines 473-488. It has no
	assertion for revision, cache metrics, or `placedBy`/owner attribution. The E2E spec provides
	broader coverage, but it does not satisfy the explicit Phase 3 App-test requirement.

### Minor

No Minor findings.

## Coverage Assessment

Controls and gates: complete by source and test evidence.

Attribution and keyboard detail: complete by source and test evidence.

Canonical-state isolation: partially covered. The implementation keeps witness state separate,
but the required App-level checks for revision, cache, and owner attribution are absent.

Study events: partially covered. Event types and field minimization are implemented, but the
event contract cannot capture the two study conditions or the required participant responses.

Focused execution: unverified in this session. Both attempted focused Vitest commands were
interrupted with exit code 130 before a result was produced. Editor diagnostics for
`App.tsx`, `App.test.tsx`, and `canvasTestApi.ts` reported no errors.

## Clarifying Questions

* Should the study-result payload remain local/test-only, or be sent to an approved consented
	study collection endpoint? The selected mechanism determines where validated rating and
	authorship-answer fields belong.

* Does the no-signal study condition enable the consented study gate with an empty fixture, or
	use a distinct condition value? The current fixed `'one-signal'` type cannot support either
	design without revision.

## Recommended Next Validations

* Add focused App tests that snapshot revision, cache metrics, and every tile's `placedBy`
	before hide and reset, then prove those values remain unchanged.
* Define a consent-scoped, bounded study-result contract that supports `no-signal` and
	`one-signal`, four numeric ratings, and a constrained perceived-authorship answer.
* Run `npm test -- --run src/App.test.tsx` from `apps/client` after resolving the terminal
	interruption, then rerun the quiet-witness E2E spec after the study contract changes.