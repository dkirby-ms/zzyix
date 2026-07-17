---
title: Multi-Client Session Management Phase 2 Validation
description: RPI validation for phase 2 explicit resync protocol deliverables
---

# Phase 2 Validation

## Scope

This validation covers phase 2 of the multi-client session management plan: explicit resync protocol changes, including `resync_required` emission, client subscription and recovery flow, and two-client integration coverage.

## Phase 2 Requirements Compared To Changes

* `resync_required` exists in the shared contract and is typed for clients. Evidence: [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L296-L330).
* The server emits `resync_required` when revision enforcement fails. Evidence: [apps/server/src/index.ts](apps/server/src/index.ts#L676-L693) and [apps/server/src/index.ts](apps/server/src/index.ts#L770-L780).
* The client subscribes to `resync_required` and responds by requesting a snapshot. Evidence: [apps/client/src/network/useSocketConnection.ts](apps/client/src/network/useSocketConnection.ts#L22-L69) and [apps/client/src/App.tsx](apps/client/src/App.tsx#L127-L139).
* The client snapshot recovery path still uses disconnect/reconnect. Evidence: [apps/client/src/App.tsx](apps/client/src/App.tsx#L77-L85).
* The integration test file includes a multi-client collaboration block, but the explicit resync case is modeled rather than exercised through real socket clients. Evidence: [apps/server/src/index.integration.test.ts](apps/server/src/index.integration.test.ts#L327-L363).

## Findings

### Major: The client still implements snapshot recovery through disconnect/reconnect, so the explicit resync protocol is not fully in place.

The plan for phase 2 required replacing disconnect/reconnect behavior in `requestSnapshot` with an explicit resync flow. The current client still calls `socket.disconnect()` followed by `socket.connect()` inside `requestSnapshot`, and `onResyncRequired` simply delegates to that same reconnect path. That means the new event is present, but the recovery mechanism is still the old side effect rather than a targeted snapshot request protocol.

Evidence:

* [apps/client/src/App.tsx](apps/client/src/App.tsx#L77-L85)
* [apps/client/src/App.tsx](apps/client/src/App.tsx#L127-L139)

### Major: Phase 2’s explicit resync coverage is not exercised end-to-end by the integration tests.

The new `multi-client collaboration` block adds useful coverage, but the resync case is simulated with direct function calls and expectations rather than a live two-client socket interaction that receives `resync_required` and then requests a snapshot. The test at the end of the block demonstrates the stale revision condition, but it does not validate the actual socket event flow the phase requested.

Evidence:

* [apps/server/src/index.integration.test.ts](apps/server/src/index.integration.test.ts#L327-L363)

## Coverage Assessment

Phase 2 is partially implemented. The protocol types are in place, and the server emits `resync_required` for revision mismatch cases, but the client recovery path still depends on reconnect semantics, and the explicit resync behavior is not validated with a real two-client socket test.

Estimated coverage of phase 2 requirements: 70%.

## Clarifying Questions

* Should phase 2 require a distinct snapshot request event, or is client-side reconnect acceptable if the `resync_required` callback is present?
* Do you want the integration tests to use actual socket clients for the stale-revision/resync path, or is the current server-side model test sufficient?

## Recommended Next Validations

* Run the server test suite and confirm the new `resync_required` path behaves with actual socket clients.
* Run the client test suite and confirm the snapshot recovery path no longer depends on reconnect side effects.
* Add or update a live two-client integration test that receives `resync_required` and verifies a targeted snapshot refresh.
