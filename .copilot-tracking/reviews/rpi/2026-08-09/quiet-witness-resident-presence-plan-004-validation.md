---
title: Quiet Witness Resident Presence Phase 4 Validation
description: Evidence-based validation of the E2E non-mutation and evaluation protocol phase
ms.date: 2026-08-09
ms.topic: validation
---

## Validation Status

Partial. The Phase 4 implementation supplies a test-only bridge and one multi-user E2E
spec, but the E2E assertions do not cover all required canonical state or the post-interaction
reload. The study capture only records construct identifiers, rather than the required
participant responses.

## Scope

Implementation Phase 4 only: test-only bridge, E2E non-mutation coverage, and study capture.

Inputs reviewed:

* [Implementation plan](.copilot-tracking/plans/2026-08-09/quiet-witness-resident-presence-plan.instructions.md)
* [Changes log](.copilot-tracking/changes/2026-08-09/quiet-witness-resident-presence-changes.md)
* [Research](.copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md)
* [Implementation details](.copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md)

## Plan Coverage

| Phase item | Status | Verified evidence |
| --- | --- | --- |
| Step 4.1, test-only bridge | Partial | [canvasTestApi.ts](apps/client/src/test/canvasTestApi.ts#L87) defines the canonical snapshot and test-only controls. [App.tsx](apps/client/src/App.tsx#L1263) registers it only through the test API. Fixture gates and witness reset state are wired at [App.tsx](apps/client/src/App.tsx#L1332). The bridge observer only records outgoing Socket.IO event names at [App.tsx](apps/client/src/App.tsx#L1339). |
| Step 4.2, cross-browser E2E non-mutation | Partial | [quiet-witness.spec.ts](e2e/quiet-witness.spec.ts#L125) creates two users, seeds a human tile, enables the fixture for only one browser, and checks the peer. It exercises details, hide, reset, and a limited canonical comparison at [quiet-witness.spec.ts](e2e/quiet-witness.spec.ts#L164) and [quiet-witness.spec.ts](e2e/quiet-witness.spec.ts#L194). |
| Step 4.3, study capture | Partial | The event types and five identifiers are declared at [canvasTestApi.ts](apps/client/src/test/canvasTestApi.ts#L24) and [App.tsx](apps/client/src/App.tsx#L126). [App.test.tsx](apps/client/src/App.test.tsx#L491) verifies minimal payloads and excludes canvas and feedback fields. No event field captures a rating, recall, or authorship response. |

## Findings

### Critical

#### Required study responses cannot be captured

The research requires a $1$-$7$ response for each condition, an answer to the perceived-
authorship question, and unaided recall before detail exposure. [research](.copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md#L196), [research](.copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md#L205), and [research](.copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md#L207) define those requirements.

`CanvasWitnessStudyEvent` only carries `prototype`, `type`, `condition`, and an optional
array of construct names at [canvasTestApi.ts](apps/client/src/test/canvasTestApi.ts#L39).
`createWitnessStudyEvent` only adds that construct array at [App.tsx](apps/client/src/App.tsx#L151), and the completion action records the same identifiers at [App.tsx](apps/client/src/App.tsx#L1671). The result cannot store ratings, an authorship answer, or unaided recall, so the moderated study cannot evaluate its release gates.

### Major

#### Canonical E2E comparison omits required tile and cache evidence

Step 4.1 requires a baseline including tile IDs and colors, `placedBy`, owner attribution,
revision, available cache metrics, collaborator count, and undo state. [details](.copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md#L175) specifies this surface.

Although the bridge exposes full tile snapshots and the complete metrics object at [canvasTestApi.ts](apps/client/src/test/canvasTestApi.ts#L7) and [canvasTestApi.ts](apps/client/src/test/canvasTestApi.ts#L65), the E2E `CanonicalSnapshot` narrows each tile to only `id` and `placedBy` at [quiet-witness.spec.ts](e2e/quiet-witness.spec.ts#L12). Its comparison further excludes `cursorCount` and `snapshotBytes` at [quiet-witness.spec.ts](e2e/quiet-witness.spec.ts#L86). A color, shape, transform, material, cursor-cache, or snapshot change during witness actions would therefore not fail this test.

#### E2E reload occurs before the witness interaction sequence

The required E2E flow calls for detail open, hide, reset, and reload with post-action
non-mutation assertions. [details](.copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md#L198) and [research](.copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md#L218) require this.

The spec reloads at [quiet-witness.spec.ts](e2e/quiet-witness.spec.ts#L140), before enabling
the fixture at [quiet-witness.spec.ts](e2e/quiet-witness.spec.ts#L146) and before the
interactions at [quiet-witness.spec.ts](e2e/quiet-witness.spec.ts#L164). No reload follows the
witness interactions, so the test does not establish that local witness actions leave durable
canonical state unchanged after a reload.

#### Network evidence observes only outgoing traffic

The phase requires evidence that witness interactions do not emit placement, deletion,
revision, cache, or collaborator-update traffic. [details](.copilot-tracking/details/2026-08-09/quiet-witness-resident-presence-details.md#L208) names that requirement.

The bridge observer subscribes only with `socket.onAnyOutgoing` at [App.tsx](apps/client/src/App.tsx#L1339). The Playwright observer similarly records HTTP requests and WebSocket `framesent`, but not incoming WebSocket frames, at [quiet-witness.spec.ts](e2e/quiet-witness.spec.ts#L112). This misses inbound revision, cache, and collaborator-update frames that the interaction could trigger, leaving the stated traffic guarantee incomplete.

### Minor

#### E2E does not require the unaided-notice event

The implementation records `unaided-notice` when the glyph is noticed at [App.tsx](apps/client/src/App.tsx#L509), but the E2E allowlist at [quiet-witness.spec.ts](e2e/quiet-witness.spec.ts#L179) excludes it. The spec opens the control-panel details button instead of the glyph, so it does not prove the unaided-notice path or its constrained payload.

## Positive Evidence

* The fixture is explicitly controlled through a registered test API and not a new production
	transport API. [canvasTestApi.ts](apps/client/src/test/canvasTestApi.ts#L147) enables the
	bridge only when E2E mode is configured.
* The E2E confirms only the enabled browser has witness controls, while the other browser does
	not. [quiet-witness.spec.ts](e2e/quiet-witness.spec.ts#L152) provides direct DOM evidence.
* The E2E tests detail text, hide, reset, witness-only state, and a two-browser comparison.
	[quiet-witness.spec.ts](e2e/quiet-witness.spec.ts#L164) and [quiet-witness.spec.ts](e2e/quiet-witness.spec.ts#L194) cover those paths.
* Event-payload tests reject raw canvas data and free-text feedback. [App.test.tsx](apps/client/src/App.test.tsx#L518) confirms the privacy constraint.

## Validation Execution

Static diagnostics reported no errors for [canvasTestApi.ts](apps/client/src/test/canvasTestApi.ts),
[quiet-witness.spec.ts](e2e/quiet-witness.spec.ts), [App.tsx](apps/client/src/App.tsx), or
[witnessSignals.ts](apps/client/src/domain/witnessSignals.ts).

The requested focused Playwright command and focused App test were both interrupted with exit
code `130` before producing usable test results. The changes log claims the E2E command passed
at [changes log](.copilot-tracking/changes/2026-08-09/quiet-witness-resident-presence-changes.md#L58),
but that claim was not independently reproduced in this validation.

## Coverage Assessment

Phase 4 is partially implemented. The bridge, two-browser harness, and privacy-limited event
shape exist. However, the test cannot detect all required canonical mutations, the reload
coverage is sequenced before rather than after witness interactions, and the capture model
cannot collect the research-required study responses. Phase 4 should not be marked complete
until the Critical and Major findings are resolved.

## Clarifying Questions

* Which consented, study-only storage or export mechanism is approved for the numerical ratings,
	unaided recall, and perceived-authorship answer?
* Should the canonical traffic requirement assert both incoming and outgoing Socket.IO/WebSocket
	frames, or only events emitted by the local browser? The details document does not limit the
	direction.

Evidence collection in progress.
