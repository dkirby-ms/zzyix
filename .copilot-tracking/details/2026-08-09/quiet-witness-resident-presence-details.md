<!-- markdownlint-disable-file -->
# Implementation Details: Quiet Witness Resident Presence

## Context Reference

Sources: .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md, package.json, apps/client/package.json, and user request to follow task-plan.prompt.md.

## Implementation Phase 1: Domain Gate and Fixture Contract

<!-- parallelizable: false -->

### Step 1.1: Define witness signal contract

Create a client-only domain module that owns the witness prototype contract. Define `WitnessSignal`, a `residentId: 'fantome'` discriminator, a `source: 'prototype-fixture'` field, deterministic sample fixture data, and helpers that return signals only when both the prototype feature gate and explicit consented-study gate are true. Keep this module independent from `TileInstance`, collaborator presence, socket event payloads, patch operations, undo, replay, and cache APIs.

Files:
* apps/client/src/domain/witnessSignals.ts - New type, gate helpers, deterministic sample fixture source, reset helper, and optional study-condition constants.
* apps/client/src/domain/witnessSignals.test.ts - New unit tests for gate and reset behavior.

Discrepancy references:
* None. This step follows the selected client-only approach.

Success criteria:
* `WitnessSignal` cannot be passed to existing tile, collaborator, socket, or patch-operation APIs without explicit conversion.
* Fixture data is returned only when both gates are enabled.
* Reset returns the fixture source to its initial prototype condition without touching artist state.

Context references:
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 111-124) - Prototype type and separation from canonical domains.
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 132-136) - Non-mutation and independent hide/reset requirements.

Dependencies:
* Existing client TypeScript and Vitest setup.

### Step 1.2: Add focused domain tests

Cover the no-signal default, feature-only false, consent-only false, combined-gate true, deterministic fixture output, and reset behavior. Include an assertion that the domain module does not import tile, collaborator, socket, or patch-operation modules.

Files:
* apps/client/src/domain/witnessSignals.test.ts - New tests for fixture gating and separation.

Success criteria:
* Tests fail if fixture signals appear in ordinary sessions.
* Tests fail if reset behavior implies a tile, ownership, revision, cache, or collaborator mutation.

Context references:
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 214-217) - Required unit/component coverage.

Dependencies:
* Step 1.1 completion.

### Step 1.3: Validate phase changes

Run focused client tests for the new domain module before integrating the render layer.

Validation commands:
* `npm run test:client -- --run apps/client/src/domain/witnessSignals.test.ts` - Domain gate and fixture tests.
* `npm run lint:client` - Client lint for the new module and test file.

## Implementation Phase 2: Render Layer and Scene Integration

<!-- parallelizable: false -->

### Step 2.1: Add resident witness render layer

Create `ResidentWitnessLayer` as a presentational component that receives `WitnessSignal[]`, renders one subdued static glyph or partial ring beside an artist tile group, and exposes accessible attribution. Use static geometry and distinct styling from human collaborator colors. The layer must not handle tile placement, selection, camera changes, minimap state, ownership boundaries, collaborator cursors, or server messages.

Files:
* apps/client/src/render/ResidentWitnessLayer.tsx - New Three Fiber layer for witness geometry and accessible hit target/detail affordance.
* apps/client/src/render/ResidentWitnessLayer.test.tsx - New component tests for rendering, labeling, detail callback, and no mutation props.

Discrepancy references:
* None. This step follows the selected render-only approach.

Success criteria:
* The rendered mark includes accessible text containing `Fantome resident witness mark`.
* The mark detail copy says `Witness mark. Observed by Fantome, the resident. This prototype signal did not change this mosaic.`
* The component is driven entirely by `WitnessSignal[]` props and never mutates signal or tile data.

Context references:
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 100-107) - UX constraints and separate render surface requirement.
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 140-145) - Selected visual/detail behavior.
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 158-164) - Layer isolation and attribution requirements.

Dependencies:
* Step 1.1 completion.

### Step 2.2: Integrate witness layer into MosaicScene

Add a `witnessSignals` render prop and detail callback to `MosaicScene`. Render `ResidentWitnessLayer` in its own scene branch after canonical tile geometry and outside owner-boundary and remote-cursor loops. Preserve existing tile, owner-boundary, cursor, selection, camera, and minimap data flows.

Files:
* apps/client/src/render/MosaicScene.tsx - Add witness props and render the layer separately.
* apps/client/src/render/MosaicScene.test.tsx - Extend existing tests for separate witness geometry and unchanged tile/collaborator arrays.

Success criteria:
* `MosaicScene` does not merge witness signals into tile or collaborator arrays.
* Existing owner boundary and remote cursor tests still pass.
* New tests prove witness rendering does not alter selection, camera, or tile ownership props.

Context references:
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 55-57) - Existing MosaicScene owner/cursor paths and third-surface requirement.
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 171-174) - Implementation sequence for scene integration.

Dependencies:
* Step 2.1 completion.

### Step 2.3: Validate scene changes

Run focused render tests before adding App-level controls.

Validation commands:
* `npm run test:client -- --run apps/client/src/render/ResidentWitnessLayer.test.tsx apps/client/src/render/MosaicScene.test.tsx` - Render layer and scene integration tests.
* `npm run lint:client` - Client lint for render changes.

## Implementation Phase 3: Local Controls, Detail Copy, and Study Events

<!-- parallelizable: false -->

### Step 3.1: Add local controls and study event state

Wire the witness fixture into `App.tsx` behind local prototype and consented-study configuration. Add a compact edge control with a pressed `Witness signals` toggle and a `Reset prototype signals` command. Store local hide/reset/detail state separately from world, tile, collaborator, cache, revision, undo, and server synchronization state. Record only study-safe events: condition shown, unaided notice, detail opened, hide, reset, and condition completion.

Files:
* apps/client/src/App.tsx - Add local witness state, controls, detail popover/dialog, reset path, and study-event capture.
* apps/client/src/App.test.tsx - Extend tests for controls, attribution copy, keyboard access, and non-mutation assertions.

Discrepancy references:
* DR-02 is addressed by recording study constructs here and running the moderated study gate in Phase 5, with participant scheduling tracked as an operational dependency.

Success criteria:
* Ordinary sessions show no witness controls or signals by default.
* Enabled study sessions show the witness toggle, reset command, and detail text.
* Hide and reset affect only witness fixture display state.
* Study events do not include raw canvas data or unapproved free-text feedback.

Context references:
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 58-60) - Existing App local hide/restore and non-canonical teardown patterns.
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 165-167) - Study-safe event requirements.
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 175-179) - App controls and study sequence.

Dependencies:
* Implementation Phase 2 completion.

### Step 3.2: Add App-level tests

Extend React tests for default-off behavior, combined gate behavior, keyboard-visible detail, accessible attribution, hide, reset, and unchanged canonical state values available in App test fixtures.

Files:
* apps/client/src/App.test.tsx - Add witness-control and study-event tests.

Success criteria:
* Tests fail if attribution copy omits Fantome or implies mutation.
* Tests fail if hide/reset changes tile, collaborator, revision, cache, or owner attribution fixtures.
* Tests fail if study events include raw canvas content.

Context references:
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 212-220) - Required unit and E2E verification.

Dependencies:
* Step 3.1 completion.

### Step 3.3: Validate App changes

Run focused App tests after wiring local controls.

Validation commands:
* `npm run test:client -- --run apps/client/src/App.test.tsx` - App controls, accessible detail, and non-mutation tests.
* `npm run lint:client` - Client lint for App changes.

## Implementation Phase 4: E2E Non-Mutation and Evaluation Protocol

<!-- parallelizable: false -->

### Step 4.1: Extend test-only canvas bridge

Expose only the minimum witness fixture controls and canonical-state inspection needed by Playwright. Keep the bridge test-only and avoid adding production APIs for witness fixture mutation. Add a canonical baseline snapshot that includes tile ids and colors, `placedBy`, owner attribution, revision id or sequence, cache metrics already available to tests, collaborator count, undo stack depth or undo availability, and a witness-only display state. Add a test-only network observer for fixture runs that records fetch calls and Socket.IO/WebSocket frames relevant to placement, deletion, revision, cache refresh, and collaborator updates so hide, reset, reload, and detail opening can be compared against a pre-interaction baseline.

Files:
* apps/client/src/test/canvasTestApi.ts - Extend the test bridge with fixture seeding, witness state inspection, and canonical state snapshot helpers.

Discrepancy references:
* None. This step stays within test-only infrastructure.

Success criteria:
* Playwright can enable the prototype and consented-study condition for one browser.
* Playwright can compare canonical tile, owner, revision, cache, collaborator, undo, and witness-only display state before and after witness interactions.
* Playwright can assert witness interactions do not emit tile placement, deletion, revision mutation, cache invalidation, or collaborator-update network/socket traffic.
* No production runtime API is introduced for witness fixture mutation.

Context references:
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 66-68) - Existing test bridge and multi-user fixture suitability.
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 177-178) - Test bridge extension sequence.

Dependencies:
* Implementation Phase 3 completion.

### Step 4.2: Add quiet witness E2E spec

Create a Playwright spec that seeds human-authored tiles, captures a canonical and network baseline, enables witness fixture data for one browser, verifies another browser sees no canonical state changes, exercises detail open, hide, reset, and reload, and asserts no placement, deletion, revision, cache, collaborator, undo, server traffic, or owner-attribution changes.

Files:
* e2e/quiet-witness.spec.ts - New E2E coverage for witness fixture visibility and non-mutation.

Success criteria:
* One-browser witness fixture visibility does not appear as a human collaborator in another browser.
* Detail open, hide, reset, and reload do not change canonical tile, ownership, revision, cache, collaborator, or undo state.
* The network observer records no tile placement, deletion, revision mutation, cache invalidation, or collaborator-update traffic caused by witness interactions.
* The E2E spec captures screenshots or DOM evidence only for witness UI and avoids raw canvas telemetry.

Context references:
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 218-220) - Required E2E non-mutation coverage.

Dependencies:
* Step 4.1 completion.

### Step 4.3: Add evaluation construct capture

Provide a lightweight, consent-scoped study capture shape for the five required constructs: intrigue, discomfort, invisibility, confusion, and perceived authorship. Prefer local test/study output or explicit study event logging over product telemetry. Do not include raw canvas data or unapproved free-text in telemetry.

Files:
* apps/client/src/domain/witnessSignals.ts - Add study construct identifiers if they belong with the prototype domain.
* apps/client/src/App.tsx - Record study-safe witness events already named in Step 3.1.
* e2e/quiet-witness.spec.ts - Assert study event names and payload shapes remain limited.

Discrepancy references:
* DR-02 is addressed by combining this capture path with the moderated study gate in Phase 5, with participant scheduling tracked as an operational dependency.

Success criteria:
* The implementation can record the five required constructs for a consented study session.
* Event payload tests fail if raw canvas data or arbitrary free-text is included.
* The release gate remains blocked if participants attribute artist work to Fantome, show high discomfort/confusion, or fail unaided discovery.

Context references:
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 193-210) - Required evaluation constructs and release gates.
* .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 165-167) - Study-safe event constraints.

Dependencies:
* Steps 3.1 and 4.2 completion.

## Implementation Phase 5: Final Validation

<!-- parallelizable: false -->

### Step 5.1: Run full project validation

Execute all validation commands for the modified client and E2E scopes:
* `npm run lint:client`
* `npm run build:client`
* `npm run test:client`
* `npm run test:e2e:preflight`
* `npx playwright test e2e/quiet-witness.spec.ts --reporter=line`

### Step 5.2: Fix minor validation issues

Iterate on lint errors, build warnings, type errors, and focused test failures. Apply fixes directly when corrections are straightforward and isolated to the prototype files.

### Step 5.3: Report blocking issues

When validation failures require server-backed shared presence, authorization design, product policy, consent design, or cross-replica behavior:
* Document the issue and affected files.
* Keep artist state non-mutating.
* Recommend additional research and planning rather than adding durable resident marks.

### Step 5.4: Run moderated study gate

Run the counterbalanced no-signal versus one-signal study after code validation passes and consented study configuration is available. Collect unaided notice before detail exposure, then record 1-7 responses for intrigue, discomfort, invisibility, and confusion, plus the perceived-authorship answer for nearby mosaic authorship. Store only consented study outputs and exclude raw canvas content or unapproved free-text telemetry.

### Step 5.5: Record study gate outcome

Compare study results to the release gates from research. Stop or redesign if participants attribute artist tiles to Fantome, discomfort or confusion is consistently high, or most participants fail unaided discovery. Do not promote the prototype to shared resident signals unless the study clears these conditions.

## Dependencies

* React 19, Three Fiber, Vite, Vitest, oxlint, and Playwright from apps/client/package.json and package.json.
* Existing client test utilities and multi-user Playwright fixtures.
* Explicit study configuration for the prototype feature and consented-study gate.

## Success Criteria

* The prototype is default-off and appears only for consented study sessions.
* Fantome witness marks are accessible, attributable, static, and non-mutating.
* Hide and reset controls never alter artist tiles, ownership, revisions, cache, undo, collaborator state, or server traffic.
* Unit, component, and E2E tests cover the non-mutation and attribution requirements.
* The moderated study records intrigue, discomfort, invisibility, confusion, and perceived authorship while avoiding raw canvas telemetry.