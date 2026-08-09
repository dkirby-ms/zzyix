<!-- markdownlint-disable-file -->
# RPI Validation: Quiet Witness Resident Presence, Phase 2

Status: Partial

Validated: 2026-08-09

## Scope

This review validates only Implementation Phase 2, Render Layer and Scene
Integration. It compares the Phase 2 plan and detail requirements with the
changes log, implementation, and component tests. Production code was not
modified during this review.

## Requirement Coverage

| Plan item | Required behavior | Verified evidence | Status |
|---|---|---|---|
| Step 2.1 | Provide a static, render-only witness layer driven by `WitnessSignal[]`, with Fantome attribution and non-mutation detail copy | `ResidentWitnessLayer` accepts a readonly signal list and an optional callback; it only maps signals to static ring and circle meshes. Its accessible button has the required Fantome label and is described by the exact non-mutation copy. See [ResidentWitnessLayer.tsx](../../../../../apps/client/src/render/ResidentWitnessLayer.tsx#L4-L8) and [ResidentWitnessLayer.tsx](../../../../../apps/client/src/render/ResidentWitnessLayer.tsx#L23-L58). | Met |
| Step 2.1 | Prove the layer renders, reports detail, and preserves caller-owned signal data | The component test freezes the signal collection and nested anchor, verifies the accessible button and detail text, invokes the callback with the original signal, and confirms the source data is unchanged. See [ResidentWitnessLayer.test.tsx](../../../../../apps/client/src/render/ResidentWitnessLayer.test.tsx#L24-L41). | Met |
| Step 2.2 | Pass witness data and detail callbacks into `MosaicScene` without entering tile, owner, cursor, minimap, or selection paths | `MosaicSceneProps` declares optional readonly witness props. `SceneContents` renders the witness layer as a sibling after canonical `tileImages` and before remote selections. Remote selections resolve only from `tilesById`; cursors and the interaction plane receive no witness data. See [MosaicScene.tsx](../../../../../apps/client/src/render/MosaicScene.tsx#L40-L54), [MosaicScene.tsx](../../../../../apps/client/src/render/MosaicScene.tsx#L527-L570), and [MosaicScene.tsx](../../../../../apps/client/src/render/MosaicScene.tsx#L700-L730). | Met |
| Step 2.2 | Preserve readonly canonical scene inputs | The scene test freezes tile, cursor, selection, camera, and witness values; after rendering and detail activation it verifies the artist owner, cursor, selection, camera, and signal anchor values remain unchanged. See [MosaicScene.test.tsx](../../../../../apps/client/src/render/MosaicScene.test.tsx#L176-L234). The related type-only changes accept readonly tile collections without adding mutation paths. See [placementSolver.ts](../../../../../apps/client/src/domain/placementSolver.ts#L76-L91), [gridOverlayGeometry.ts](../../../../../apps/client/src/render/gridOverlayGeometry.ts#L14-L35), and [periodicImages.ts](../../../../../apps/client/src/render/periodicImages.ts#L54-L65). | Met |
| Step 2.3 | Run focused render and scene tests | The changes log records the client-relative Phase 2 focused render tests as completed and documents why the root-relative form cannot discover client tests. See [quiet-witness-resident-presence-changes.md](../../../../changes/2026-08-09/quiet-witness-resident-presence-changes.md#L36-L44). A fresh run in this review could not be confirmed because the shared terminal returned unrelated `lint:client` output instead of the requested Vitest result. | Partial |

## Specification Comparison

The implementation satisfies the research requirement for a third rendering
surface. The witness layer is not passed to `TileMesh`, `GridOverlay`, remote
selection lookup, remote cursor rendering, or interaction-plane callbacks.
The client-only `WitnessSignal` contract is also absent from server sources.

Accessibility requirements are met by an accessible button named with
`Fantome resident witness mark`, `aria-describedby` detail linkage, and the
required explicit copy: `Witness mark. Observed by Fantome, the resident. This
prototype signal did not change this mosaic.` See
[ResidentWitnessLayer.tsx](../../../../../apps/client/src/render/ResidentWitnessLayer.tsx#L4-L5) and
[ResidentWitnessLayer.tsx](../../../../../apps/client/src/render/ResidentWitnessLayer.tsx#L43-L56).

## Findings

### Critical

No critical findings.

### Major

No major findings.

### Minor

No minor implementation findings.

## Validation Limitation

The focused Vitest command requested during this review could not be
independently verified because the shared terminal returned a stale,
unrelated `lint:client` stream. The source and test evidence are consistent,
and the changes log records the prior focused test pass, but this review does
not treat that historical entry as a fresh execution result.

## Coverage Assessment

Phase 2 implementation coverage is complete: 3 of 3 plan steps have direct
source and test evidence. The render layer and `MosaicScene` integration meet
the plan and research non-mutation and accessibility requirements. Overall
status remains Partial only because the focused test result was not freshly
reproduced in this session.

## Clarifying Questions

No unresolved implementation questions.

## Recommended Next Validations

* Run `npx vitest run src/render/ResidentWitnessLayer.test.tsx src/render/MosaicScene.test.tsx --coverage.enabled=false` from `apps/client` in an uncontended terminal.
* Run `npm run lint:client` after any subsequent render-layer edits.
* Run the Phase 4 E2E non-mutation scenario before promoting the prototype beyond the consented study condition.