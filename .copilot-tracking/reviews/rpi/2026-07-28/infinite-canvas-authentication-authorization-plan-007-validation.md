---
title: Infinite Canvas Authentication and Authorization Phase 7 Validation
description: Current validation of deployment, authenticated E2E, and rollout implementation Phase 7
ms.date: 2026-07-29
ms.topic: reference
---

## Validation Scope

Status: Partial

This review validates Implementation Phase 7 against the current repository at
commit `4bcefa706891759dbbbabd8bbfcacf115cbf1ee0` on branch
`infinite-canvas`, the implementation plan and planning log, the changes log,
the primary research, and executable checks run on 2026-07-29.

The worktree contained pre-existing modifications to Phase 2 through Phase 6
validation artifacts and the plan review. Those files were not used as proof of
Phase 7 completion and were not modified by this validation.

Severity counts:

* Critical: 0
* Major: 3
* Minor: 0

## Phase Requirements

Phase 7 contains three required steps:

1. Replace direct identity injection with a double-gated local OIDC issuer,
   signed short-lived tokens, authenticated single-replica and multi-replica
   fixtures, the specified browser scenarios, and CI execution.
2. Configure production identity, redacted correlation telemetry, migration and
   startup checks, and fail-closed operational and mutation approvals.
3. Separate owner-only release acceptance from deferred delegated and moderator
   behavior, and enable mutation only after owner-only E2E, migration,
   telemetry, retention, and rollback gates pass.

The primary research also requires unknown keys, expired tokens, inactive
principals, and incompatible schema to fail closed. Production artifacts must
contain no local issuer key or direct internal-principal bypass.

## Plan Item Comparison

| Phase 7 item | Changes log claim | Current evidence | Status |
|--------------|-------------------|------------------|--------|
| Step 7.1 local OIDC and authenticated E2E | Local issuer, browser authentication, owner-only and two-replica mutation validation are complete | The issuer and fixtures exist, no `testPrincipalId` remains in source or E2E, six owner-only browser tests and one two-replica test pass. Required CI and scenario coverage is incomplete. | Partial |
| Step 7.2 production identity, telemetry, and fail-closed gates | Production identity, redaction, rollout approvals, migration failure, and production test-setting rejection are implemented | CD injects and validates identity configuration, startup enforces operational and mutation approvals, telemetry redacts sensitive fields, migration precedes deployment, and focused tests pass. | Complete |
| Step 7.3 owner-only gate split | Owner-only release criteria are separated from delegated and moderator work, and production mutation remains disabled | Named owner-only and delegated scripts are separate, delegated execution fails intentionally, CD pins mutation off, and runtime requires mutation approvals. CI does not run the two-replica gate and the browser gate lacks mixed cross-patch denial. | Partial |

Coverage is one of three steps complete and two partially complete. The
implemented runtime and deployment controls preserve a fail-closed production
posture, but the repository does not yet enforce or demonstrate every required
Phase 7 release scenario.

## Verified File Evidence

### Local issuer and authenticated fixtures

* `e2e/support/testOidcIssuer.ts:24-36` rejects issuer creation unless
  `NODE_ENV=test` and `E2E_TEST_MODE=true`.
* `e2e/support/testOidcIssuer.ts:61-157` publishes discovery and JWKS endpoints,
  signs short-lived RS256 tokens, and supports overlapping key rotation.
* `apps/server/src/auth/config.ts:57-66` separately requires
  `AUTH_TEST_ISSUER=true` under both test gates and rejects test issuer settings
  in production.
* `playwright.config.ts:27-65` starts the issuer, server, and client with the
  required test-only settings. `playwright.multi-replica.config.ts:3-50` starts
  the issuer and two independently identified replicas against a disposable
  database.
* Repository search found no `testPrincipalId` in application source, E2E, or
  Playwright configuration. Tokens carry external subjects and are resolved by
  the normal verifier and principal mapping path.
* `e2e/authentication.spec.ts:4-65` covers bootstrap, logout, fresh login,
  successful signed-token renewal after expiry, and unauthenticated content
  hiding.
* `e2e/quilt-reconnect.spec.ts:72-224` covers denied non-owner mutation, owner
  placement and removal, stale revision rejection, scoped fanout, durable
  replay, and reconnect through the other replica with a newly issued token.

### Production rollout and telemetry

* `.github/workflows/cd.yml:228-243` loads all public and trusted identity
  settings plus telemetry, rollback, retention, and deletion policy approvals.
* `.github/workflows/cd.yml:265-325` fails release configuration validation when
  identity values or operational approvals are absent and validates the
  same-origin client API contract.
* `.github/workflows/cd.yml:328-465` runs the release-owned migration job before
  application deployment, refuses an active migration execution, verifies
  single-owner job settings, and fails on unsuccessful or timed-out migration.
* `.github/workflows/cd.yml:535-553` and line 706 inject production server
  identity and approvals while explicitly setting
  `FEATURE_PROTOCOL_V2_MUTATION_ENABLED=false`. No CD path sets it to `true`.
* `apps/server/src/startup/rolloutGates.ts:5-36` rejects production test-auth
  flags, requires all four operational approvals, and requires three additional
  mutation approvals when mutation is requested.
* `apps/server/src/index.ts:3092-3138` validates rollout gates and authentication
  before database startup, then verifies connectivity and prepares the schema
  before listening.
* `apps/server/src/logging/redact.ts:1-18` recursively redacts authorization,
  token, external-subject, and email fields. Safe request, operation, replica,
  policy-version, and outcome fields are preserved by
  `apps/server/src/logging/redact.test.ts:19-34`.

### Gate separation and current git state

* `package.json:37-39` defines separate owner-only, two-replica, and delegated
  scripts. The delegated script exits unsuccessfully with an explicit deferral
  message.
* `.github/workflows/ci.yml:142-174` runs only
  `npm run test:e2e:owner-only`; it contains no invocation of
  `test:e2e:multi-replica`.
* `apps/server/src/index.ts:222-224` permits protocol-v2 mutation only in test
  mode with both E2E and mutation flags. Production CD pins the mutation flag
  to false.
* The planning log retains delegated mutation and moderator commands as WI-01
  and retains staging migration, recovery provisioning, representative
  benchmark, telemetry, and rollback approvals as blocking follow-on work.

## Executable Validation

The following checks passed against the current repository:

* Focused Phase 7 server tests: 4 files and 21 tests passed for the local OIDC
  issuer, token verifier, telemetry redaction, and rollout gates.
* `npm run test:release-contract`: 6 tests passed for release queuing,
  operational approvals, production mutation disablement, migration-job
  settings, runtime JSON, same-origin routing, and migration cleanup.
* `npm run test:e2e:owner-only`: 6 authenticated Playwright tests passed.
* `npm run test:e2e:multi-replica`: 1 authenticated two-replica convergence test
  passed.

An initial focused command that also included `src/db/migrate.test.ts` was
interrupted and is not counted as passing evidence. The release-contract suite
and browser-managed database startup passed, but the focused migration rollback
test was not rerun during this validation.

## Findings

### Critical

No Critical findings. Production mutation remains disabled in CD, and runtime
startup fails closed when production operational or requested mutation
approvals are absent. The missing evidence below therefore does not expose an
enabled production mutation path.

### Major

#### V-007-01 Authenticated multi-replica acceptance is not enforced by CI

Step 7.1 explicitly requires authenticated E2E in CI, and Step 7.3 treats
two-replica convergence as an owner-only release criterion. The named command
exists and passed locally, but `.github/workflows/ci.yml:142-174` runs only the
single-replica owner-only command. A regression in cross-replica authorization,
fanout, durable replay, or reconnect can therefore merge without executing the
required release gate.

Required action: add a PostgreSQL-backed CI job that runs
`npm run test:e2e:multi-replica` after build and make its success a required
owner-only release check.

#### V-007-02 Failed renewal and interaction-required clearing lack browser evidence

The Phase 7 checklist requires interaction-required clearing, and the research
requires all protected content and drafts to be removed when renewal cannot
continue. `e2e/authentication.spec.ts:18-57` proves successful renewal after
expiry, while its signed-out test clears browser storage directly. It does not
force token acquisition to fail after expiry or assert that the mounted
catalog, quilt state, socket rooms, optimistic state, and drafts are destroyed.
Lower-level client tests cover auth-loss callbacks, but they do not satisfy the
required browser lifecycle evidence.

Required action: add a Playwright scenario that allows an active token to
expire, makes renewal return an interaction-required failure, and verifies the
protected application subtree and transport state are cleared before sign-in
is rendered.

#### V-007-03 The owner-only E2E gate omits required lifecycle and mixed-authority cases

Step 7.1 requires browser evidence for claims, ownership changes, member denial,
and mixed-patch denial. Step 7.3 explicitly includes mixed cross-patch authority
in initial-release acceptance. Current browser tests prove non-owner denial and
owner mutation on a single patch, but repository search found no E2E claim,
accepted transfer, abandonment, or mixed cross-patch mutation scenario.
Database integration tests cover ownership lifecycle, but the release gate does
not prove that authenticated HTTP and Socket.IO boundaries compose those
operations correctly.

Required action: extend the owner-only browser gate with atomic claim,
recipient-accepted transfer, abandonment, and a footprint crossing owned and
non-owned patches that proves denial with no partial persistence or fanout.

### Minor

No Minor findings.

## Coverage Assessment

Phase 7 is substantially implemented but not fully validated. Step 7.2 is
complete and has current executable evidence. Steps 7.1 and 7.3 are partial
because required browser scenarios and CI enforcement are absent.

The validation status is Partial. The changes log overstates Phase 7 completion
when it says all eight phases are complete: the core behavior works in the
focused checks, but the plan defines specific release-gate coverage and CI
execution that the current repository does not provide.

## Recommended Next Validations

* Add and run the authenticated multi-replica CI job on a pull request.
* Add and run interaction-required expiry clearing in Playwright.
* Add and run claim, accepted transfer, abandonment, and mixed-patch denial in
  the owner-only browser gate.
* Rerun `apps/server/src/db/migrate.test.ts` in isolation to confirm failed
  migrations leave no partial schema.
* Validate WI-08 migration-job reconciliation against staging Azure resources.
* Validate WI-10 restricted recovery job provisioning and Azure RBAC.
* Validate representative production authorization budgets and approve WI-11.
* Supply telemetry, rollback, retention, and deletion policy approvals and
  verify production startup behavior in staging.

## Clarifying Questions

No clarification is required to grade the current repository. External staging
execution, GitHub required-check configuration, Azure RBAC, and organizational
approvals are not present in repository evidence and remain necessary before a
future production rollout validation can pass.
