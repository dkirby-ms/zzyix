<!-- markdownlint-disable-file -->
# Planning Log: Canvas Scaling and Camera Controls

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* None currently.

### Plan Deviations from Research

* DD-01: The plan introduces an explicit zoom-tier aggregation phase instead of embedding aggregation immediately in chunk core implementation.
  * Research recommends: Hybrid fixed-grid plus dynamic aggregation path.
  * Plan implements: Fixed-grid chunk core first, then explicit aggregation phase with rollout flags.
  * Rationale: Isolates core correctness and migration risks before introducing payload-shaping complexity.
* DD-02: The plan maintains finite-canvas policy capability as a long-lived compatibility mode rather than immediate bounded-assumption deprecation.
  * Research recommends: Eventual retirement of legacy bounded assumptions after adoption window.
  * Plan implements: Compatibility mode retained through final validation and rollout canary period.
  * Rationale: Reduces rollback risk and allows staged migration for active sessions.
* DD-03: Benchmark profiling and database query-plan verification are implemented as explicit pre-canary and pre-GA gates instead of immediate blocking milestones in earlier phases.
  * Research recommends: profile chunk-size/hysteresis candidates and verify DB query plans at expected scale.
  * Plan implements: gate checks in rollout and final validation phases with documented pass thresholds.
  * Rationale: keeps implementation momentum while preserving measurable risk controls before broad adoption.
* DD-04: Post-review rework phase added after initial completion to address runtime correctness and validation confidence gaps.
  * Review recommends: fix aggregate merge semantics, add direct transition tests, consolidate chunk-size runtime config, and align startup/doc behavior.
  * Plan implements: explicit Implementation Phase 6 for bounded-scope corrective work.
  * Rationale: major review findings affect correctness and rollout confidence, requiring tracked corrective implementation before closure.

## Implementation Paths Considered

### Selected: Hybrid grid chunking with phased aggregation and compatibility fallback

* Approach: First parameterize bounds and camera behavior, then add fixed-grid chunk protocol and schema support, followed by zoom-tier aggregation and controlled rollout.
* Rationale: Best balance of implementation risk, compatibility, and long-term scalability within current architecture.
* Evidence: .copilot-tracking/research/2026-07-21/canvas-scaling-camera-controls-research.md (Selected Approach, Phased plan, Risks and Mitigations)

### IP-01: Finite-only scaling by increasing global bounds constants

* Approach: Expand existing static world constants and camera limits without chunk protocol or storage changes.
* Trade-offs: Fastest short-term path, but creates immediate rendering, network, and memory pressure and does not address effectively infinite canvas requirements.
* Rejection rationale: Fails core scalability goals and defers unavoidable architecture work.

### IP-02: Quadtree adaptive partitioning from first implementation phase

* Approach: Use adaptive spatial partitioning instead of fixed-grid chunks for dynamic density handling.
* Trade-offs: Better theoretical density optimization, but significantly higher complexity in protocol semantics, edge validation, and debugging.
* Rejection rationale: Complexity and test burden are too high for initial rollout in this codebase.

### IP-03: Viewport-window streaming without chunk identity

* Approach: Stream by viewport bounds only and avoid persistent chunk IDs and room mapping.
* Trade-offs: Simpler client API, but expensive per-client server queries and weaker fanout reuse.
* Rejection rationale: Underutilizes existing room architecture and increases server query cost.

## Suggested Follow-On Work

* WI-01: Chunk benchmark harness and tuning - Build replayable camera movement traces and density scenarios to tune chunk size, prefetch ring, and hysteresis thresholds. (High)
  * Source: Potential Next Research section
  * Dependency: Phase 2 chunk subscription implementation
* WI-02: Database plan diagnostics and index strategy study - Capture query plans at canary scale and evaluate B-tree versus GiST or spatial extensions where warranted. (High)
  * Source: Potential Next Research section
  * Dependency: Phase 3 chunk-aware schema rollout
* WI-03: Chunk-edge property test suite - Add randomized tile placement and boundary overlap property tests for cross-chunk validation robustness. (Medium)
  * Source: Risks and Mitigations
  * Dependency: Phase 3 parity test baseline
* WI-04: Multi-replica chunk membership implementation hardening - Extend the readiness contract to production-grade shared membership sources and chaos validation under replica failover. (Medium)
  * Source: Scenario 2 eventual multi-replica requirement
  * Dependency: Phase 4 multi-replica readiness contract and failure-mode validation
* WI-05: Operational runbook for feature-flag rollback and resync storms - Document mitigation and on-call workflow for churn spikes. (Medium)
  * Source: Rollout and telemetry strategy
  * Dependency: Phase 4 telemetry instrumentation
* WI-06: Shared bounds policy typing - Consolidate client and server bounds policy types into a shared contract module to reduce divergence risk. (Medium)
  * Source: Phase 1 implementation findings
  * Dependency: Phase 2 contract expansion stability
* WI-07: Client bundle payload optimization - Evaluate code-splitting strategy for large bundle warning observed in client build. (Low)
  * Source: Phase 1 validation output
  * Dependency: Phase 4 protocol and render feature additions
* WI-08: Chunk mapping utility unit coverage - Add direct unit tests for viewport-to-chunk mapping, hysteresis, and budget-limit edge cases. (Medium)
  * Source: Phase 2 implementation findings
  * Dependency: Phase 3 migration parity baseline
* WI-09: Mixed-consumer socket integration coverage - Expand server integration tests to model simultaneous legacy and chunk-enabled consumers under churn. (Medium)
  * Source: Phase 2 implementation findings
  * Dependency: Phase 4 feature-flag controls
* WI-10: Migration dry-run at scale - Execute migration lock and index creation timing checks against representative data volume before canary. (High)
  * Source: Phase 3 implementation findings
  * Dependency: Phase 4 rollout gate preparation
* WI-11: Shared chunk size configuration - Centralize `CHUNK_WORLD_SIZE` into a shared configuration contract for repository and realtime layers. (Medium)
  * Source: Phase 3 implementation findings
  * Dependency: Phase 4 zoom-tier policy stabilization
* WI-12: Zoom-tier hysteresis unit coverage - Add explicit threshold and debounce tests for zoom-tier switching behavior. (Medium)
  * Source: Phase 4 implementation findings
  * Dependency: Phase 5 validation hardening
* WI-13: Canary gating negative-path tests - Add integration tests validating non-canary sessions are denied chunk streaming when gating is enabled. (Medium)
  * Source: Phase 4 implementation findings
  * Dependency: Phase 5 full test sweep
* WI-14: Request snapshot payload-mode parity test - Add a server integration test asserting `request_chunk_snapshot` honors requested payload mode semantics end-to-end when capabilities allow both modes. (Low)
  * Source: Phase 6 implementation findings
  * Dependency: Phase 6 correctness rework completion

## User Decisions

* ID-01: Post-review corrective scope handling — Option A selected
  * Rationale: Implement corrective items as an explicit new phase in the existing plan to preserve artifact traceability and phase-based validation history.
