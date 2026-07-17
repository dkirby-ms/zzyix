<!-- markdownlint-disable-file -->
# Review Log: Revisioning and Idempotency

## Metadata

* Review date: 2026-07-16
* Plan: .copilot-tracking/plans/2026-07-16/revisioning-idempotency-plan.instructions.md
* Changes log: .copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md
* Research: .copilot-tracking/research/2026-07-16/revisioning-idempotency-research.md
* Scope resolution: Attachment-provided changes file and linked plan/research

## Validation Status

* Phase 1 (Schema and migration): Passed
* Phase 2 (Contracts and repository): Partial
* Phase 3 (Socket semantics and docs): Partial
* Phase 4 (Tests): Partial
* Phase 5 (Validation): Partial

## Findings Summary

* Critical: 1
* Major: 5
* Minor: 3

## RPI Validation Findings by Phase

### Phase 1

* Passed. No findings.
* Evidence: schema/migration updates and migration journal continuity are present.

### Phase 2

* Major: idempotency boundary allows non-deterministic retry identity because placement payload still permits omitted tileId while repository generates random IDs when absent.
* Evidence:
	* apps/server/src/contracts.ts:219
	* apps/server/src/db/repository.ts:345

### Phase 3

* Major: stale/out-of-order checks are implemented in repository, but the phase detail requested handler-level precondition checks in socket handlers.
* Evidence:
	* apps/server/src/index.ts:540
	* apps/server/src/index.ts:573
	* apps/server/src/db/repository.ts:349
	* apps/server/src/db/repository.ts:553

### Phase 4

* Major: integration tests for replay/revision outcomes use synthetic objects/helper closures instead of exercising production handler-to-repository behavior.
* Major: no explicit unit assertion for duplicate place replay opSeq reuse path.
* Minor: validation evidence is summarized without raw command transcript artifacts in the changes file.
* Evidence:
	* apps/server/src/index.integration.test.ts:122
	* apps/server/src/index.integration.test.ts:186
	* apps/server/src/index.test.ts:54

### Phase 5

* Minor: build warning is documented as non-blocking without explicit remediation or deferred-work tracking decision.
* Minor: changes log lacks explicit follow-on planning recommendations requested by phase step 5.3.
* Evidence:
	* .copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md:74
	* .copilot-tracking/changes/2026-07-16/revisioning-idempotency-changes.md:77

## Implementation Quality Findings

### Correctness and reliability

* Critical: retry idempotency for place operations can fail when clients omit tileId; repository then derives idempotency key from generated UUID, so retries may not correlate to the original accepted write.
* Major: idempotency request hash is persisted but mismatch semantics are not enforced on key reuse.
* Evidence:
	* apps/server/src/contracts.ts:219
	* apps/server/src/index.ts:540
	* apps/server/src/db/repository.ts:345
	* apps/server/src/db/repository.ts:380

### Operational durability

* Major: retention path does not prune expired idempotency keys; table can grow unbounded under retry-heavy traffic.
* Evidence:
	* apps/server/src/jobs/retention.ts:9
	* apps/server/src/db/repository.ts:781

### Maintainability

* Major: contract comments assert server-assigned tile IDs, which conflicts with retry-stable UUID-based idempotency strategy.
* Evidence:
	* apps/server/src/contracts.ts:339

### Test quality

* Major: integration tests do not validate full runtime mutation flow; they mostly validate shape logic using constructed objects.
* Evidence:
	* apps/server/src/index.integration.test.ts:122
	* apps/server/src/index.integration.test.ts:168

## Validation Command Results

* npm --prefix apps/server run lint: Pass
* npm --prefix apps/server run build: Pass
* npm --prefix apps/server run test -- index: Pass
* npm --prefix apps/server run test -- index.integration: Pass
* npm run lint: Pass
* npm run build: Pass (client chunk-size warning remains)
* npm run test: Pass

## Missing Work and Deviations

* Required idempotency guarantee is incomplete because placement retries can still duplicate when tileId is omitted.
* Handler-level precondition location deviates from phase detail (repository-level enforcement implemented instead).
* Test coverage for replay semantics is weighted toward synthetic assertions rather than end-to-end handler/repository behavior.
* No explicit expiry pruning implementation for idempotency_keys retention.

## Follow-Up Recommendations

### Deferred from Scope

* Address client bundle chunk-size warning in a dedicated frontend optimization task.
* If repository-level revision checks are the intended architecture, update plan detail language to remove handler-level requirement mismatch.

### Discovered During Review

* Make PlaceTilePayload tileId mandatory and reject requests without stable client-generated ID, or introduce a dedicated request-level idempotency key.
* Enforce request_hash mismatch handling on idempotency-key reuse with typed reject outcomes.
* Extend retention prune pass to delete expired idempotency_keys rows and add tests for TTL cleanup.
* Replace or augment synthetic integration tests with real socket handler + repository interaction tests for duplicate replay and revision rejects.

## Overall Status

⚠️ Needs Rework

## Reviewer Notes

Review completed with full phase validation, implementation quality validation, and fresh command execution.

Primary risk is correctness: retry idempotency is not deterministic for place operations unless clients always supply tileId, but current contract permits omission.
