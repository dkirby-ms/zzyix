<!-- markdownlint-disable-file -->
# Planning Log: Authoritative Backend Domain Port

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* None currently open.

### Plan Deviations from Research

* None currently open.

## Implementation Paths Considered

### Selected: Server-local domain port with explicit per-session operation sequencing

* Approach: Port client domain modules into apps/server/src/domain, enforce validatePlacement in place_tile, and formalize first-write-wins through per-session monotonic op sequencing.
* Rationale: Fastest path to satisfy issue #9 acceptance criteria with low structural risk.
* Evidence: .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md (Lines 169-178)

### IP-01: Immediate shared package extraction for client and server domain reuse

* Approach: Move domain modules into a shared workspace package and consume from both apps/client and apps/server.
* Trade-offs: Best long-term drift prevention but requires broader workspace/package refactor before authoritative behavior ships.
* Rejection rationale: Too much structural change for the current work item timeline.

### IP-02: External validation service behind server operation handlers

* Approach: Keep server transport thin and delegate operation validation/state mutation to a separate service.
* Trade-offs: Better future scaling boundary but adds latency, failure modes, and infrastructure complexity.
* Rejection rationale: Misaligned with current single-process architecture decision and unnecessary for issue #9.

## Suggested Follow-On Work

* WI-01: Extract shared domain package - Move placement domain code to shared workspace package to prevent long-term drift. (medium)
  * Source: IP-01 analysis
  * Dependency: Completion and stabilization of authoritative server behavior in issue #9
* WI-02: Add operation history persistence - Persist canonical operation log and state snapshots for replay and diagnostics. (high)
  * Source: GitHub issue #9 scope item on operation history and persistence
  * Dependency: Authoritative in-memory behavior complete with stable sequencing semantics
* WI-03: Add observability for op sequence diagnostics - Record per-session op sequence and reject reasons in structured logs/metrics. (low)
  * Source: Research potential next research item on op sequence diagnostics
  * Dependency: Deterministic sequencing implemented and validated
