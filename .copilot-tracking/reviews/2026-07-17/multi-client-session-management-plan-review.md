<!-- markdownlint-disable-file -->
# Review: Multi-Client Session Management

## Metadata

* Date: 2026-07-17
* Related Plan: /home/saitcho/zzyix/.copilot-tracking/plans/2026-07-17/multi-client-session-management-plan.instructions.md
* Changes Log: /home/saitcho/zzyix/.copilot-tracking/changes/2026-07-17/multi-client-session-management-changes.md
* Research: /home/saitcho/zzyix/.copilot-tracking/research/2026-07-17/multi-client-session-management-research.md

## Validation Summary

* Critical: 0
* Major: 3
* Minor: 1

## RPI Validation

### Phase 1

Status: passed

Evidence: client revision tracking, `expectedRevision` wiring, ack advancement, and snapshot revision handling are implemented in [apps/client/src/interaction/controller.ts](apps/client/src/interaction/controller.ts#L13-L15), [apps/client/src/App.tsx](apps/client/src/App.tsx#L121-L139), [apps/client/src/App.tsx](apps/client/src/App.tsx#L242-L275), and [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L205-L255).

### Phase 2

Status: partial

Evidence: `resync_required` is defined and emitted in [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L296-L330) and [apps/server/src/index.ts](apps/server/src/index.ts#L675-L780), and the client subscribes in [apps/client/src/network/useSocketConnection.ts](apps/client/src/network/useSocketConnection.ts#L1-L54). The recovery path still forces disconnect/reconnect in [apps/client/src/App.tsx](apps/client/src/App.tsx#L77-L85), so the protocol is not yet fully explicit.

### Phase 3

Status: passed with minor gap

Evidence: per-author undo uses `placedBy` in [apps/client/src/App.tsx](apps/client/src/App.tsx#L177-L311) and preserves author attribution through reconciliation in [apps/client/src/interaction/controller.ts](apps/client/src/interaction/controller.ts#L79-L100). The snapshot payload does not carry `placedBy`, so undo attribution is lost after reconnect or resync.

### Phase 4

Status: passed

Evidence: repo validation completed with `npm run lint`, `npm run test`, and `npm run build` from the repo root. Client and server test suites both passed.

## Implementation Quality

Status: reviewed

Findings from the implementation validator:

* Major: Passive clients do not advance `revision` when they receive broadcasts, so their next local mutation can be rejected as stale even though they are already in sync visually. The broadcast reconcilers preserve `revision: state.revision` in [apps/client/src/interaction/controller.ts](apps/client/src/interaction/controller.ts#L130-L153), while the broadcast payloads do not include revision in [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L271-L279).
* Major: `requestSnapshot()` still performs a disconnect/reconnect cycle instead of a targeted resync request, which creates false `client_left`/`client_joined` churn. See [apps/client/src/App.tsx](apps/client/src/App.tsx#L77-L85) and [apps/server/src/index.ts](apps/server/src/index.ts#L841-L848).
* Major: Per-author undo is not durable across snapshot/resync boundaries because snapshots do not preserve `placedBy`, yet undo eligibility depends on that field. See [apps/server/src/contracts.ts](apps/server/src/contracts.ts#L264-L271) and [apps/client/src/App.tsx](apps/client/src/App.tsx#L177-L311).

## Validation Commands

Status: complete

* `npm run lint` passed for both workspaces. Client emitted React hooks warnings in [apps/client/src/App.tsx](apps/client/src/App.tsx#L77-L85) and [apps/client/src/App.tsx](apps/client/src/App.tsx#L183-L183), but the command exited successfully.
* `npm run test` passed. Client: 21/21 tests. Server: 33/33 tests.
* `npm run build` passed. Client build succeeded with a Vite chunk-size warning; server TypeScript compilation succeeded.

## Missing Work and Deviations

* Broadcast events do not carry authoritative `revision`, so passive observers can fall behind until they write or resync.
* The client still uses reconnect as the mechanical snapshot refresh path, which undermines the explicit resync protocol.
* Snapshot payloads do not retain `placedBy`, so per-author undo can degrade after reconnect or resync.

## Follow-Up Work

### Deferred From Scope

* Consider adding `revision` to `tile_placed` and `tile_removed` broadcasts so observers stay in sync without a resync round-trip.
* Consider persisting `placedBy` through snapshot/replay if per-author undo must survive reconnects.

### Discovered During Review

* Add a real two-client resync test that verifies a passive client advances revision after a peer edit.
* Replace reconnect-based snapshot recovery with an explicit snapshot request path.
* Add an undo regression test that survives snapshot or reconnect boundaries.

## Overall Status

Needs Rework

## Reviewer Notes

The implementation is close to the intended protocol, but the remaining revision propagation and recovery mechanics are not fully aligned with the multi-client design.