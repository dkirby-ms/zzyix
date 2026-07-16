<!-- markdownlint-disable-file -->
# Implementation Quality Validation: Authoritative Backend Domain Port

## Metadata

* Date: 2026-07-16
* Plan: .copilot-tracking/plans/2026-07-16/authoritative-backend-domain-port-plan.instructions.md
* Changes: .copilot-tracking/changes/2026-07-16/authoritative-backend-domain-port-changes.md
* Research: .copilot-tracking/research/2026-07-16/authoritative-backend-domain-port-research.md

## Summary

* Critical: 1
* Major: 4
* Minor: 2

## Findings

### Critical

1. Runtime payload trust boundary is not enforced before domain validation.
* Evidence: apps/server/src/index.ts:242, apps/server/src/index.ts:244, apps/server/src/domain/tileGeometry.ts:92, apps/server/src/domain/tileGeometry.ts:98
* Risk: Malformed socket payloads can trigger runtime exceptions and disrupt active session handling.
* Recommendation: Add runtime guards for place_tile and remove_tile payloads before applyPlaceTile/applyRemoveTile are called.

### Major

1. Ack callbacks are invoked unconditionally in socket handlers.
* Evidence: apps/server/src/index.ts:245, apps/server/src/index.ts:256
* Risk: If a client emits without callback, server may throw when ack is undefined.
* Recommendation: Guard with typeof ack === 'function' before invocation.

2. CORS fallback allows wildcard origin while credentials is enabled.
* Evidence: apps/server/src/index.ts:184-188
* Risk: Invalid and unsafe credentialed cross-origin posture.
* Recommendation: Require explicit allowlist origin when credentials is true.

3. Session map has no eviction or TTL cleanup policy.
* Evidence: apps/server/src/index.ts:29, apps/server/src/index.ts:282
* Risk: Memory growth over long uptime with transient sessions.
* Recommendation: Remove empty sessions on disconnect and/or apply idle TTL cleanup.

4. Contract documentation states bounds that do not match authoritative solver constants.
* Evidence: apps/server/src/contracts.ts:96, apps/server/src/domain/placementSolver.ts:266
* Risk: Client/operator expectation drift and confusing reconciliation behavior.
* Recommendation: Align contract commentary with defaultBounds or move bounds to shared constant.

### Minor

1. remove_tile event comment says remove last tile but behavior is remove by tileId.
* Evidence: apps/server/src/contracts.ts:272
* Recommendation: Update comment to tileId-based semantics.

2. Integration coverage is function-level rather than transport-level.
* Evidence: apps/server/src/index.integration.test.ts:1-72
* Recommendation: Add socket client/server integration tests for malformed payload and ack-absent calls.

## Validation Commands

* npm --prefix apps/server run lint: Pass
* npm --prefix apps/server run test: Pass (14/14)
* npm --prefix apps/server run build: Pass
* Diagnostics (get_errors on changed server files): Pass
