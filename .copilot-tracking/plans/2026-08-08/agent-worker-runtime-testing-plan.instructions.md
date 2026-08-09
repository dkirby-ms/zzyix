---
applyTo: '.copilot-tracking/changes/2026-08-08/agent-worker-runtime-testing-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Agent Worker Runtime Testing

## Overview

Implement layered runtime testing and CI coverage for the Python agent worker so the installed Agent Framework path is verified directly while preserving deterministic local test execution.

## Objectives

### User Requirements

* Verify that workflow tests execute the installed Agent Framework library rather than an internal workflow stub. — Source: .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 8-8)
* Document local worker test prerequisites, execution paths, and evidence of successful processing. — Source: .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 9-9)
* Evaluate whether test-only static server token mode should remain and how it should be named and constrained. — Source: .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 10-10)
* Identify remaining risks, gaps, and recommended follow-up implementation work. — Source: .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 11-11)

### Derived Objectives

* Add dedicated real-framework regression assertions that validate executor contracts, output cardinality, and lease-loss behavior. — Derived from: Research-selected approach for preventing runtime drift without test-runtime forks.
* Extend CI to run worker fast tests and PostgreSQL restart integration tests as explicit lanes. — Derived from: Current CI gap identified in research and high-impact risk categorization.
* Keep static token authentication strictly test-only and clearly auth-scoped in naming and docs. — Derived from: Runtime-selection confusion risk and current NODE_ENV guard design.

## Context Summary

### Project Files

* apps/agent-worker/src/workflow.py - Runtime graph construction and terminal output handling.
* apps/agent-worker/src/main.py - Static token authentication guard and worker startup policy.
* apps/agent-worker/tests/test_workflow.py - Existing workflow/unit behavior checks with deterministic fixtures.
* apps/agent-worker/tests/test_control_plane_postgres.py - Restart and checkpoint persistence integration tests.
* .github/workflows/ci.yml - CI matrix currently missing worker Python test lanes.
* apps/agent-worker/README.md - Primary local test and runtime setup guide.

### References

* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md - Primary research artifact and implementation basis.
* .copilot-tracking/research/subagents/2026-08-08/worker-runtime-research.md - Source evidence for runtime-path behavior.
* .copilot-tracking/research/subagents/2026-08-08/agent-framework-integration-research.md - Source evidence for Agent Framework API and constraints.

### Standards References

* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/prompts/hve-core/task-plan.prompt.md - Task planning prompt requirements used for this planning cycle.
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/coding-standards/python-script.instructions.md - Python implementation conventions for worker/runtime changes.
* /home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/coding-standards/python-tests.instructions.md - Python testing conventions for worker suite updates.

## Implementation Checklist

### [ ] Implementation Phase 1: Agent Framework runtime contract tests

<!-- parallelizable: true -->

* [ ] Step 1.1: Add dedicated real-framework runtime assertions
  * Details: .copilot-tracking/details/2026-08-08/agent-worker-runtime-testing-details.md (Lines 12-35)
* [ ] Step 1.2: Align runtime-version messaging and output assumptions
  * Details: .copilot-tracking/details/2026-08-08/agent-worker-runtime-testing-details.md (Lines 36-56)
* [ ] Step 1.3: Validate phase changes
  * Details: .copilot-tracking/details/2026-08-08/agent-worker-runtime-testing-details.md (Lines 58-64)

### [ ] Implementation Phase 2: Local process-test prerequisites and static token constraints

<!-- parallelizable: true -->

* [ ] Step 2.1: Document local worker testing prerequisites and execution paths
  * Details: .copilot-tracking/details/2026-08-08/agent-worker-runtime-testing-details.md (Lines 70-93)
* [ ] Step 2.2: Preserve and constrain static server-token mode to tests
  * Details: .copilot-tracking/details/2026-08-08/agent-worker-runtime-testing-details.md (Lines 94-115)
* [ ] Step 2.3: Validate phase changes
  * Details: .copilot-tracking/details/2026-08-08/agent-worker-runtime-testing-details.md (Lines 117-123)

### [ ] Implementation Phase 3: CI coverage for worker test layers

<!-- parallelizable: false -->

* [ ] Step 3.1: Add worker fast-suite CI job
  * Details: .copilot-tracking/details/2026-08-08/agent-worker-runtime-testing-details.md (Lines 129-148)
* [ ] Step 3.2: Add PostgreSQL worker integration CI job with migration and role prep
  * Details: .copilot-tracking/details/2026-08-08/agent-worker-runtime-testing-details.md (Lines 150-172)
* [ ] Step 3.3: Validate phase changes
  * Details: .copilot-tracking/details/2026-08-08/agent-worker-runtime-testing-details.md (Lines 174-180)

### [ ] Implementation Phase 4: Validation

<!-- parallelizable: false -->

* [ ] Step 4.1: Run full project validation
  * Execute all lint commands (`npm run lint`, language linters)
  * Execute build scripts for all modified components
  * Run test suites covering modified code
  * Details: .copilot-tracking/details/2026-08-08/agent-worker-runtime-testing-details.md (Lines 186-193)
* [ ] Step 4.2: Fix minor validation issues
  * Iterate on lint errors and build warnings
  * Apply fixes directly when corrections are straightforward
  * Details: .copilot-tracking/details/2026-08-08/agent-worker-runtime-testing-details.md (Lines 195-197)
* [ ] Step 4.3: Report blocking issues
  * Document issues requiring additional research
  * Provide user with next steps and recommended planning
  * Avoid large-scale fixes within this phase
  * Details: .copilot-tracking/details/2026-08-08/agent-worker-runtime-testing-details.md (Lines 199-201)

## Planning Log

See .copilot-tracking/plans/logs/2026-08-08/agent-worker-runtime-testing-log.md for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Python 3.11 virtual environment for apps/agent-worker.
* Migrated PostgreSQL database with worker role and permissions for integration tests.
* GitHub Actions workflow editing and repository secret configuration for worker CI jobs.

## Success Criteria

* Installed Agent Framework runtime behavior is validated directly by worker tests with deterministic boundaries. — Traces to: .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 156-190)
* Local and CI execution paths for fast and PostgreSQL worker test layers are documented and reproducible. — Traces to: .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 62-76)
* Static server-token mode remains constrained to NODE_ENV=test and clearly labeled as auth-only behavior. — Traces to: .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 25-27)
* CI provides non-skipped evidence for worker runtime and persistence/restart checks. — Traces to: .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 217-225)
