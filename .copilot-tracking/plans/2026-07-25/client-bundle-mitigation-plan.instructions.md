---
applyTo: '.copilot-tracking/changes/2026-07-25/client-bundle-mitigation-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Client Bundle Mitigation and Gate Closure

## Overview

Implement a focused follow-on optimization task to reduce client bundle overhead and close the unresolved bundle-size gate through measurable low-risk runtime-surface reductions, controlled icon impact experimentation, and conditional chunking escalation.

## Objectives

### User Requirements

* Address unresolved bundle-size blocker from prior UX token and primitive rollout. Source: .copilot-tracking/plans/logs/2026-07-25/ux-design-tokens-and-accessible-primitives-log.md (Lines 27-31)
* Reduce UI bundle overhead from primitives and icons. Source: .copilot-tracking/plans/logs/2026-07-25/ux-design-tokens-and-accessible-primitives-log.md (Lines 58-60)
* Define and execute measurable icon adapter mitigation experiment. Source: .copilot-tracking/plans/logs/2026-07-25/ux-design-tokens-and-accessible-primitives-log.md (Lines 61-63)

### Derived Objectives

* Use deterministic baseline and delta reporting to make mitigation outcomes auditable. Derived from: .copilot-tracking/research/2026-07-25/client-bundle-mitigation-research.md (Lines 48-69)
* Prioritize low-regression changes before architectural chunking changes. Derived from: .copilot-tracking/research/2026-07-25/client-bundle-mitigation-research.md (Lines 40-66)
* Maintain open tracking for gate metric ambiguity while unblocking implementation with a default metric. Derived from: .copilot-tracking/research/2026-07-25/client-bundle-mitigation-research.md (Lines 70-72)

## Context Summary

### Project Files

* apps/client/src/App.tsx - Root runtime composition and import boundary between lobby and canvas paths
* apps/client/src/render/MosaicScene.tsx - 3D rendering dependency entrypoint likely driving bundle weight
* apps/client/src/ui/primitives/Toast.tsx - Candidate runtime primitive surface for low-risk reduction
* apps/client/src/ui/icons/index.ts - Icon adapter module used for WI-05 impact experiment
* apps/client/vite.config.ts - Build/chunk configuration baseline for conditional optimization

### References

* .copilot-tracking/research/2026-07-25/client-bundle-mitigation-research.md - Primary follow-on research synthesis
* .copilot-tracking/research/subagents/2026-07-25/client-bundle-mitigation-research.md - Subagent evidence and path trade-off analysis
* .copilot-tracking/plans/logs/2026-07-25/ux-design-tokens-and-accessible-primitives-log.md - Prior task discrepancy and follow-on source

### Standards References

* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/prompts/hve-core/task-plan.prompt.md - Planning prompt requirements

### Gate Criteria

* Baseline for this follow-on plan: 1587574 bytes total assets in apps/client/dist/assets from prior UX implementation validation.
* Interim mitigation pass condition: reduce total assets by at least 100000 bytes from baseline.
* Final inherited acceptance condition: total built asset delta remains <= 30000 bytes against the pre-UX baseline recorded in prior task artifacts.
* Default evaluation metric until stakeholder clarification: total raw bytes from `wc -c dist/assets/*`.

## Implementation Checklist

### [x] Implementation Phase 1: Metric Baseline and Scope Confirmation

<!-- parallelizable: false -->

* [x] Step 1.1: Capture baseline build totals and runtime import evidence
  * Details: .copilot-tracking/details/2026-07-25/client-bundle-mitigation-details.md (Lines 11-29)
* [x] Step 1.2: Define implementation-time gate metric default
  * Details: .copilot-tracking/details/2026-07-25/client-bundle-mitigation-details.md (Lines 31-46)
* [x] Step 1.3: Validate phase changes
  * Run lint, test, and build for client package

### [x] Implementation Phase 2: Low-Risk Runtime Surface Reduction

<!-- parallelizable: false -->

* [x] Step 2.1: Remove unused toast runtime wiring when no active usage exists
  * Details: .copilot-tracking/details/2026-07-25/client-bundle-mitigation-details.md (Lines 56-74)
* [x] Step 2.2: Execute WI-05 icon adapter A/B experiment
  * Details: .copilot-tracking/details/2026-07-25/client-bundle-mitigation-details.md (Lines 76-94)
* [x] Step 2.3: Validate phase changes
  * Run lint, test, and build for client package

### [x] Implementation Phase 3: Conditional Optimization Escalation

<!-- parallelizable: false -->

* [x] Step 3.1: Narrow optional primitive runtime surface if gate remains unmet
  * Details: .copilot-tracking/details/2026-07-25/client-bundle-mitigation-details.md (Lines 102-116)
  * Executed as runtime-scope assessment: optional primitive wrappers were not imported in active runtime paths, so no additional source edits were required.
* [x] Step 3.2: Apply lazy-loading boundary for canvas stack if still needed
  * Details: .copilot-tracking/details/2026-07-25/client-bundle-mitigation-details.md (Lines 118-133)

### [x] Implementation Phase 4: Validation and Gate Reporting

<!-- parallelizable: false -->

* [x] Step 4.1: Run full client validation
  * Execute lint, tests, and build commands
* [x] Step 4.2: Compute raw and gzip-aware bundle deltas
  * Compare against baseline and threshold
* [x] Step 4.3: Report unresolved blockers and follow-on actions
  * Document remaining issues requiring additional planning
* [x] Step 4.4: Produce deferred-scope summary artifact
  * Write .copilot-tracking/changes/2026-07-25/client-bundle-mitigation-changes.md with completed work, measured deltas, deferred scope, rationale, and ownership for follow-on items

## Planning Log

See .copilot-tracking/plans/logs/2026-07-25/client-bundle-mitigation-log.md for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Node.js npm workspace tooling
* Vite and TypeScript build pipeline in apps/client
* Existing UI primitive and render stack structure

## Success Criteria

* WI-05 experiment is executed and produces reproducible build-delta evidence. Traces to: .copilot-tracking/plans/logs/2026-07-25/ux-design-tokens-and-accessible-primitives-log.md (Lines 61-63)
* Low-risk runtime surface reductions are implemented and validated before escalation to chunking changes. Traces to: .copilot-tracking/research/2026-07-25/client-bundle-mitigation-research.md (Lines 40-66)
* Bundle gate outcome is explicitly reported with metric used and remaining ambiguity tracked when applicable. Traces to: .copilot-tracking/research/2026-07-25/client-bundle-mitigation-research.md (Lines 70-72)
* Deferred scope is explicitly summarized in .copilot-tracking/changes/2026-07-25/client-bundle-mitigation-changes.md including rationale and next owner. Traces to: /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/prompts/hve-core/task-plan.prompt.md