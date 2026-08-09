---
title: Resident Presence Alternatives Analysis
description: Phase 2 evaluation of implementation alternatives for issue 176
ms.date: 2026-08-09
ms.topic: research
---

## Scope

Evaluate four approaches for issue #176, `feat(agents): prototype quiet witness
resident presence`:

1. Consent-scoped client-only fixture layer
2. Server-backed authenticated ephemeral resident signal
3. Durable resident marks using tile or patch operations
4. Reuse of human presence UI

The issue is explicitly a low-fidelity prototype. Its required outcomes are
non-destructive and attributable signals, evaluation of intrigue, discomfort,
invisibility, confusion, and perceived authorship, plus disable/reset behavior
that does not affect artist work
(`.copilot-tracking/github-issues/discovery/atelier-fantome-resident-agent/issues-plan.md:87-110`).

## Selected Approach

Select a consent-scoped, client-only fixture layer for issue #176.

Introduce a feature-gated `ResidentWitnessLayer` that receives a fixed or
test-supplied array of `WitnessSignal` values. Render it separately from
`TileInstance`, collaborator state, pointer state, selection state, and Socket.IO
events. A study session shows one sparse, static glyph, ring, trace, or motif
near a tile group but never on its fill, owner boundary, selection halo, or
minimap occupancy.

The first condition should include:

* A visible and accessible Fantome attribution.
* Detail text that states Fantome observed and did not change the mosaic.
* A local `Witness signals` toggle and `Reset prototype signals` command.
* No server request, canonical revision, cache update, collaborator count change,
	tile mutation, `placedBy` change, or durable telemetry caused by display, hide,
	or reset.

Use an explicit consented-study configuration or local-development flag and keep
the default off in ordinary sessions. The type may remain intentionally small:

```ts
type WitnessSignal = {
	id: string
	kind: 'glyph' | 'trace' | 'motif'
	anchor: { x: number; y: number }
	residentId: 'fantome'
	label: string
	source: 'prototype-fixture'
}
```

This approach tests the core question, whether a subtle attributed signal is
noticed and understood without threatening ownership, before introducing
identity, authorization, retention, or cross-replica behavior.

## Repository Evidence

### Canonical authority and durable mutations

The server is the only canonical authority for authentication, ownership, tile
validation, revisions, idempotency, audit, and replica-safe transactions. Model
output cannot mutate tiles or bypass those controls
(`docs/fantome-resident-agent-architecture.md:54-80`). `TileInstance` is
authoritative state and its optional `placedBy` field denotes placement
attribution (`apps/server/src/contracts.ts:73-94`).

Patch operations are durable records with a patch sequence, event and operation
identifiers, actor principal, payload, timestamp, uniqueness constraints, and
an allowed operation type (`apps/server/src/db/schema.ts:685-710`). Operation
replay converts `tile_placed` records into tiles with `placedBy` derived from the
operation client (`apps/server/src/db/repository.ts:1255-1285`). A resident mark
in either surface would become canonical artwork behavior, not a removable
prototype cue.

### Existing ephemeral presence

Human presence is authenticated, per-principal, socket-lease state with a
heartbeat and expiry (`apps/server/src/db/schema.ts:200-224`; `apps/server/src/index.ts:112-113`).
On connect, the server resolves the authenticated delivery context, joins the
presence room, and acquires the principal presence lease before emitting a human
join event (`apps/server/src/index.ts:1819-1907`). Patch policy makes presence
authenticated-only, never public (`apps/server/src/db/schema.ts:430-476`).

The client treats collaborators as people: they have client IDs, present state,
pointers, selections, an 8-second TTL, and periodic cleanup
(`apps/client/src/domain/collaboratorUtils.ts:3-106`). The header exposes this
state as the active collaborator count (`apps/client/src/ui/AppHeader.tsx:8-48`).
Those semantics are incompatible with an observing resident.

### Existing client seams

`MosaicScene` accepts render-only remote cursor and selection arrays as separate
props (`apps/client/src/render/MosaicScene.tsx:38-64`). It renders author
boundaries from tile `placedBy` (`apps/client/src/render/MosaicScene.tsx:134-199`)
and human cursors as a sphere and ring (`apps/client/src/render/MosaicScene.tsx:222-256`).
It composes the grid, tiles, selections, ghost, and cursors as independent
layers (`apps/client/src/render/MosaicScene.tsx:449-565`). This is the direct
structural seam for a new witness layer.

The local grid guidance is the closest behavioral precedent. Its client state
only stores current-session visibility and pattern choice; toggling it never
rewrites settled tiles. Its render layer has no pointer handlers and appears
behind settled tiles and the ghost
(`apps/client/IMPLEMENTATION_NOTES.md:22-34`). Existing App controls also show
local hide/restore behavior and reset protected client state on world changes
(`apps/client/src/App.tsx:346-354`; `apps/client/src/App.tsx:500-519`).

The Atlas design reserves terracotta for authorship and ochre for local
selection (`apps/client/DESIGN.md:60-108`). The witness glyph needs a distinct,
low-contrast treatment and an explicit label, rather than either existing
semantic color.

## Alternatives Comparison

| Alternative | Decision for #176 | Benefits | Blocking cost or risk |
| --- | --- | --- | --- |
| Consent-scoped client-only fixture layer | Selected | Reversible, non-destructive, isolates study variables, reuses a render-only seam, and permits immediate local reset | Is not shared and cannot establish production transport behavior |
| Server-backed authenticated ephemeral resident signal | Deferred as the intended post-validation architecture | Verifiable agent principal, authorized patch visibility, shared TTL behavior, and cross-replica delivery | Needs a resident event contract, versioned protocol, assignment authorization, rate/TTL policy, cache deduplication, reconnect handling, shared reset authorization, and audit rules |
| Durable marks through tile or patch operations | Rejected | Durable history and replay are available | Changes canonical art semantics, ownership, revisions, retention, replay, and reset obligations; violates prototype scope |
| Reuse human cursor, roster, or selection UI | Rejected | Existing transport and rendering exist | Misrepresents the resident as an active collaborator, changes collaborator counts, and risks authorship or surveillance confusion |

## Why the Server Signal Is Deferred

The server-backed alternative is viable after the prototype proves desirable,
but it should not be the #176 implementation. The agent control plane already
has active, paused, and disabled assignments
(`apps/server/src/db/schema.ts:226-250`), and authenticated presence supplies a
sound transport precedent. A future `resident_signal` payload should derive the
agent principal and display name server-side, enforce assignment and patch
visibility, use a bounded TTL cache for cross-replica deduplication, and never
enter quilt storage.

However, the issue plan orders a resident domain model and event contract before
#176 (`.copilot-tracking/github-issues/discovery/atelier-fantome-resident-agent/issues-plan.md:55-86`),
and makes distance controls and authorship safety later release gates
(`.copilot-tracking/github-issues/discovery/atelier-fantome-resident-agent/issues-plan.md:135-178`).
There is no current resident-signal payload, consent model, retention decision,
shared reset authorization, cadence policy, or cache contract. Adding all of
those to an experiment would confound the UX result and broaden its blast radius.

## Constraints

* Do not create `TileInstance` values, set `placedBy`, send placement or removal
	operations, or change a canonical revision.
* Do not populate `RemoteCollaboratorMap`, `remoteCursors`, `remoteSelections`,
	the roster, or the header collaborator count.
* Do not infer live observation, target an individual, or animate a cursor-like
	signal. The first cue is static and sparse.
* Keep signals out of collision, selection, undo, replay, patch snapshots,
	minimap occupancy, and camera movement.
* State authorship in text and accessible name. A participant must be able to
	distinguish artist-created mosaic tiles from Fantome's observation cue.
* Make hide and reset local-only. Reset clears fixture state and the witness
	preference, never artist state.
* Limit study instrumentation to consented condition, shown, unaided notice,
	detail-opened, hide, reset, and response values. Do not include raw canvas
	data, user-authored text, or unapproved free text in product telemetry.

## Implementation Sequencing

1. Define the feature flag, consent gate, `WitnessSignal` type, and deterministic
	 fixture source in a client-only domain module.
2. Add a presentational `ResidentWitnessLayer` and a `witnessSignals` prop to
	 `MosaicScene`. Mount it as a distinct render layer and prove it never enters
	 tile or collaborator arrays.
3. Add local `enabled`, detail, and reset state in `App.tsx`. Use an edge-mounted
	 instrument that follows existing control accessibility conventions. Keep the
	 fixture absent without both flag and consent.
4. Add the study harness and local E2E bridge support only as needed to seed and
	 inspect fixture state. The existing bridge is gated by
	 `VITE_E2E_TEST_MODE` and already reports tiles, ownership, collaborator IDs,
	 revision, grid state, and cache metrics
	 (`apps/client/src/test/canvasTestApi.ts:1-105`).
5. Run the prototype study with a no-signal and a one-signal condition. Collect
	 unaided discovery before detail text and then the five issue outcomes.
6. Advance only if the study clears the gates below. Then define the resident
	 event contract and separately design the authenticated TTL transport.

## Test Gates

### Automated gates for #176

* Client unit/component tests show the signal only when flag and consent are
	enabled, and expose a visible plus accessible Fantome attribution.
* Tests prove hide and reset remove only fixture state. Snapshot the tile list,
	`placedBy`, remote cursor count, remote selection count, collaborator IDs,
	revision, cache metrics, camera, and active tile before and after each action.
* Keyboard focus and activation reveal detail without invoking pointer placement,
	moving the camera, or changing selection.
* `App.test.tsx` already mocks scene props through data attributes
	(`apps/client/src/App.test.tsx:139-181`); extend that mock with witness state.
	`MosaicScene.test.tsx` already distinguishes author boundaries by `placedBy`
	(`apps/client/src/render/MosaicScene.test.tsx:130-172`); add a separate
	witness-layer assertion rather than extending owner-boundary behavior.
* Add a focused E2E test that seeds an artist tile and enables the fixture in one
	consented browser. Assert explicit label, unchanged canonical state in both
	browsers, no additional collaborator, and unchanged data after hide, reset,
	and reload. The current harness supports identity-specific tile assertions
	(`e2e/support/multiUser.ts:225-348`) and the Playwright configuration retains
	trace, screenshot, and video for failures (`playwright.config.ts:1-82`).

### Human evaluation gates

Use a counterbalanced, moderated within-subject study with one condition lacking
the signal and one with a single labelled signal. Ask what participants noticed
before opening detail, then record 1 to 7 responses:

| Construct | Gate |
| --- | --- |
| Intrigue | Above neutral |
| Discomfort | Below neutral |
| Invisibility | Below neutral before prompt |
| Confusion | Below neutral after detail |
| Perceived authorship | Participants name the artist as creator and Fantome as observer |

Stop or redesign when participants attribute nearby art to Fantome, report
consistently high discomfort or confusion, cannot remove the cue, or mostly fail
unaided discovery. The feature must not progress to shared transport until those
conditions pass.

## Corrections to Prior Research

1. Correct the requested artifact location. The file named
	 `resident-architecture-research.md` exists at
	 `.copilot-tracking/research/subagents/2026-08-09/resident-architecture-research.md`,
	 not at `.copilot-tracking/research/2026-08-09/resident-architecture-research.md`.
	 The latter path does not exist in the current workspace.
2. Revise the architecture research's server-first implementation recommendation.
	 Its proposed authenticated `resident_signal` is appropriate future shared
	 architecture, but it is too broad for #176's low-fidelity experiment because
	 the prerequisite event contract, consent, shared controls, and TTL/cache
	 policy are not yet decided. Select the client-only fixture first.
3. Retain the architecture research's rejection of tiles, patch operations, and
	 human-presence reuse. The current code validates those concerns: operation
	 records are durable and replayable, while collaboration UI denotes active
	 human participants.
4. Tighten the fixture recommendation to require both an explicit consent gate
	 and default-off behavior outside study or local development. A local toggle
	 alone does not establish consent.

## Follow-On Questions

* Who owns shared disable/reset authority after the prototype, the quilt owner,
	administrator, or both?
* What TTL, cadence, and per-patch rate preserve intrigue without implying
	surveillance?
* Which durable retention and audit records are permitted for future shared
	signals, and what deletion scope applies?
* Are motifs supplied by deterministic policy, curated configuration, or a
	separately approved model capability?

## Status

Complete. The selected approach is the consent-scoped client-only fixture layer.
It satisfies issue #176 with the smallest authority and ownership footprint,
while preserving a server-backed authenticated TTL signal as the next
architecture phase after validation and policy decisions.