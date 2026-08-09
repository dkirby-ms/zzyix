<!-- markdownlint-disable-file -->
# Planning Log: Agent Worker Runtime Testing

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* None. All current research and user requirements are represented by explicit objectives and implementation steps in the plan and details artifacts.

### Plan Deviations from Research

* None. The plan remains aligned with research recommendations; additive documentation scope does not introduce a research contradiction.

## Implementation Paths Considered

### Selected: Single runtime path with layered verification

* Approach: Keep one production Agent Framework workflow path and validate it through fast boundary-substituted tests, dedicated runtime contract tests, and PostgreSQL process integration tests.
* Rationale: Maximizes fidelity while preserving deterministic and fast feedback loops.
* Evidence: .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 234-242)

### IP-01: Restore separate internal workflow test graph

* Approach: Re-introduce an internal test-only runtime path to avoid dependence on Agent Framework behavior in tests.
* Trade-offs: Faster isolated tests but duplicate orchestration logic, lower production fidelity, and high drift risk.
* Rejection rationale: Research explicitly rejected this because it can pass while Agent Framework integration is broken.

### IP-02: Replace most stubs with fully live dependencies in all worker tests

* Approach: Require live auth, live model, live server, and durable database for most worker tests.
* Trade-offs: Higher realism but slow, brittle, credential-dependent test execution and unclear fault boundaries.
* Rejection rationale: Research recommends stubs at external boundaries except in dedicated process/persistence lanes.

## Suggested Follow-On Work

* WI-01: Define canonical worker migration bootstrap command - Document and script database role provisioning for agent_control_worker in CI and local integration environments. (high)
  * Source: .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 257-258)
  * Dependency: CI PostgreSQL integration lane foundation
* WI-02: Evaluate control-plane transactional invariants - Add explicit integration cases for partial-progress states across process interruption boundaries. (medium)
  * Source: .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 258-258)
  * Dependency: PostgreSQL integration lane active
* WI-03: Stabilize dynamic executor construction - Consider replacing lambda initializer with keyword-based constructor if framework API churn increases. (medium)
  * Source: .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 252-252)
  * Dependency: Runtime contract suite baseline available
