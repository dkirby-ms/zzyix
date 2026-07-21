<!-- markdownlint-disable-file -->
# Planning Log: Collaboration UX Primitives

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* None.

### Plan Deviations from Research

* DD-01: Timer-based UI assertions were replaced with deterministic helper/state checks in client tests.
  * Plan specifies: broad collaboration flow assertions in UI-level tests.
  * Implementation differs: deterministic non-UI timer assertions were used where fake-timer timeouts reduced reliability.
  * Rationale: preserve stable test execution while maintaining coverage intent.
* DD-02: Post-implementation review surfaced additional correctness and scalability concerns that require a dedicated rework phase.
  * Plan specifies: implementation complete after Phase 4 final validation.
  * Implementation differs: added Phase 5 for snapshot-authority, selection render-path optimization, and guard-path test depth.
  * Rationale: resolve major review findings before handoff closure.
* DD-03: Selection/disconnect guard coverage was expanded with deterministic production-semantics tests rather than introducing a new live-socket harness in this phase.
  * Plan specifies: integration depth on disconnect and membership guard paths.
  * Implementation differs: strengthened helper-level and payload guard-path assertions without full multi-replica live socket topology simulation.
  * Rationale: existing test architecture does not include a socket-level integration harness; adding one is deferred follow-on work.

## Implementation Paths Considered

### Selected: Incremental event adoption with additive selection_update

* Approach: Adopt existing presence and pointer events end-to-end in client state/rendering, then add additive `selection_update` contract and runtime support.
* Rationale: Minimal disruption, leverages existing server contracts/runtime, and directly addresses issue #15 scope.
* Evidence: .copilot-tracking/research/2026-07-21/collaboration-ux-primitives-research.md (Lines 161-177, 184-190)

### IP-01: Snapshot-authoritative collaboration state

* Approach: Include pointer and selection as authoritative snapshot state and remove ephemeral event dependence.
* Trade-offs: Strong consistency and replayability, but higher server complexity, larger payloads, and unnecessary state churn for transient pointers.
* Rejection rationale: Too broad for current scope and higher risk for regression across canonical state flows.

### IP-02: No new selection event (derive selection from existing behavior)

* Approach: Infer remote selection from pointer proximity and recent tile operations.
* Trade-offs: No contract additions, but weak UX fidelity and ambiguous collaborator intent under contention.
* Rejection rationale: Fails reliability and usability goals for explicit remote selection indicators.

## Suggested Follow-On Work

* WI-01: Cursor and selection contention benchmark - Run moderate peer-count simulation to tune pointer/selection throttling defaults with measured frame-time and bandwidth impact. (Medium)
  * Source: .copilot-tracking/research/2026-07-21/collaboration-ux-primitives-research.md
  * Dependency: Base collaboration flow implemented
* WI-02: Identity strategy decision for multi-tab collaboration - Decide and document whether identity should remain browser-profile scoped (`localStorage`) or move to per-tab semantics for collaboration UX. (Medium)
  * Source: .copilot-tracking/research/subagents/2026-07-21/collaboration-ux-primitives-implementation-research.md
  * Dependency: Base collaboration flow implemented
* WI-03: Add dedicated socket hook collaboration subscription lifecycle tests - Increase coverage for subscribe and cleanup behavior for `pointer_update`, `client_joined`, and `client_left`. (Low)
  * Source: Implementation Phase 1 completion report
  * Dependency: Collaboration event API stabilization
* WI-04: Add explicit throttling-window tests for `selection_update` emits - Verify rate-bound behavior under rapid selection changes. (Low)
  * Source: Implementation Phase 2 completion report
  * Dependency: Phase 3 contention behavior completion
* WI-05: Add runtime socket integration test for last-socket leave semantics - Validate full connect/disconnect sequence beyond helper-level coverage. (Low)
  * Source: Implementation Phase 3 completion report
  * Dependency: Current collaboration hardening merged
* WI-06: Evaluate shared presence coordination for multi-replica deployment - Replace process-local leave gate with shared adapter-aware or persisted membership source. (High)
  * Source: Review findings, Phase 5 Step 5.3
  * Dependency: Architectural planning follow-up
* WI-07: Build a socket-level server integration harness for connect/disconnect and room fanout path assertions. (Medium)
  * Source: Phase 5 implementation deviation DD-03
  * Dependency: Test infrastructure planning for server runtime sockets
