---
title: Fantome Resident Agent Implementation Phase 5 Validation
description: Evidence-based validation of End-to-End Validation and Activation against the implementation plan, research, changes log, tests, and repository configuration.
ms.date: 2026-08-08
ms.topic: validation
---

## Scope And Method

**Status: Partial**

This validation covers only Implementation Phase 5, End-to-End Validation and Activation. It compares the Phase 5 plan and success criteria with the primary research, planning log, implementation details, changes log, prior Phase 5 validation, all new worker tests, server agent integration tests, e2e support, and repository test configuration. No product source, plan, research, or changes-log files were modified.

The evidence is classified as follows:

* **Executed:** The changes log records a passing command or the test is part of a passing focused server run.
* **Present but not executed:** The test exists, but its required runtime or external dependency was unavailable.
* **Focused only:** The test proves a lower-level contract without proving the required process-level or end-to-end behavior.
* **Missing:** No fixture or test implements the requested evidence.

## Phase 5 Requirements Compared With Evidence

| Requirement | Verified evidence | Assessment |
|---|---|---|
| App-role route coverage | The server integration seeds an active agent principal and assignment, issues a JWT with the local issuer, and calls the startup-registered route ([index.integration.test.ts](../../../../../apps/server/src/index.integration.test.ts#L297)). The dedicated route-auth test rejects delegated tokens and accepts an app-role token ([agentReads.auth.test.ts](../../../../../apps/server/src/routes/agentReads.auth.test.ts#L83)). | **Covered at focused integration level.** This resolves the prior report's missing live route finding. It is not part of the Playwright multi-replica scenario. |
| Two-worker lease exclusion | In-memory supervisor coverage rejects a second lease ([test_supervisor.py](../../../../../apps/agent-worker/tests/test_supervisor.py#L345)). The new PostgreSQL worker test concurrently calls `claim_next_trigger` from two `PostgresControlPlane` instances and asserts one claim, then checks the active lease blocks a second run ([test_control_plane_postgres.py](../../../../../apps/agent-worker/tests/test_control_plane_postgres.py#L80)). | **Present but PostgreSQL worker test was not executed.** The test uses two adapter instances and threads, not two worker processes. |
| Stale reclaim | In-memory recovery tests set an expired claim and resume the original run ([test_supervisor.py](../../../../../apps/agent-worker/tests/test_supervisor.py#L205)). The PostgreSQL test explicitly expires the trigger claim and lease, then reclaims it ([test_control_plane_postgres.py](../../../../../apps/agent-worker/tests/test_control_plane_postgres.py#L112)). | **Covered in-memory; PostgreSQL adapter coverage is skip-gated.** |
| Lease-loss ordering | The supervisor test asserts lease loss before work causes zero workflow work and requeues the trigger ([test_supervisor.py](../../../../../apps/agent-worker/tests/test_supervisor.py#L301)). A second test persists a checkpoint, returns lease loss, and asserts the next worker receives that checkpoint ([test_supervisor.py](../../../../../apps/agent-worker/tests/test_supervisor.py#L262)). The production supervisor stops renewal in `finally` and releases only the matching lease generation ([supervisor.py](../../../../../apps/agent-worker/src/supervisor.py#L146)). | **Focused unit coverage.** No executed process-level test proves that a real lease loss stops tool and gateway work. |
| Checkpoint resume | Serialization round-trip coverage exists ([test_checkpoints.py](../../../../../apps/agent-worker/tests/test_checkpoints.py#L54)); in-memory supervisor coverage resumes the original run and advances the version ([test_supervisor.py](../../../../../apps/agent-worker/tests/test_supervisor.py#L231)). PostgreSQL adapter coverage loads the same run and checkpoint after reclaim ([test_control_plane_postgres.py](../../../../../apps/agent-worker/tests/test_control_plane_postgres.py#L126)). | **Covered at unit level; PostgreSQL evidence is not executed; real restart is missing.** |
| PostgreSQL contention and recovery | Server-side PostgreSQL tests cover one-active-lease constraints, owner/run-bound renewal, trigger deduplication and queue bounds, checkpoint CAS, and restricted-role canonical-write denial ([agentControlPlane.postgres.integration.test.ts](../../../../../apps/server/src/db/agentControlPlane.postgres.integration.test.ts#L61)). The worker-specific test is gated by `AGENT_WORKER_POSTGRES_TEST_DSN` and skips without a migrated database ([test_control_plane_postgres.py](../../../../../apps/agent-worker/tests/test_control_plane_postgres.py#L20)). | **Server database suite executed per changes log. Worker PostgreSQL contention/recovery test was not executed.** |
| Real process restart evidence | The plan requires a restarted worker to resume the latest checkpoint ([implementation-details.md](../../../../../.copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md#L310)). The available test named restart uses the same in-memory control plane and calls `process_once` directly ([test_supervisor.py](../../../../../apps/agent-worker/tests/test_supervisor.py#L231)). | **Missing.** No worker process is started, terminated, restarted, or connected to PostgreSQL in an e2e fixture. |
| Full validation commands | The changes log records passing server tests, server build, Docker build, worker `compileall`, and configured reconnect Playwright runs ([changes log](../../../../../.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L107)). It records worker pytest blocked by missing host pytest/venv tooling and the worker PostgreSQL test blocked by missing DSN ([changes log](../../../../../.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L113)). | **Partial.** The required worker pytest and worker PostgreSQL execution evidence are absent. |

## E2E And Repository Configuration Review

The local OIDC issuer now emits `roles`, `azp`, and `appid` when an application ID is supplied ([testOidcIssuer.ts](../../../../../e2e/support/testOidcIssuer.ts#L92)), enabling the focused server integration to model app-only tokens. However, the multi-replica Playwright configuration starts only `replica-a` and `replica-b` server processes ([playwright.multi-replica.config.ts](../../../../../playwright.multi-replica.config.ts#L37)) through `startMultiReplicaServer.ts` ([startMultiReplicaServer.ts](../../../../../e2e/support/startMultiReplicaServer.ts#L21)); it starts no worker process. The only configured multi-replica test remains the canonical user reconnect scenario ([package.json](../../../../../package.json#L44), [quilt-reconnect.spec.ts](../../../../../e2e/quilt-reconnect.spec.ts#L105)). The default Playwright config explicitly ignores that scenario ([playwright.config.ts](../../../../../playwright.config.ts#L12)).

The worker package declares pytest only as a development extra ([pyproject.toml](../../../../../apps/agent-worker/pyproject.toml#L19)) and configures tests under `tests` ([pyproject.toml](../../../../../apps/agent-worker/pyproject.toml#L22)). This is sufficient repository configuration, but the changes log records that the host could not install or execute that extra.

## Findings

### Critical

#### V5-01: Real worker restart and production checkpoint recovery remain unverified

Phase 5 requires recovery after worker loss, not only restoration inside an in-memory supervisor call. The current restart-named test uses `InMemoryControlPlane` and invokes `process_once` in one Python process ([test_supervisor.py](../../../../../apps/agent-worker/tests/test_supervisor.py#L231)). The changes log explicitly retains a real two-process PostgreSQL fixture as outstanding ([changes log](../../../../../.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L105)). Therefore the implementation does not yet have evidence that a terminated production worker resumes the latest durable checkpoint and completes safely after restart.

### Major

#### V5-02: Worker PostgreSQL contention and lease-loss recovery were not executed

The new worker PostgreSQL test is materially stronger than the prior validation: it races two `PostgresControlPlane` instances, expires a claim and lease, and verifies same-run checkpoint recovery ([test_control_plane_postgres.py](../../../../../apps/agent-worker/tests/test_control_plane_postgres.py#L80)). However, it is skipped unless `AGENT_WORKER_POSTGRES_TEST_DSN` points to a migrated database ([test_control_plane_postgres.py](../../../../../apps/agent-worker/tests/test_control_plane_postgres.py#L20), [changes log](../../../../../.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L114)). The server PostgreSQL suite does execute schema-level SQL, but that does not substitute for running the Python adapter path. This leaves the worker's production contention, reclaim, and checkpoint path unverified.

#### V5-03: Multi-replica e2e does not exercise the worker activation boundary

The e2e OIDC helper supports app-role claims, and focused server integration proves a live app-role request through the startup route ([index.integration.test.ts](../../../../../apps/server/src/index.integration.test.ts#L297)). The configured multi-replica e2e still starts only TypeScript server replicas and exercises canonical Socket.IO reconnect behavior ([playwright.multi-replica.config.ts](../../../../../playwright.multi-replica.config.ts#L37), [quilt-reconnect.spec.ts](../../../../../e2e/quilt-reconnect.spec.ts#L105)). It does not start a worker, submit a worker trigger, verify model-free gating, or prove read-only behavior across worker recovery. Thus the route contract is covered, but the Phase 5 e2e activation criterion is not.

#### V5-04: The prescribed full worker validation command remains unavailable

The plan explicitly requires `python -m pytest apps/agent-worker/tests` ([implementation-details.md](../../../../../.copilot-tracking/details/2026-08-07/fantome-resident-agent-implementation-details.md#L337)). The changes log records that the equivalent `python3 -m pytest` command is blocked because pytest is not installed, local venv creation is unavailable, and the PostgreSQL DSN is absent ([changes log](../../../../../.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L113). `python3 -m compileall` is useful syntax evidence, but it does not execute the worker tests or prove their runtime behavior.

### Minor

#### V5-05: Tracking correctly remains partial but mixes activation and lower-level evidence

The plan leaves Steps 5.1 and 5.2 unchecked while marking issue reporting complete ([implementation plan](../../../../../.copilot-tracking/plans/2026-08-07/fantome-resident-agent-implementation-plan.instructions.md#L77)). The changes log accurately labels Phase 5 partial and lists both the new focused evidence and outstanding real-process work ([changes log](../../../../../.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L105)). No implementation defect is established here; the remaining improvement is to keep future completion markers separate for unit, adapter, integration, and process-level activation evidence.

## Requirements Satisfied

* App-role JWT issuance, active pre-provisioned agent mapping, and a live startup-registered worker route are covered by the focused server integration.
* Delegated-token rejection and app-role acceptance are covered by the route-auth integration test.
* Worker routes are bounded, assignment-scoped, read-only, and backed by server repository contracts in focused route tests ([agentReads.test.ts](../../../../../apps/server/src/routes/agentReads.test.ts#L61)).
* In-memory tests cover model-free gating, stale-trigger reclaim, checkpoint resume, lease-loss ordering, and one-active-lease exclusion.
* Server PostgreSQL tests cover lease constraints, renewal ownership, deduplication, queue bounds, checkpoint CAS, and canonical-write denial.
* Gateway fallback and budget behavior are covered in focused worker tests ([test_gateway.py](../../../../../apps/agent-worker/tests/test_gateway.py#L12)); read-tool redaction and bounded input are covered ([test_tools.py](../../../../../apps/agent-worker/tests/test_tools.py#L47)).
* The changes log records successful server test/build, worker syntax, Docker, infrastructure, and configured reconnect e2e validation where those commands were available ([changes log](../../../../../.copilot-tracking/changes/2026-08-07/fantome-resident-agent-implementation-changes.md#L107)).

## Coverage Assessment

| Requirement area | Coverage | Status |
|---|---|---|
| App-role route authorization | Focused live server integration plus route-auth test | Covered, not Playwright e2e |
| Two-worker exclusion | In-memory supervisor plus unexecuted PostgreSQL adapter race | Partial |
| Stale reclaim | In-memory test plus unexecuted PostgreSQL adapter test | Partial |
| Lease-loss ordering | In-memory supervisor/workflow tests and production code inspection | Partial |
| Checkpoint resume | Serialization and in-memory resume; unexecuted PostgreSQL adapter resume | Partial |
| PostgreSQL-backed contention/recovery | Server schema integration executed; worker adapter test skipped | Partial |
| Real worker process restart | No fixture or executed evidence | Missing |
| Full prescribed validation | Server/build/Docker/compileall/reconnect passes; worker pytest and worker PostgreSQL unavailable | Partial |
| Model-free and read-only behavior | Focused worker and route tests | Covered at lower level |

## Overall Status

**Partial.** Phase 5 has credible lower-level and focused integration coverage, and the prior app-role live-route gap is resolved. It cannot be marked Passed because the required real worker restart and durable production recovery evidence is missing, the worker PostgreSQL contention/recovery test was not run, the full worker pytest command was unavailable, and the multi-replica Playwright harness contains no worker lifecycle or activation scenario.

## Clarifying Questions

* Should the required activation fixture run two worker processes against the disposable PostgreSQL database used by the multi-replica harness, or should it use a dedicated worker integration environment?
* Should lease loss be injected by killing the first worker after a checkpoint commit, by expiring its lease, or both?
* Should Phase 5 completion require the Playwright harness itself to exercise app-role route authorization, or is the focused live server integration the accepted boundary for that criterion?

## Recommended Next Validations

* Add and execute a two-process worker fixture that races one quilt, persists a checkpoint, terminates the first worker, and verifies same-run PostgreSQL-backed resume.
* Exercise lease-loss ordering in that fixture by asserting no tool or gateway call occurs after renewal failure or process reclaim.
* Provide the worker pytest development environment and run `python -m pytest apps/agent-worker/tests`.
* Set `AGENT_WORKER_POSTGRES_TEST_DSN` to a migrated database and execute `test_control_plane_postgres.py`.
* Extend the multi-replica e2e setup with worker orchestration and an app-role trigger/read-only activation scenario, or explicitly record focused server integration as the accepted substitute.
* Capture one clean end-to-end command set with exit codes, including the worker suite and PostgreSQL-backed worker test.
