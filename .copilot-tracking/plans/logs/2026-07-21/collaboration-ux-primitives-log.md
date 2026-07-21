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
