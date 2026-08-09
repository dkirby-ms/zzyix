---
title: Quiet Witness UX and Testing Research
description: Research for issue 176 on subtle attributable non-destructive resident presence
author: GitHub Copilot
ms.date: 2026-08-09
ms.topic: research
keywords:
  - agents
  - resident presence
  - client UX
  - testing
---

## Status

Complete. The current branch has resident runtime foundations, but no
user-visible resident mark, trace, motif, or social-interpretation UI.

## Issue Contract

Issue #176 is recorded locally as a low-fidelity prototype of "subtle glyphs,
nearby traces, quiet patch visits, recurring motifs, and discoverable marks."
It requires non-destructive, explicitly attributable signals; tests that record
intrigue, discomfort, invisibility, confusion, and perceived authorship; and
behavior that can be disabled or reset without changing artist work
(`.copilot-tracking/github-issues/discovery/atelier-fantome-resident-agent/issues-plan.md:87-110`).

The next planned issue makes distance and disengagement a release gate, while
the following safety issue requires protection against overwrite, deletion,
impersonation, and authorship confusion
(`.copilot-tracking/github-issues/discovery/atelier-fantome-resident-agent/issues-plan.md:135-178`).
Issue #176 should therefore be a read-only visual prototype, not agent tile
placement.

## Product and Design Evidence

The finalized resident design names the baseline "Quiet Witness Presence":
subtle nonverbal cues, odd glyphs, nearby traces, and quiet patch visits. It
requires social legibility through marks and patterns rather than constant
dialogue (`.copilot-tracking/dt/atelier-fantome/agent-design.md:11-33`). It says
the resident should be subtle but not incidental, creating discoverable signals
that prompt curiosity without demanding interpretation
(`.copilot-tracking/dt/atelier-fantome/agent-design.md:59-72`). Its success
criteria favor intrigue over discomfort, understandable presence, artist control
of attention, and rare events that are meaningful rather than disruptive
(`.copilot-tracking/dt/atelier-fantome/agent-design.md:111-131`).

The client is an Atlas: its unframed canvas is the main work field, while status,
collaboration, grid, and minimap are edge-mounted instruments
(`apps/client/DESIGN.md:66-69`, `apps/client/DESIGN.md:134-148`). Terracotta
means authorship and located world context; ochre means the local selection
(`apps/client/DESIGN.md:90-109`). Do not reuse ochre for resident presence, and
do not reuse terracotta without an explicit resident label. Design rules require
edge-contained overlays, compact controls, visible focus treatment, and 44px
targets (`apps/client/DESIGN.md:194-218`).

The architecture keeps the server as the sole canonical authority and limits v1
resident tools to approved reads and structured proposals. Model output cannot
mutate the canvas (`docs/fantome-resident-agent-architecture.md:54-80`,
`docs/fantome-resident-agent-architecture.md:157-186`).

## Existing Client Seams

### Attribution and presence

`TileInstance` has optional `placedBy` attribution
(`apps/server/src/contracts.ts:81-94`). `MosaicScene` outlines tiles authored by
another identity with `data-owner-boundary`
(`apps/client/src/render/MosaicScene.tsx:130-183`). Do not represent a witness
signal as an ordinary tile or reuse this boundary, because either would imply a
mutable authored canvas object.

Human collaboration is a separate state model with presence, pointer, selection,
and an 8-second signal TTL (`apps/client/src/domain/collaboratorUtils.ts:3-106`).
The renderer draws a remote cursor as an emissive dot and ring, and remote
selection as a halo (`apps/client/src/render/MosaicScene.tsx:185-233`). They are
useful spatial precedents but inappropriate resident semantics because they mean
a live collaborator is acting. The header and canvas also show human observer
and collaborator information (`apps/client/src/ui/AppHeader.tsx:20-47`,
`apps/client/src/App.tsx:1435-1460`); a resident signal must not change either
human count or roster.

### Controls and reset

Interaction-guide dismissal is local `localStorage` state with paired hide and
restore callbacks (`apps/client/src/App.tsx:106-107`,
`apps/client/src/App.tsx:346-354`, `apps/client/src/App.tsx:462-474`). The guide
is an edge-contained control with a restore button
(`apps/client/src/App.tsx:1461-1480`). Theme preference follows the same
local-only pattern (`apps/client/src/App.tsx:1628-1642`). Canonical-world teardown
clears client caches, collaborators, camera, and session render state
(`apps/client/src/App.tsx:500-519`).

Grid guidance is the strongest behavior precedent: it is local session UI, has
no pointer handlers, is rendered behind settled tiles and the ghost, and never
rewrites settled tiles (`apps/client/IMPLEMENTATION_NOTES.md:22-34`). Its control
has a pressed toggle, keyboard behavior, and polite live status
(`apps/client/src/ui/GridOverlayControls.tsx:39-121`).

`MosaicScene` already receives render-only remote-cursor and remote-selection
props (`apps/client/src/render/MosaicScene.tsx:27-61`), and `App` computes and
passes them (`apps/client/src/App.tsx:715-752`,
`apps/client/src/App.tsx:1489-1506`). A `witnessSignals` prop can follow this
shape. Existing pointer and selection emit callbacks are no-ops
(`apps/client/src/App.tsx:754-761`), so the prototype should not imply a live
stream by attaching itself to those callbacks.

## Recommendation

Implement a feature-flagged, client-only `ResidentWitnessLayer` with a fixed or
test-supplied set of read-only `WitnessSignal` objects. Render the layer in
`MosaicScene`, separately from tiles, collaborators, cursor state, and socket
events. It must not send tile mutations or change canonical revisions.

Use one restrained signal in the first study:

* A low-contrast recurring glyph or partial ring just outside an artist tile
  group, never over its fill or owner boundary.
* Click and keyboard focus reveal compact detail: "Witness mark. Observed by
  Fantome, the resident. This prototype signal did not change this mosaic."
  Show the nearby tile creator separately when known.
* The glyph's accessible name must include "Fantome resident witness mark". The
  visual alone must not carry authorship attribution.
* A compact edge instrument labeled "Witness signals" has an on/off toggle and
  "Reset prototype signals" command. Both affect only in-memory fixture state
  and the dedicated local preference.

Default it on only in a consented study or local-development flag. Until product
decides consent, targeting, retention, distance preferences, and a server domain
contract, normal sessions should default off.

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

Keep this outside `TileInstance` and do not add `placedBy`. The later domain
model is intended to define durable marks, motifs, visits, attention state, and
behavior tiers (`.copilot-tracking/github-issues/discovery/atelier-fantome-resident-agent/issues-plan.md:62-78`).

## Alternatives

| Alternative | Assessment |
| --- | --- |
| Separate static glyph layer with detail, toggle, and reset | Recommended. It is attributable, non-destructive, and easy to remove after a study. |
| Reuse remote cursor or collaborator roster | Reject. It presents the resident as an active human and weakens attribution. |
| Create a resident-owned tile | Reject. It violates the low-fidelity non-destructive scope and risks ownership confusion. |
| Inspector or sidebar history | Defer. It competes with the canvas before the team knows whether the signal is noticed. |
| Ambient animation with no interaction | Reject. It fails discoverability and accessible attribution. |

## Automated Testing

The client test stack is Vitest, jsdom, React Testing Library, and user-event
(`apps/client/package.json:5-39`). `App.test.tsx` mocks `MosaicScene`, uses
React `act`, and asserts supplied scene state through data attributes
(`apps/client/src/App.test.tsx:1-181`). `MosaicScene.test.tsx` mocks React Three
Fiber and asserts owner-boundary rendering
(`apps/client/src/render/MosaicScene.test.tsx:1-25`,
`apps/client/src/render/MosaicScene.test.tsx:95-135`).

Add focused unit/component tests that prove:

1. A rendered signal has visible and accessible Fantome attribution.
2. A signal changes no `TileInstance`, `placedBy`, cursor, selection, or
   collaborator count.
3. Hide and reset immediately remove signals and do not mutate the tile array.
4. Keyboard activation opens detail without placing a tile or moving the camera.
5. The layer is absent unless both prototype flag and study fixture are enabled.

Playwright uses an isolated OIDC issuer, server, and Vite client, retaining trace,
screenshot, and video on failure (`playwright.config.ts:1-70`). The root command
is `npm run test:e2e`; local interaction work uses `npm run dev:test-auth`
(`package.json:8-39`; `/memories/repo/client-testing.md:1`).

The E2E canvas bridge returns tiles, `placedBy`, collaborators, grid, and cache
metrics only under `VITE_E2E_TEST_MODE`
(`apps/client/src/test/canvasTestApi.ts:6-105`). Multi-user fixtures create
distinct browser identities and assert exact tile attribution and convergence
(`e2e/support/multiUser.ts:1-42`, `e2e/support/multiUser.ts:233-342`); cleanup
uses the server reset endpoint (`e2e/support/multiUser.ts:393-408`,
`e2e/support/testState.ts:17-58`).

Extend that bridge with read-only `witnessSignals`, `witnessEnabled`, and
`resetWitnessSignals()`. Add a two-user test that seeds a human tile, enables a
fixture signal in only one browser, then asserts: explicit Fantome labeling; no
new collaborator; unchanged tile identities and `placedBy` in both clients; and
no placement, deletion, revision, or cache mutation after hide/reset and reload.

## Participant Evaluation

Use a moderated, counterbalanced within-subject study with two short conditions:
no signal and one explicit witness glyph. Ask participants what they noticed
before displaying the detail, then record 1 to 7 responses after each condition.

| Construct | Prompt | Desired result |
| --- | --- | --- |
| Intrigue | "I was curious to learn more about this signal." | Above neutral |
| Discomfort | "This signal felt unsettling or unwelcome." | Below neutral |
| Invisibility | "I did not notice this signal until it was pointed out." | Below neutral |
| Confusion | "I was unsure what this signal meant or what it could do." | Below neutral after detail |
| Perceived authorship | "Who created or changed the nearby mosaic?" | Human artist is named; Fantome is identified only as observer |

Collect concise free text on inferred meaning, authorship, control, and reasons
to hide the signal. Log only study-session events: shown, noticed/detail opened,
hide, reset, and condition. Do not treat raw canvas content, personal identity,
or free text as product telemetry without privacy approval.

Set a stop rule before testing: redesign or stop if participants attribute artist
tiles to Fantome, discomfort or confusion is consistently high, or most fail
unaided discovery. Progress only when participants can say Fantome observed,
rather than altered, the work and can remove the signal immediately.

## Risks and Gaps

* Existing owner outlines make attribution ambiguity the principal risk. The
  mark must state it did not change the mosaic in both visual and accessible UI.
* Over-subtle behavior can be invisible. Low interaction alone is not evidence
  of comfort; use unaided recall.
* Cursor-like animation can feel like surveillance. Prefer a static trace and
  never imply current observation of a person.
* Durable or shared signals require domain contracts, authorization, retention,
  audit, and replica behavior that are outside this issue.
* The architecture forbids model claims of mutation and authority-boundary
  crossing (`docs/fantome-resident-agent-architecture.md:69-80`,
  `docs/fantome-resident-agent-architecture.md:262-296`). Preserve that boundary
  in UI copy, telemetry, and test assertions.
* No consent, distance-preference, targeting, retention, or durable resident-mark
  schema exists. Keep the initial experiment fixture-only.

## External Evidence

Google PAIR's [People + AI Guidebook](https://pair.withgoogle.com/guidebook/)
organizes human-centered AI around mental models and expectations, trust and
explanations, and feedback and controls. Its user-autonomy principle supports
explicit attribution, an immediate off/reset control, and measuring
interpretation and agency instead of click-through alone.---
title: Quiet Witness UX and Testing Research
description: Research for issue 176 on prototyping subtle, attributable, non-destructive resident presence
author: GitHub Copilot
ms.date: 2026-08-09
ms.topic: research
keywords:
  - agents
  - resident presence
  - client UX
  - testing
---

## Research Scope

Issue #176, `feat(agents): prototype quiet witness resident presence`, asks for
research-only guidance on client UX patterns, test infrastructure, resident and
agent language, controls and resets, and product/design documentation. The
research will identify a prototype for subtle, attributable, non-destructive
presence and methods for recording intrigue, discomfort, invisibility,
confusion, and perceived authorship during testing.

## Status

In progress. Findings, verified references, alternatives, and recommendations
will be added below.

## Evidence and Findings

Pending targeted source and documentation review.

## Recommendation

Pending evidence review.

## Risks and Gaps

Pending evidence review.

## External Evidence

Pending external evidence review.