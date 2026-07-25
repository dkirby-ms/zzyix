<!-- markdownlint-disable-file -->
# Planning Log: Client Bundle Mitigation and Gate Closure

## Discrepancy Log

### Unaddressed Research Items

* DR-01: Bundle gate metric is still not contractually explicit across raw, gzip, or initial-route measurements.
  * Source: .copilot-tracking/research/2026-07-25/client-bundle-mitigation-research.md (Lines 70-72)
  * Reason: Product owner clarification not yet available in current conversation context.
  * Impact: medium

### Plan Deviations from Research

* DD-02: Phase 3.1 executed as analysis-only without source edits.
  * Plan specifies: Narrow optional primitive runtime surface if gate remains unmet.
  * Implementation differs: Runtime import scan confirmed optional wrappers (Dialog, AlertDialog, Tabs, ToggleGroup, VisuallyHidden) are not imported in active app paths, so no reduction edits were available.
  * Rationale: Preserve low-risk scope and avoid churn on modules that are already excluded from runtime imports.

* DD-03: Interim mitigation byte target not fully met after low-risk and chunking changes.
  * Plan specifies: interim pass target reduces at least 100000 bytes from inherited baseline.
  * Implementation differs: total raw bytes reduced by 18573 bytes (1587574 -> 1569001) while initial-route JS dropped materially due to chunk split.
  * Rationale: Applied prioritized low-risk and conditional chunking changes without broad primitive rollback.

## Decision Updates

### DD-01: Implementation-time gate metric default for Phase 1

* Decision: Use total raw bytes from `wc -c dist/assets/*` as the implementation-time gate metric until owner clarification is provided.
* Baseline and thresholds confirmed for this cycle:
  * Inherited baseline total assets: 1587574 bytes
  * Interim pass target: reduce by at least 100000 bytes from inherited baseline
  * Final inherited gate reference: <= 30000 byte delta against pre-UX baseline
* Current observed Phase 1 baseline build total (verification run): 1588100 bytes
* DR-01 remains open because canonical gate definition across raw, gzip, and initial-route payload is not yet contractually fixed.

## Implementation Paths Considered

### Selected: Path A first, then Path C, then Path B

* Approach: start with low-risk runtime surface reduction and icon experiment, then escalate to primitive narrowing and lazy chunking only as needed.
* Rationale: best risk-to-effort order while preserving current UX behavior.
* Evidence: .copilot-tracking/research/2026-07-25/client-bundle-mitigation-research.md (Lines 40-66)

### IP-01: Lazy-load canvas first

* Approach: immediately split MosaicScene and 3D stack using React lazy boundaries.
* Trade-offs: potentially strong initial-load gains but higher behavior/regression risk and loading-state complexity.
* Rejection rationale: chosen as second-wave optimization after lower-risk reductions.

### IP-02: Full primitive wrapper rollback

* Approach: remove most newly added primitive wrappers and dependency surface in one pass.
* Trade-offs: larger byte reduction opportunity but high churn and near-term rework risk if wrappers are needed soon.
* Rejection rationale: over-corrective compared to incremental mitigation strategy.

## Suggested Follow-On Work

* WI-01: Establish canonical bundle gate metric contract - define acceptance using raw/gzip/initial-route and add to plan template. (high)
  * Source: DR-01
  * Dependency: stakeholder decision
* WI-02: Add temporary visualizer-based attribution runbook - capture per-package contributions before and after each phase. (medium)
  * Source: subagent research recommendation
  * Dependency: completion of Phase 1 baseline capture
* WI-03: Add CI budget check for selected metric - fail PRs when deltas exceed agreed threshold. (medium)
  * Source: DD-04 recurring risk
  * Dependency: WI-01 completion
* WI-04: Re-evaluate bundle gate against initial-route payload budget in addition to total output size. (high)
  * Source: DD-03
  * Dependency: WI-01 completion
* WI-05: Perform package-attribution run (visualizer/rollup stats) for `MosaicScene` chunk to identify next low-risk reductions. (medium)
  * Source: DD-03
  * Dependency: WI-02 completion