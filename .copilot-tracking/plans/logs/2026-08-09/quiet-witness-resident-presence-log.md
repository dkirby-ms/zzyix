<!-- markdownlint-disable-file -->
# Planning Log: Quiet Witness Resident Presence

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* DR-01: Server-backed shared resident signal transport is not included in the prototype plan.
  * Source: .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 93-96, 225-233)
  * Reason: The research identifies missing consent, authorization, TTL, reset, audit, and multi-replica contracts. Implementing shared transport would exceed the issue's reversible prototype boundary.
  * Impact: Medium
* DR-02: Participant availability and scheduling remain an operational dependency for the moderated study gate.
  * Source: .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 193-210)
  * Reason: The plan now includes running and recording the no-signal versus one-signal study gate, but implementation cannot guarantee participant recruitment or scheduling.
  * Impact: Low
* DR-03: Product decisions for shared consent, audience, distance preference, cadence, retention, and reset authority remain unresolved.
  * Source: .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 22-26, 235-240)
  * Reason: These decisions are outside the client-only prototype and should be made before any shared or durable resident signal is planned.
  * Impact: Medium

### Plan Deviations from Research

* DD-01: The plan adds a minimal study construct capture path inside the prototype implementation.
  * Research recommends: Instrument only study events and avoid raw canvas data or unapproved free-text telemetry.
  * Plan implements: A consent-scoped event shape and tests for condition shown, unaided notice, detail opened, hide, reset, condition completion, and five required constructs.
  * Rationale: The issue requires recording intrigue, discomfort, invisibility, confusion, and perceived authorship. Adding a narrow event shape is necessary, provided payload tests enforce the research's telemetry limits.
* DD-02: The plan expands the test-only canvas bridge with undo and network baseline capture.
  * Research recommends: Preserve undo state and server traffic while verifying no canonical mutation.
  * Plan implements: Test-only snapshots for undo availability/depth plus fetch and Socket.IO/WebSocket frame observation around witness interactions.
  * Rationale: Concrete baseline mechanics are needed to prove hide, reset, reload, and detail opening remain non-mutating.
* DD-03: The Phase 1 validation uses a client-relative test path.
  * Plan specifies: `npm run test:client -- --run apps/client/src/domain/witnessSignals.test.ts`.
  * Implementation differs: `cd apps/client && npx vitest run --coverage src/domain/witnessSignals.test.ts`.
  * Rationale: The root script changes into apps/client, so the root-relative path cannot be discovered by Vitest.
* DD-04: The scene integration exposes optional readonly witness props.
  * Plan specifies: A witness signal render prop and detail callback in MosaicScene.
  * Implementation differs: The props are optional and the signal array is readonly.
  * Rationale: Optional props preserve existing callers until App wiring is complete, while readonly inputs make the render-only non-mutation contract explicit.
* DD-05: Reload assertions compare durable and rehydrated-local state separately.
  * Plan specifies: Canonical state remains unchanged after detail, hide, reset, and reload.
  * Implementation differs: The E2E coverage compares durable tile, ownership, and revision values across reload, then compares local cache, undo, and collaborator metrics after rehydration.
  * Rationale: Reload necessarily recreates local undo state and cache subscriptions, so comparing their pre-reload values would treat normal rehydration as a witness mutation.
* DD-06: The initial study event contract was revised during review to support both counterbalanced conditions and explicit participant responses.
  * Plan specifies: The study capture path records the five required constructs while keeping payloads bounded and consent-scoped.
  * Implementation differs: The first implementation fixed events to `one-signal` and inferred unaided notice from detail interaction; the reviewed implementation accepts `no-signal` and `one-signal`, bounded ratings, finite authorship answers, and explicit pre-detail noticed/not-noticed responses.
  * Rationale: The review identified the original contract as insufficient to run or evaluate the required moderated study.
* DD-07: Witness display positioning now resolves the nearest toroidal image and avoids occupied artist anchors.
  * Plan specifies: Render a signal beside, never over, an artist tile group.
  * Implementation differs: The initial fixed anchor did not account for camera-relative periodic images or occupied anchors; the revised render input derives a deterministic visible clear position.
  * Rationale: The review identified boundary crossings and overlap as major presentation and interpretation risks.
* DD-08: E2E reload validation separates durable canonical state from expected local rehydration state.
  * Plan specifies: Compare canonical tile, owner, revision, cache, collaborator, undo, and witness state after reload.
  * Implementation differs: Durable state is compared exactly across reload, while cache and undo metrics are checked after rehydration and mutation traffic remains asserted.
  * Rationale: Reload recreates local subscriptions and cannot preserve every in-memory metric byte-for-byte.

## Implementation Paths Considered

### Selected: Client-Only Fixture Layer with Explicit Detail, Toggle, and Reset

* Approach: Add a default-off client-only `WitnessSignal` domain, `ResidentWitnessLayer`, `MosaicScene` pass-through prop, local App controls, study-safe event capture, and E2E non-mutation tests.
* Rationale: This path is reversible, attributable, non-destructive, and consistent with existing render-only and local-control patterns.
* Evidence: .copilot-tracking/research/2026-08-09/quiet-witness-resident-presence-research.md (Lines 138-181, 187)

### IP-01: Extend Human Remote Cursor or Collaborator Roster

* Approach: Represent Fantome as a collaborator-like presence signal in the existing live presence UI.
* Trade-offs: Reuses existing presence visuals and transport, but falsely implies an active human collaborator and can create surveillance or identity confusion.
* Rejection rationale: The research states human cursors and rosters imply live collaborators, which does not match an observing resident.

### IP-02: Create Resident-Owned Tile or Owner Boundary

* Approach: Encode witness marks as resident-authored tile or ownership state.
* Trade-offs: Makes marks durable and easy to inspect through existing ownership affordances, but changes the canonical art model and conflicts with artist authorship, undo, revision, and retention semantics.
* Rejection rationale: The issue requires non-destructive marks that can be disabled or reset without affecting artist work.

### IP-03: Persist Patch-Operation Records for Marks

* Approach: Store resident witness marks as patch operations or replayable events.
* Trade-offs: Creates auditability and replay behavior, but turns an experiment into durable shared state before consent, visibility, audit, and reset contracts exist.
* Rejection rationale: The research recommends avoiding canonical patch-operation state for this prototype.

### IP-04: Server-Backed Authenticated TTL Resident Signal

* Approach: Introduce a versioned authenticated `resident_signal` payload in shared presence, backed by short-lived cross-replica cache and assignment lifecycle policy.
* Trade-offs: Best fit for a future shared resident presence feature, but requires new protocol, authorization, cache/deduplication, replica behavior, reconnect expiry, and reset authority decisions.
* Rejection rationale: Deferred until the client-only study clears safety and interpretation gates.

## Suggested Follow-On Work

Items identified during planning that fall outside current scope.

* WI-01: Shared resident signal contract — Design authenticated versioned `resident_signal` transport, TTL cache, assignment lifecycle suppression, and replica deduplication after prototype validation. (High)
  * Source: DR-01 and IP-04
  * Dependency: Client-only prototype study clears safety and interpretation gates.
* WI-02: Product consent and reset policy — Decide audience, consent flow, cadence, retention, distance preference, and whether owners, administrators, or both can disable/reset shared resident signals. (High)
  * Source: DR-03
  * Dependency: Product and research stakeholder decision.
* WI-03: Post-gate longitudinal evaluation — If the moderated study passes, evaluate whether repeated exposure changes intrigue, discomfort, or perceived authorship over longer sessions. (Medium)
  * Source: DR-02
  * Dependency: Client-only prototype clears the moderated study gate.
* WI-04: Repair existing client test type errors before relying on the production client build as a release gate. (Medium)
  * Source: Implementation Phase 4 validation
  * Dependency: Existing App and MosaicScene test type errors must be resolved independently of this prototype.
* WI-05: Run the consented, counterbalanced moderated no-signal versus one-signal study and record the five approved constructs. (High)
  * Source: Implementation Phase 5, Steps 5.4-5.5
  * Dependency: Participant availability and explicit consented-study configuration.
* WI-06: Record the moderated study results and promotion decision in a consent-scoped research artifact. (High)
  * Source: Implementation Phase 5, Steps 5.4-5.5
  * Dependency: WI-05 completion and review of attribution, discomfort, confusion, and unaided-notice gates.

### Final Validation

* Client lint, build, full client tests, E2E preflight, and the scoped quiet-witness Playwright test passed.
* Initial build/type failures were isolated to readonly collection compatibility and event/memoization typing in the prototype path; those fixes are included in the implementation.
* The reviewed implementation supports the required moderated-study response contract, but the moderated study was not run. No attribution, discomfort, invisibility, confusion, or perceived-authorship outcome is claimed.
* Shared resident signals remain deferred pending the study gate and the future authorization, TTL, reset, audit, and multi-replica contract.