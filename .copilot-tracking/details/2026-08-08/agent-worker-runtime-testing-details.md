<!-- markdownlint-disable-file -->
# Implementation Details: Agent Worker Runtime Testing

## Context Reference

Sources: .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md, user request in #prompt:task-plan.prompt.md, attached repository context.

## Implementation Phase 1: Agent Framework runtime contract tests

<!-- parallelizable: true -->

### Step 1.1: Add dedicated real-framework runtime assertions

Create a focused runtime test module that validates the installed Agent Framework integration contract independently from fake runtime fixtures.

Files:
* apps/agent-worker/tests/test_framework_runtime.py - New regression tests for real framework executor metadata, graph output cardinality, and lease-loss behavior.
* apps/agent-worker/tests/test_workflow.py - Keep fake runtime fixture tests limited to deterministic edge cases and ensure they do not replace runtime-contract checks.

Discrepancy references:
* Addresses DR-01 and DD-01 from .copilot-tracking/plans/logs/2026-08-08/agent-worker-runtime-testing-log.md.

Success criteria:
* Runtime tests execute GraphWorkflow through the installed Agent Framework path.
* Tests assert explicit dict input/output/workflow_output contract and terminal output cardinality.
* Lease-loss and structured-proposal gating behavior are asserted without gateway side effects.

Context references:
* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 156-190) - Requirements and recommended assertions for real-framework runtime coverage.
* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 79-88) - Boundary-substitution model and fake-framework limitation.

Dependencies:
* apps/agent-worker dependency pin remains at agent-framework==1.13.0.
* Existing _ToolsStub and _GatewayStub test fixtures remain available.

### Step 1.2: Align runtime-version messaging and output assumptions

Update workflow runtime failure messaging and terminal-output assumptions so diagnostics match the dependency pin and output extraction is resilient.

Files:
* apps/agent-worker/src/workflow.py - Align unavailable-runtime version messaging with supported dependency policy and guard get_outputs() terminal extraction assumptions.
* apps/agent-worker/tests/test_framework_runtime.py - Add coverage for no-terminal-output guard behavior.

Discrepancy references:
* Addresses DR-02 from .copilot-tracking/plans/logs/2026-08-08/agent-worker-runtime-testing-log.md.

Success criteria:
* Runtime-unavailable errors reflect the same supported version policy used by packaging.
* Workflow run path fails explicitly when no terminal output is yielded.

Context references:
* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 246-252) - Version alignment and output-cardinality implementation impact.
* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 259-260) - Version drift and output assumptions risk statement.

Dependencies:
* Step 1.1 completion.

### Step 1.3: Validate phase changes

Run lint and test commands scoped to worker workflow and runtime tests.

Validation commands:
* cd apps/agent-worker && .venv/bin/python -m pytest tests/test_workflow.py tests/test_framework_runtime.py -q - Worker runtime and workflow test scope.
* cd apps/agent-worker && .venv/bin/python -m pytest tests -q - Fast suite regression check.

## Implementation Phase 2: Local process-test prerequisites and static token constraints

<!-- parallelizable: true -->

### Step 2.1: Document local worker testing prerequisites and execution paths

Expand worker documentation for local runtime and persistence testing so developers can reliably seed, run, and verify results.

Files:
* apps/agent-worker/README.md - Add explicit prerequisites, DSN setup, migration expectations, trigger seeding, and expected evidence for success.
* docs/fantome-resident-agent-architecture.md - Add concise reference to runtime test layering and control-plane persistence validation.

Discrepancy references:
* Addresses DR-03 from .copilot-tracking/plans/logs/2026-08-08/agent-worker-runtime-testing-log.md.

Success criteria:
* Fast-suite and PostgreSQL integration execution paths are documented with required environment variables.
* Documentation distinguishes credential-free runtime tests from database-backed process tests.
* Evidence of success includes expected pass/skip profile and checkpoint-resume behavior.

Context references:
* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 62-76) - Three-layer test model and local pass/skip evidence.
* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 129-150) - Local configuration examples for test-only auth mode.
* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 209-225) - PostgreSQL process-test requirements and restart behavior.

Dependencies:
* Existing docs structure and worker README conventions.

### Step 2.2: Preserve and constrain static server-token mode to tests

Retain AGENT_USE_STATIC_SERVER_TOKEN only for test contexts and ensure naming and behavior remain clearly auth-scoped, not runtime-selection scoped.

Files:
* apps/agent-worker/src/main.py - Keep NODE_ENV=test guard and tighten comments and error text to indicate this flag is test auth only.
* apps/agent-worker/tests/test_main.py - Add or update coverage for rejected non-test usage.

Discrepancy references:
* Addresses DR-04 from .copilot-tracking/plans/logs/2026-08-08/agent-worker-runtime-testing-log.md.

Success criteria:
* Static token mode cannot be enabled outside NODE_ENV=test.
* Naming and documentation clarify auth purpose and avoid runtime-branch implications.

Context references:
* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 25-27) - Current guard behavior in main runtime entrypoint.
* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 40-43) - Removed runtime-selector variable and retained auth-scoped naming.
* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 249-250) - Recommendation to keep guard test-only.

Dependencies:
* Step 2.1 documentation updates.

### Step 2.3: Validate phase changes

Run worker tests that cover runtime auth configuration and main entrypoint behavior.

Validation commands:
* cd apps/agent-worker && .venv/bin/python -m pytest tests/test_main.py -q - Entry-point auth guard validation.
* cd apps/agent-worker && .venv/bin/python -m pytest tests -q - Aggregate regression check after docs and main changes.

## Implementation Phase 3: CI coverage for worker test layers

<!-- parallelizable: false -->

### Step 3.1: Add worker fast-suite CI job

Add a CI job that installs and executes worker Python tests against the same packaged dependency path used in deployment.

Files:
* .github/workflows/ci.yml - Add a Python worker test job for apps/agent-worker fast suite.

Discrepancy references:
* Addresses DR-05 from .copilot-tracking/plans/logs/2026-08-08/agent-worker-runtime-testing-log.md.

Success criteria:
* CI installs worker dependencies from apps/agent-worker and runs pytest fast suite.
* CI fails on runtime-contract regressions in worker tests.

Context references:
* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 33-36) - Current CI gap and worker packaging context.
* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 246-248) - Recommended worker CI additions.

Dependencies:
* Phase 1 runtime tests available.

### Step 3.2: Add PostgreSQL worker integration CI job with migration and role prep

Add an integration CI lane that provisions PostgreSQL prerequisites and runs checkpoint-restart process tests.

Files:
* .github/workflows/ci.yml - Add dedicated PostgreSQL worker integration job.
* scripts/verify-quilt-migration.sh - Reuse or extend migration invocation for worker schema readiness.
* apps/agent-worker/tests/test_control_plane_postgres.py - Confirm markers and DSN conventions align with CI configuration.

Discrepancy references:
* Addresses DR-06 from .copilot-tracking/plans/logs/2026-08-08/agent-worker-runtime-testing-log.md.

Success criteria:
* CI job applies migrations, configures AGENT_WORKER_POSTGRES_TEST_DSN, and executes worker process integration tests.
* Restart recovery assertions run in CI and produce non-skipped evidence.

Context references:
* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 217-225) - PostgreSQL integration recommendation and current CI mismatch.
* .copilot-tracking/research/2026-08-08/agent-worker-runtime-testing-research.md (Lines 256-258) - Remaining migration and transactional-state risks.

Dependencies:
* Step 3.1 CI Python environment setup.
* Database migration command identified and validated.

### Step 3.3: Validate phase changes

Run workflow-level CI checks locally where possible and verify YAML validity.

Validation commands:
* npm run lint --workspace server - CI-adjacent baseline check where migration scripts interact with server tooling.
* npx playwright --version - Confirm CI runner dependency assumptions remain consistent in workflow environment.

## Implementation Phase 4: Final validation and release readiness

<!-- parallelizable: false -->

### Step 4.1: Run full project validation

Execute all relevant validation commands after all implementation phases complete.

Validation commands:
* cd apps/agent-worker && .venv/bin/python -m pytest tests -q
* npm run lint
* npm test

### Step 4.2: Fix minor validation issues

Resolve linting, test, and workflow issues that are isolated and low-risk.

### Step 4.3: Report blocking issues

Document unresolved blockers and recommend additional planning if corrections require large refactors, extensive schema changes, or new architecture decisions.

## Dependencies

* Python 3.11 and apps/agent-worker virtual environment.
* PostgreSQL test database with worker role and migrations applied.
* GitHub Actions workflow permissions for new worker jobs.

## Success Criteria

* Worker runtime contract coverage validates installed Agent Framework behavior directly.
* Local and CI worker test execution paths are documented and reproducible.
* Test-only static token mode remains clearly constrained and non-production.
* CI provides explicit pass/fail evidence for worker fast suite and PostgreSQL restart integration tests.
