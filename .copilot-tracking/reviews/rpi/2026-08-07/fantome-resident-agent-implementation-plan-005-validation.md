---
title: Fantome Resident Agent Implementation Phase 5 Validation
description: Evidence-based validation of Phase 5 against the implementation plan, changes log, research, planning log, and current workspace.
ms.date: 2026-08-07
ms.topic: validation
---

## Scope And Method

**Status: Partial**

This report revalidates only Implementation Phase 5, End-to-End Validation and Activation, using current workspace files. The implementation plan, changes log, research, planning log, implementation details, worker and server tests, and e2e harness were read before comparison. No source, plan, changes, or research files were modified.

## Phase 5 Comparison

| Plan item | Current evidence | Result |
|------------|------------------|--------|
| 5.1 Multi-replica and recovery tests | In-memory supervisor tests cover disabled model-free processing, stale-trigger reclaim, checkpoint resume, lease-loss requeue, and active-lease exclusion ([test_supervisor.py](../../../../../apps/agent-worker/tests/test_supervisor.py#L137)). PostgreSQL tests cover lease takeover/renewal, trigger deduplication and queue bounds, checkpoint CAS, and worker-role canonical-write denial ([agentControlPlane.postgres.integration.test.ts](../../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L61)). | Partial: no two-process worker fixture, real worker restart, or app-role fixture exists. |
| 5.1 Authorized app-only reads | App-role verifier and pre-provisioned principal tests exist ([tokenVerifier.test.ts](../../../../../apps/server/src/auth/tokenVerifier.test.ts#L125); [principalContext.postgres.integration.test.ts](../../../../../apps/server/src/auth/principalContext.postgres.integration.test.ts#L130)). The production router is startup-registered and uses the app verifier and agent resolver ([index.ts](../../../../../apps/server/src/index.ts#L859), [index.ts](../../../../../apps/server/src/index.ts#L972)). | Partial: no live request sends an app-role token through the registered route. |
| 5.1 Model-free/read-only gates | The supervisor checks `model_free_enabled` before claiming a trigger, and the test asserts the trigger remains pending ([supervisor.py](../../../../../apps/agent-worker/src/supervisor.py#L50); [test_supervisor.py](../../../../../apps/agent-worker/tests/test_supervisor.py#L137)). Worker tools and the server worker router expose reads only. | Implemented at unit level; not exercised in a real worker process. |
| 5.2 Full validation | Focused server auth and route tests passed: 2 files and 24 tests. Server build passed. The required Python command cannot run because `python` is absent and `python3` has no pytest. Docker cannot connect to the local daemon. The unconfigured Playwright command reports no tests because the default config ignores the reconnect spec; the configured multi-replica command is the existing reconnect test only. | Partial. |
| 5.3 Fix isolated validation issues | Current source includes startup route registration, durable-DSN enforcement, framework adapter use, recovery callbacks, stale-claim reclaim, and effective model-free gating. | Changes are present; no new Phase 5 end-to-end evidence proves them together. |
| 5.4 Report blockers | Changes and planning logs retain the missing restart fixture, Python tooling, and deployment-specific prerequisites ([changes log](../../../../../.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L9); [planning log](../../../../../.copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md#L104)). | Implemented. |

## Findings

### Critical

#### V5-01: Real worker restart and checkpoint recovery remain unverified

The plan requires a restarted worker to resume the latest committed checkpoint. The current recovery tests use `InMemoryControlPlane` and call `process_once` in the same test process ([test_supervisor.py](../../../../../apps/agent-worker/tests/test_supervisor.py#L188)). They prove an in-memory supervisor can load a saved checkpoint and reuse a run ID, but they do not kill and restart a worker process, persist through PostgreSQL, or resume the production Agent Framework path. The changes log and planning log still identify a real worker restart fixture as outstanding ([changes log](../../../../../.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L76); [planning log](../../../../../.copilot-tracking/plans/logs/2026-08-07/fantome-resident-agent-implementation-log.md#L113)).

### Major

#### V5-02: PostgreSQL lease and reclaim behavior is not tested through two workers

The PostgreSQL integration test directly issues SQL for one active lease, expired takeover, owner/run-bound renewal, trigger deduplication, queue bounds, and checkpoint CAS ([agentControlPlane.postgres.integration.test.ts](../../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L61)). The worker adapter separately contains `FOR UPDATE SKIP LOCKED`, stale-claim selection, lease acquisition, and run resume SQL ([control_plane.py](../../../../../apps/agent-worker/src/control_plane.py#L262)). No test instantiates two `PostgresControlPlane` workers or two worker processes and races claim/reclaim against the same quilt.

#### V5-03: App-role authentication is not covered through the live worker route

The isolated verifier tests correctly require `roles: ['agent.runtime']` ([tokenVerifier.test.ts](../../../../../apps/server/src/auth/tokenVerifier.test.ts#L125)). The router tests install a mocked principal directly on each request ([agentReads.test.ts](../../../../../apps/server/src/routes/agentReads.test.ts#L15)) and bypass the app verifier and principal mapping. The e2e issuer emits only an `scp` claim ([testOidcIssuer.ts](../../../../../e2e/support/testOidcIssuer.ts#L84)), while the multi-replica configuration starts two server replicas and no worker process ([playwright.multi-replica.config.ts](../../../../../playwright.multi-replica.config.ts#L4)). App-role route authorization remains unverified end to end.

#### V5-04: Prescribed validation coverage is incomplete or command-sensitive

`python -m pytest apps/agent-worker/tests` fails because `python` is absent, and `python3 -m pytest apps/agent-worker/tests` fails because pytest is not installed. Docker validation fails because the local Docker daemon is unavailable. The exact unconfigured Playwright command reports no tests because [playwright.config.ts](../../../../../playwright.config.ts#L9) ignores the reconnect spec; the configured command still exercises only the existing user reconnect flow. The focused server auth/router command passed, and the server build passed, but a clean full `npm run test` result was not obtained because the command was interrupted with exit code 130.

### Minor

#### V5-05: Phase completion markers do not express activation evidence

The plan leaves Steps 5.1 and 5.2 unchecked while marking Steps 5.3 and 5.4 complete ([implementation plan](../../../../../.copilot-tracking/plans/2026-08-07/fantome-resident-agent-implementation-plan.instructions.md#L77)). The release changes summary describes Phase 5 as partial while listing simulated recovery and control-plane checks as completed ([changes log](../../../../../.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L9), [changes log](../../../../../.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L76)). The tracking artifacts should distinguish lower-level checks from complete activation evidence.

## Requirements Met

* Model-free gating now prevents trigger claim when disabled.
* In-memory tests cover checkpoint resume, stale-trigger reclaim, lease-loss stop/requeue, and one-active-lease exclusion.
* PostgreSQL tests cover direct database lease constraints, trigger deduplication, queue bounds, checkpoint CAS, and restricted-role canonical-write denial.
* App-role token verification and active pre-provisioned agent mapping are covered in focused server tests.
* Worker HTTP routes are startup-registered, assignment-scoped, bounded, and read-only.
* Known environment and deployment blockers are recorded in the changes and planning logs.

## Unmet Requirements

* Real worker process restart and production checkpoint recovery.
* Two-worker PostgreSQL lease/reclaim race and recovery evidence.
* App-role token issuance and live route authorization through the e2e harness.
* A runnable `python -m pytest apps/agent-worker/tests` environment.
* Full validation evidence captured from one clean command set.

## Coverage Assessment

| Requirement area | Coverage | Assessment |
|------------------|----------|------------|
| Model-free gate | Focused unit test | Implemented, not process-level |
| Lease exclusion and expiry | Direct PostgreSQL SQL plus in-memory test | Partial for worker adapter |
| Trigger deduplication and queue bound | PostgreSQL integration test | Covered at schema level |
| Checkpoint CAS and simulated resume | PostgreSQL CAS plus in-memory supervisor test | Partial |
| Lease-loss stop | In-memory workflow/supervisor tests | Partial |
| App-role verification | Focused verifier and principal tests | Partial without live route |
| Multi-replica worker recovery | No worker fixture | Missing |
| Full prescribed validation | Python, Docker, and clean full test gaps | Partial |
| Blocker reporting | Changes and planning logs | Complete |

Overall status is **Partial**. The implementation has meaningful lower-level coverage and the stale report's model-free-gate finding is no longer valid, but decisive Phase 5 activation evidence for real worker recovery, two-worker PostgreSQL behavior, and app-role route coverage is still absent.

## Clarifying Questions

* Should the worker e2e fixture use the local OIDC issuer with a `roles` claim, or a separate test token issuer that models Entra app-only tokens?
* Should the two-worker test assert same-run resume after reclaim, or permit a new run linked to the prior checkpoint?
* Should the plan retain separate markers for lower-level implementation checks and completion of activation validation?

## Recommended Next Validations

* Add a PostgreSQL-backed fixture that starts two worker processes, races claims for one quilt, expires or kills the first lease holder, and verifies reclaim and same-run checkpoint resume.
* Add app-role token issuance to the e2e OIDC fixture and issue a request through the startup-registered `/internal/v1/agent` route.
* Install the declared worker test dependency and run `python -m pytest apps/agent-worker/tests`.
* Run the complete validation set in a clean environment with Docker and PostgreSQL available, retaining exit codes and summaries.
