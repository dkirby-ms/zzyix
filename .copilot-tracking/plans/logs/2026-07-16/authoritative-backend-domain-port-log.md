<!-- markdownlint-disable-file -->
# Planning Log: Authoritative Backend Domain Port

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* None currently open.

### Plan Deviations from Research

* DD-01: Server dependency installation was required before Phase 1 validation commands could execute.
  * Plan specifies: Run lint and targeted tests directly in Step 1.3.
  * Implementation differs: Executed dependency install first, which generated apps/server/package-lock.json and apps/server/coverage artifacts.
  * Rationale: apps/server local dev dependencies were absent in the execution environment; validation tools were unavailable until install.
* DD-02: Lint warning persisted in pre-existing server handler file.
  * Plan specifies: Validate Phase 1 changes.
  * Implementation differs: Lint passed with warning in apps/server/src/index.ts for unused SCHEMA_VERSION import.
  * Rationale: warning is outside Phase 1 file scope and did not impact domain port or parity tests.
* DD-03: Phase 4 build surfaced pre-existing compiler configuration/runtime typing mismatches.
  * Plan specifies: Run full validation and fix minor issues in-scope.
  * Implementation differs: Added targeted fixes in apps/server/tsconfig.json and apps/server/src/index.ts before full validation passed.
  * Rationale: build failures prevented completion of Step 4.1 and were straightforward to resolve within scope.

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
* WI-04: Add socket-level integration tests for ack and broadcast ordering - Verify runtime ordering behavior over live Socket.IO transport, not only unit-level handler tests. (medium)
  * Source: Phase 2 implementation suggestion
  * Dependency: Authoritative mutation handlers stabilized
* WI-05: Add persistence for operation history and snapshot replay - Extend current in-memory authoritative model to durable history when issue scope expands. (high)
  * Source: Phase 2 implementation suggestion
  * Dependency: Current deterministic in-memory semantics complete and accepted
* WI-06: Consider extracting server runtime side effects behind a bootstrap module - Isolate process signal/server listen wiring for cleaner unit testing and fewer typing edge cases. (low)
  * Source: Phase 4 validation fixes
  * Dependency: Current authoritative behavior accepted and stabilized
