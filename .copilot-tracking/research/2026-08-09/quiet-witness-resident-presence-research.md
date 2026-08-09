<!-- markdownlint-disable-file -->
# Task Research: Quiet Witness Resident Presence

Research for GitHub issue #176, `feat(agents): prototype quiet witness resident presence`.
The issue asks for subtle glyphs, nearby traces, quiet patch visits, recurring motifs, and
discoverable marks that are non-destructive, explicitly attributable to the resident, and
can be disabled or reset without affecting artist work.

## Task Implementation Requests

* Prototype quiet, discoverable resident-presence signals.
* Preserve artist tiles, ownership, revisions, and collaboration state.
* Make the resident's authorship and non-mutating role clear.
* Record intrigue, discomfort, invisibility, confusion, and perceived authorship in testing.
* Provide controls to hide or reset the behavior independently of artist work.

## Scope and Success Criteria

* Scope: Research the existing resident architecture, client rendering and controls, test
  infrastructure, and evaluation protocol. Recommend an implementation boundary for a
  prototype and identify the path to a later shared implementation.
* Assumptions:
  * Issue #176 is an early prototype, not approval for durable resident-authored marks.
  * Product has not yet decided consent, audience, signal retention, cadence, or shared
    reset authority.
  * The current read-only Fantome resident architecture remains authoritative.
* Success Criteria:
  * One recommended, reversible prototype approach is selected with evidence.
  * Rejected alternatives explain their ownership, attribution, or safety failure.
  * Automated and human evaluation coverage directly maps to all issue acceptance criteria.

## Outline

1. Establish architecture and UX constraints.
2. Compare prototype approaches.
3. Select the client-only experiment and document its implementation contract.
4. Define gates before introducing server-backed shared presence.

## Research Executed

### File Analysis

* `docs/fantome-resident-agent-architecture.md`
  * Lines 54-80 and 157-186 establish a server-authoritative, read-only resident whose
    model output cannot mutate the canvas.
  * Lines 197-259 require prompt minimization and no user-authored content in v1 model
    prompts.
* `apps/server/src/db/schema.ts`
  * Lines 217-250 define agent assignments with `active`, `paused`, and `disabled` states.
  * Lines 430-476 constrain presence to authenticated, visibility-controlled rooms.
  * Lines 620-650 distinguish durable tile attribution and patch operations from ephemeral
    activity, so neither is suitable for a witness mark.
* `apps/client/src/domain/collaboratorUtils.ts`
  * Lines 3-15 and 40-114 show that collaborator presence is ephemeral and TTL-based.
* `apps/client/src/render/MosaicScene.tsx`
  * Lines 134-199 render durable owner boundaries; lines 222-238 render non-tile remote
    cursor geometry. A witness must be a third, separate rendering surface.
* `apps/client/src/App.tsx`
  * Lines 346-354, 462-474, and 1461-1480 demonstrate local hide/restore controls.
  * Lines 500-519 show client-world teardown of non-canonical UI state.
* `apps/client/IMPLEMENTATION_NOTES.md`
  * Lines 22-34 describe grid guidance as render-only UI that never rewrites settled tiles,
    the closest local precedent for the prototype.
* `apps/client/src/App.test.tsx` and `apps/client/src/render/MosaicScene.test.tsx`
  * Existing Vitest tests mock scene props and assert Three Fiber rendering behavior.
* `e2e/support/multiUser.ts` and `apps/client/src/test/canvasTestApi.ts`
  * Existing multi-user fixtures and the test-only canvas bridge can verify that a visual
    prototype does not alter tile, ownership, collaborator, revision, or cache state.

### External Research

* Google PAIR: [People + AI Guidebook](https://pair.withgoogle.com/guidebook/)
  * Its focus on mental models, feedback, and user autonomy supports clear attribution,
    immediate controls, and testing interpretation rather than measuring clicks alone.

### Project Conventions

* Standards referenced: the Fantome read-only architecture, authenticated presence policy,
  client Atlas design rules, current Vitest and Playwright patterns.
* Instructions followed: Task Researcher research-document requirements and the repository
  tracking-file convention.

## Key Discoveries

### Architecture Boundaries

The server is the canonical authority; the resident worker is assignment-scoped and
read-only. Agent assignments already have shared lifecycle states, while collaborator
presence is ephemeral. In contrast, tiles, `placedBy`, patch operations, revisions, undo,
replay, snapshots, and retention form canonical artist-work state. A quiet witness mark must
not enter that state.

There is no current resident-mark domain contract, shared signal transport, consent model,
retention policy, or reset authorization endpoint. A server-backed signal is feasible using a
new, authenticated TTL payload, but would introduce authorization, cross-replica, audit, and
policy work beyond this prototype.

### UX Constraints

Human cursors and rosters imply a live collaborator; tile owner boundaries imply authorship.
Neither semantic maps to an observing resident. The prototype should be visually quiet,
static, distinct from human-presence colors, and separately labeled. It must explain that
Fantome observed but did not change the mosaic in both visible detail and accessible text.

The client already supports render-only visual guidance and local restoreable preferences. A
dedicated witness layer can use those patterns while remaining outside pointer, selection,
camera, minimap, collaborator, and tile mutation paths.

### Complete Prototype Example

```ts
type WitnessSignal = {
  id: string
  kind: 'glyph'
  anchor: { x: number; y: number }
  residentId: 'fantome'
  label: string
  source: 'prototype-fixture'
}
```

`WitnessSignal` is intentionally not a `TileInstance`, a collaborator, a socket event, or a
patch operation. Fixture data is enabled only by both a prototype feature flag and consented
study configuration.

## Technical Scenarios

### Consent-Scoped Client Prototype

**Requirements:**

* Signals are visible only as a controlled study fixture, explicitly named as Fantome, and
  clearly described as non-mutating.
* Hiding and resetting affect only witness fixture state and its local display preference.
* Artist tiles, `placedBy`, revisions, cache, undo, human collaborator count, and server
  traffic remain unchanged.

**Preferred Approach:**

Implement a feature-flagged, client-only `ResidentWitnessLayer` that receives a fixed or
test-supplied array of `WitnessSignal` objects through `MosaicScene`. Use one subdued static
glyph or partial ring positioned beside, never over, an artist tile group. Clicking or
keyboard focusing the mark reveals concise detail: `Witness mark. Observed by Fantome, the
resident. This prototype signal did not change this mosaic.` A compact edge control provides a
pressed `Witness signals` toggle and `Reset prototype signals` command.

```text
apps/client/src/domain/witnessSignals.ts        # fixture type and gated sample data
apps/client/src/render/ResidentWitnessLayer.tsx # non-interactive render-only geometry
apps/client/src/render/MosaicScene.tsx          # pass-through render prop only
apps/client/src/App.tsx                         # local setting, detail, and reset state
apps/client/src/*test.tsx                       # focused unit/component tests
e2e/quiet-witness.spec.ts                       # fixture-only non-mutation E2E coverage
```

**Implementation Details:**

* Keep the layer outside `TileMesh`, owner-boundary, remote-cursor, minimap, and selection
  code paths.
* Expose an accessible label containing `Fantome resident witness mark`; visual styling alone
  is not acceptable evidence of attribution.
* Default the feature off in ordinary sessions. Render a signal only when both the prototype
  feature gate and an explicit consented-study configuration are enabled. A local-development
  fixture may use the same gate, but must not become a normal-session default.
* Instrument only study events: condition shown, unaided notice, detail opened, hide, reset,
  and condition completion. Do not send raw canvas data or unapproved free-text feedback as
  product telemetry.

**Implementation Sequence:**

1. Define the feature gate, consent gate, `WitnessSignal` type, and deterministic fixture
  source in a client-only domain module.
2. Add the presentational `ResidentWitnessLayer` and the `witnessSignals` render prop to
  `MosaicScene`; prove neither enters tile nor collaborator arrays.
3. Add local enabled, detail, and reset state in `App.tsx` using the existing edge-control
  accessibility conventions.
4. Extend the test-only E2E bridge only as needed to seed and inspect fixture state.
5. Run the no-signal and one-signal study conditions and collect unaided discovery before
  showing detail text.
6. Define a resident event contract and authenticated TTL transport only after the study
  clears its safety and interpretation gates.

#### Considered Alternatives

| Alternative | Decision | Evidence-based reason |
| --- | --- | --- |
| Client-only fixture layer with explicit detail, toggle, and reset | Selected | It is reversible, attributable, non-destructive, and uses existing render-only/local-control patterns. |
| Extend human remote cursor or collaborator roster | Rejected | It falsely suggests an active human collaborator and risks surveillance or identity confusion. |
| Create a resident-owned tile or owner boundary | Rejected | It changes the canonical art model and conflicts with artist authorship, undo, revision, and retention semantics. |
| Persist patch-operation records for marks | Rejected for this issue | It turns an experiment into durable shared state before consent, visibility, audit, and reset contracts exist. |
| Server-backed authenticated TTL resident signal | Deferred | It is the appropriate future shared design but requires new protocol, authorization, cache/deduplication, and multi-replica guarantees. |

### Evaluation and Release Gate

Run a moderated, counterbalanced within-subject study: no signal versus one explicit witness
glyph. Ask what participants noticed before exposing the detail, then record a 1-7 response
for each condition.

| Construct | Prompt | Gate |
| --- | --- | --- |
| Intrigue | `I was curious to learn more about this signal.` | Above neutral |
| Discomfort | `This signal felt unsettling or unwelcome.` | Below neutral |
| Invisibility | `I did not notice this signal until it was pointed out.` | Below neutral |
| Confusion | `I was unsure what this signal meant or what it could do.` | Below neutral after detail |
| Perceived authorship | `Who created or changed the nearby mosaic?` | Artist identified as creator; Fantome identified only as observer |

Include unaided recall and short consented free-text interpretation. Stop or redesign if
participants attribute artist tiles to Fantome, discomfort or confusion is consistently high,
or most participants fail unaided discovery. Do not promote the experiment to a shared signal
until it clears these conditions.

## Automated Verification

* Unit/component tests: validate explicit and accessible Fantome attribution; the required
  combined feature/consent gate; independent hide/reset state; keyboard detail; and unchanged
  tile array, `placedBy`, cursor, selection, collaborator count, cache metrics, revision, and
  camera state.
* E2E: seed human tiles, enable fixture data for one browser, and assert that another browser
  sees no canonical state changes. After hide, reset, and reload, assert no placement,
  deletion, revision, cache, or owner-attribution changes.
* Future server-signal tests: validate authenticated agent identity, active assignment,
  patch presence visibility, TTL/rate limits, cache reset, replica deduplication, reconnect
  expiry, and unchanged canonical quilt checksum.

## Recommended Follow-Up: Shared Presence Only After Validation

For a later shared capability, extend the authenticated presence contract with a versioned
`resident_signal` payload, derive attribution from the verified agent principal, and hold
signals in a short-lived cross-replica cache rather than canonical quilt storage. Active
assignments may emit; `paused` and `disabled` assignments suppress and clear signals. A shared
reset must clear only the signal cache and leave all artist state unchanged. Signal selection
should be deterministic policy, not model-generated behavior, to preserve current read-only
and prompt-minimization boundaries.

## Potential Next Research

* Define consent, target audience, distance preference, cadence, and retention for a shared
  resident signal.
  * Reasoning: none currently has a product or data contract.
  * Reference: `docs/fantome-resident-agent-architecture.md`.
* Decide whether quilt owners, administrators, or both can invoke a shared disable/reset.
  * Reasoning: `agent_assignments` has lifecycle states but no established user-facing control
    authorization.
  * Reference: `apps/server/src/db/schema.ts`.

## Research Status

Complete. The recommended client-only experiment meets the issue's prototype and
non-destructive requirements while keeping the future authenticated-presence design available
after human evaluation and product-policy decisions.