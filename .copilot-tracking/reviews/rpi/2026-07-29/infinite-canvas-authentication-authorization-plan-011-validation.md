---
title: Infinite Canvas Authentication Authorization Phase 11 Validation
description: Evidence-based validation of implementation plan Phase 11
author: GitHub Copilot
ms.date: 2026-07-29
ms.topic: reference
---

## Validation Summary

* Status: Failed
* Phase: 11, Review Remediation for Operations and Rollout
* Scope: Plan, changes log, planning log, research requirements, current code, and focused executable checks
* Repository implementation coverage: 7 of 8 phase requirements verified; 1
	requirement is incorrectly wired at the runnable deletion boundary
* External operational evidence: Not available for deployed recovery resources,
	effective Azure role assignment, branch protection, or production benchmark
	approval

## Phase Requirements

Phase 11 corrects review findings IV-002, IV-008, IV-009, and IV-011. The
controlling specification is the Phase 11 detail at
`.copilot-tracking/details/2026-07-28/infinite-canvas-authentication-authorization-details.md:602-618`.

1. Enumerate deletion-pending principals whose 30-day recovery deadline is due
	in bounded batches.
2. Provide a runnable deletion entry point that reads explicit deletion-policy
	approval and preserves transactional ownership and retention checks.
3. Provision a manual, no-ingress recovery job and grant its workflow identity
	only the permissions needed to start and observe that job.
4. Resolve the recovery job from infrastructure deployment output in CD instead
	of accepting an independently configured job name.
5. Require a separately named authenticated multi-replica E2E CI check.
6. Require explicit production authorization benchmark approval at startup and
	in CD before protocol-v2 mutation can be enabled.
7. Keep production protocol-v2 mutation disabled by default.
8. Pass the two focused server test files, release-contract tests, lint, and
	build checks prescribed by the phase.

The primary research also requires ownership resolution before deletion
completion, approved audit and pseudonymous-attribution retention, authenticated
two-replica validation, production-like benchmark approval, and preservation of
all mutation rollout gates. Evidence: `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md:226-233`,
`.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md:284-300`, and
`.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md:333-347`.

## Plan-to-Change Comparison

### Step 11.1 Approval-Aware Deletion

Partially matched. Due-principal enumeration, bounded processing, transactional
ownership checks, result reporting, and runnable package commands exist. The CLI
passes the deletion-completion approval variable as the retention approval,
however, so it does not enforce the separately documented retention-policy gate.
See finding V11-001.

### Step 11.2 Restricted Recovery Infrastructure

Matched at repository level. The Bicep module, job-scoped custom role, role
assignment, main-module composition, deployment output, and CD output resolution
exist and compile. Actual staging deployment and effective RBAC were not
available for validation and remain explicitly listed as follow-on work in the
planning log.

### Step 11.3 Benchmark Approval and Multi-Replica CI

Matched at repository level. The named CI job runs the multi-replica command;
startup and CD include the production benchmark gate; CD hard codes mutation
false. Branch-protection enforcement and production approval values are external
and were not available for validation.

### Step 11.4 Operational and Rollout Validation

Partially matched. Both prescribed focused server test files, all release
contracts, lint, package builds, and Bicep compilation pass in this session.
Those checks do not exercise the CLI environment-variable mapping identified in
V11-001.

## Verified File Evidence

### Deletion Processing

* `apps/server/src/db/repository.ts:883-895` selects only due
	`deletion_pending` principals, orders deterministically, and applies the
	caller's batch limit.
* `apps/server/src/db/repository.ts:898-936` rechecks principal state, recovery
	deadline, owned patches, and retention approval inside the deletion
	transaction before removing mappings and personal profile fields.
* `apps/server/src/jobs/principalDeletion.ts:7-59` bounds batches to 1 through
	500, processes every selected principal, and reports completions, blocks, and
	isolated failures.
* `apps/server/src/jobs/principalDeletionCli.ts:4-25` reads the explicit
	`AUTH_DELETION_COMPLETION_POLICY_APPROVED` flag, returns a failing exit code
	for blocked or failed records, and closes the database bundle.
* `package.json:16` and `apps/server/package.json:14` expose runnable deletion
	commands.

### Restricted Recovery

* `infra/bicep/modules/recovery-job.bicep:20-66` declares a manual Container
	Apps job with one replica, zero retries, a 10-minute timeout, secret-backed
	database access, and the offline recovery CLI as its only command.
* `infra/bicep/modules/recovery-job.bicep:68-104` defines only job read, start,
	and execution-read actions, then assigns that role at the single recovery-job
	scope.
* `infra/bicep/main.bicep:76-92` composes the recovery module and exports the
	provisioned job name.
* `.github/workflows/cd.yml:78-100` resolves `RECOVERY_JOB_NAME` from the
	infrastructure deployment output; `.github/workflows/cd.yml:105-138` invokes
	the resolved job with operator, support-ticket, target, action, and reason
	arguments.

### Rollout Gates

* `.github/workflows/ci.yml:184-214` defines the separately named
	`Authenticated multi-replica E2E` job with PostgreSQL and runs
	`npm run test:e2e:multi-replica` after authenticated owner-only E2E.
* `apps/server/src/startup/rolloutGates.ts:23-34` requires production benchmark
	approval whenever protocol-v2 mutation is requested.
* `.github/workflows/cd.yml:268-274` imports the benchmark approval and hard
	codes production mutation false; `.github/workflows/cd.yml:347-360` requires
	the benchmark with the other mutation approvals if that flag is later
	enabled.
* `scripts/release-contract.test.mjs:36-72` enforces the disabled production
	flag, benchmark gate, named multi-replica CI job, infrastructure output, and
	job-scoped recovery role contract.

## Findings

### Critical V11-001 Deletion CLI Does Not Enforce Retention Approval

The runnable deletion boundary uses the deletion-completion policy approval as
the `retentionApproved` input. It never reads the distinct retention-policy
approval variable.

Evidence:

* `apps/server/src/jobs/principalDeletionCli.ts:9-13` sets
	`retentionApproved` from
	`AUTH_DELETION_COMPLETION_POLICY_APPROVED === 'true'`.
* `apps/server/src/db/repository.ts:899-923` names the input
	`retentionApproved` and allows completion when it is true after state,
	deadline, and ownership checks.
* `apps/server/README.md:58-61` defines
	`AUTH_RETENTION_POLICY_APPROVED` as privacy and legal approval for retained
	audit and pseudonymous attribution, while
	`AUTH_DELETION_COMPLETION_POLICY_APPROVED` covers deletion behavior when
	ownership remains blocked.
* `apps/server/src/startup/rolloutGates.ts:12-20` treats the two approvals as
	independent production gates, confirming they are not aliases.
* `apps/server/src/jobs/principalDeletion.test.ts:10-65` tests the job with a
	direct Boolean and does not test CLI environment mapping.

Impact: A standalone invocation can set deletion-completion approval true and
retention-policy approval false or absent, yet delete mappings and personal
profile data while retaining pseudonymous principal and audit records. This
violates the research requirement that retained attribution and audit have
privacy and legal approval and contradicts the changes-log claim of explicit
retention approval.

Required correction: Make the runnable boundary require
`AUTH_RETENTION_POLICY_APPROVED` for the existing `retentionApproved` input.
Keep `AUTH_DELETION_COMPLETION_POLICY_APPROVED` as a separate gate if approved
day-30 completion behavior also needs confirmation. Add a CLI-level test proving
that either missing required approval fails closed.

### Major Findings

None beyond the externally controlled evidence gaps recorded below.

### Minor Findings

None.

## Plan Deviations

* The changes log says Phase 11 adds due-account deletion with explicit retention
	approval, but the runnable CLI checks the deletion-completion approval instead.
	This is an implementation deviation, not only a naming difference, because
	startup and documentation define both variables independently.
* Step 11.2 is checked complete in the plan, while the changes log and planning
	log state that staging deployment and role-assignment execution remain
	externally controlled. Repository provisioning code is complete; operational
	provisioning is not evidenced.
* Step 11.3 is checked complete in the plan, while the planning log leaves the
	named CI check's branch-protection enforcement and production benchmark
	approval as external follow-on work. The workflow requirement is implemented,
	but release-governance enforcement is not evidenced.
* Production mutation remains disabled as required. No deviation was found in
	the default or CD assignment.

## Commands Run

### Passing Checks

* `npm exec --workspace=apps/server -- vitest run src/jobs/principalDeletion.test.ts src/startup/rolloutGates.test.ts`
	passed 2 files and 9 tests.
* `npm run test:release-contract` passed all 9 release-contract tests.
* `npm run lint` passed both client and server workspace lint checks.
* `cd /home/saitcho/zzyix && npm --prefix apps/server run build && npm --prefix apps/client run build`
	compiled the server and client successfully. Vite emitted the previously
	documented large-chunk warning.
* `az bicep build --file infra/bicep/main.bicep --stdout` completed successfully
	with only an available-version warning.
* VS Code diagnostics reported no errors in the Phase 11 TypeScript files or
	the recovery module. Its initial stale error resolving the main Bicep module
	was disproved by file existence and successful Bicep CLI compilation.

### Inconclusive or Corrected Invocations

* `npx --no-install markdownlint-cli2 ...` did not run because the package is
	not installed locally and dependency installation was outside validation
	scope.
* `npm run build` was interrupted with exit code 130 before diagnostics.
* Parallel root build aliases inherited a shared terminal workspace and did not
	provide attributable build evidence. The explicit sequential package build
	above replaced those attempts and passed.

### Read-Only Evidence Commands

* `git status --short`, `git diff --name-only`, and
	`git diff --cached --name-only` confirmed that no Phase 11 implementation file
	was modified during validation. Existing client authentication edits are
	unrelated user changes.
* Targeted searches and numbered source reads verified all changes-log claims
	listed in the file-evidence section.

## Coverage Assessment

Repository coverage is high but not acceptable for a pass. Seven of eight
extracted requirements are implemented and supported by executable checks. The
remaining requirement is security and compliance critical because the runnable
deletion command can use the wrong approval to authorize irreversible completion
side effects.

The focused checks cover deletion transaction behavior, bounded processing,
startup rollout gates, recovery infrastructure contracts, CI workflow presence,
lint, compilation, and Bicep syntax. They do not cover the deletion CLI's
environment mapping. That missing check allowed V11-001 to remain hidden despite
the prescribed suite passing.

Operational coverage remains incomplete. Repository evidence cannot prove that
the recovery job and custom role are deployed, that the role assignment is
effective, that the CI check is required by branch protection, or that production
benchmark owners approved representative thresholds. The supplied changes and
planning logs acknowledge these constraints and production mutation remains
disabled.

## Clarifying Questions

1. Must deletion completion require both
	`AUTH_RETENTION_POLICY_APPROVED` and
	`AUTH_DELETION_COMPLETION_POLICY_APPROVED`, or is the latter intended to
	subsume retention approval despite the current documentation and startup
	gate treating them independently?
2. Is there a staging deployment record or Azure resource snapshot that can
	prove the recovery job, custom role, and job-scoped assignment are effective?
3. Is `Authenticated multi-replica E2E` configured as a required branch check,
	and is there a successful protected-branch run to cite?
4. Is there an approved production-like authorization benchmark record with
	thresholds, accountable approver, date, and rollback criteria?

## Recommended Next Validations

* Correct V11-001 and add a CLI-level fail-closed approval-mapping test.
* Rerun the two Phase 11 focused server tests, release contracts, lint, and both
	package builds after the correction.
* Invoke the deletion command against an isolated PostgreSQL fixture with each
	approval combination and verify only the approved combination completes.
* Deploy or inspect staging Bicep outputs, then verify the recovery job has no
	ingress and the workflow principal can start only that job.
* Verify repository branch protection requires the named authenticated
	multi-replica check and capture a successful protected-branch run.
* Run the authorization benchmark on representative production infrastructure
	and capture approval plus rollback thresholds.
* Keep protocol-v2 mutation disabled until the critical finding and external
	operational evidence gaps are resolved.