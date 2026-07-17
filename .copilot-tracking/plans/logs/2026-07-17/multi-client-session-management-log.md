<!-- markdownlint-disable-file -->
# Planning Log: Multi-Client Session Management

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* DR-03: App.tsx `onSnapshot` revision pass-through not listed as a change target
  * Source: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Step 1.2)
  * Reason: The `applySequencedSnapshot` call at App.tsx:91 must pass `revision: payload.revision` once `SequencedSnapshot.revision` becomes a required field in Step 1.1. The original plan listed only `contracts.ts` as a file to change in Step 1.2, omitting the App.tsx call site.
  * Impact: high (TypeScript compilation failure without this fix — addressed in updated Step 1.2)

* DR-04: `repository.ts` persistence functions not listed as explicit change targets for `newRevision`
  * Source: .copilot-tracking/details/2026-07-17/multi-client-session-management-details.md (Step 1.3)
  * Reason: `PlaceTileAck.newRevision` (added in Step 1.2) requires `persistTilePlacement` and `persistTileRemoval` in `repository.ts` to return the post-commit canvas revision. The original Step 1.3 listed `repository.ts` as a verification reference only, not a change target.
  * Impact: high (TypeScript compilation failure without this fix — addressed in updated Step 1.3)

* DR-01: Same-clientId multi-tab behavior
  * Source: .copilot-tracking/research/2026-07-17/multi-client-session-management-research.md (Potential Next Research section)
  * Reason: `clientId` is stored in `localStorage` and will be shared across tabs in the same browser, allowing a second tab to silently masquerade as the same client. This could corrupt per-author undo filtering in Phase 3 and is excluded from this plan because it requires a product decision (accept shared identity vs. generate per-tab suffix).
  * Impact: medium

* DR-02: Retention window safety for snapshot + op-log replay
  * Source: .copilot-tracking/research/2026-07-17/multi-client-session-management-research.md (Potential Next Research section)
  * Reason: The retention job window (`apps/server/src/jobs/retention.ts`) could prune operations that a reconnecting client still needs for replay. Excluded because retention parameters appear safe for current session lengths; a dedicated review is deferred to WI-02.
  * Impact: low

* DR-03: App.tsx `onSnapshot` callback not updated to pass `revision` to `applySequencedSnapshot`
  * Source: Plan validator finding — derived from Step 1.1 (adds required `revision` to `SequencedSnapshot`) and Step 1.2 (adds `revision` to `SessionSnapshotPayload`), neither of which updates the call site in App.tsx.
  * Reason: After Step 1.1, `SequencedSnapshot.revision` is a required field. The `onSnapshot` callback in App.tsx (line 86-94) calls `applySequencedSnapshot({ tiles: payload.session.tiles, lastOpSeq: payload.lastOpSeq })` without passing `revision: payload.revision`. This will produce a TypeScript error after Step 1.1 is applied and prevents the client from initializing `revision` from the snapshot. No plan step currently covers this App.tsx call site.
  * Impact: high — TypeScript compilation fails between Step 1.1 and Phase 1 validation; success criterion "SequencedTilesState.revision is set after every ack and snapshot" fails for the snapshot path.

* DR-04: `apps/server/src/db/repository.ts` persistence functions must return `newRevision` but are not listed as a change target
  * Source: Plan validator finding — derived from Step 1.2 (adds `newRevision: number` to `PlaceTileAck` and `RemoveTileAck`) and Step 1.3 (adds `newRevision` to mutation acks in `index.ts`).
  * Reason: The `place_tile` and `remove_tile` socket handlers in `index.ts` emit `result.ack` directly, where `result.ack` is typed as `PlaceTileAck` / `RemoveTileAck` from `persistTilePlacement` / `persistTileRemoval`. Once Step 1.2 makes `newRevision: number` required on the success branch, the repository functions must also return it. Step 1.3 says "Determine how `revision` is sourced" but does not list `repository.ts` as a file to change. If `repository.ts` is not updated, the server will fail TypeScript compilation and `newRevision` will never reach the ack payload.
  * Impact: high — blocks Phase 1 validation; implementer must audit `repository.ts` and add `newRevision` to the return type of `persistTilePlacement` and `persistTileRemoval`.

### Plan Deviations from Research

* DD-01: `requestSnapshot` reconnect mechanism kept in Phase 1
  * Research recommends: Replace reconnect-as-resync-trigger with an explicit `snapshot_request`/`resync_required` event before server enforcement.
  * Plan implements: Phase 1 retains the existing disconnect/reconnect resync path; replacement is introduced in Phase 2 only.
  * Rationale: Splitting reconnect replacement into Phase 2 keeps Phase 1 strictly additive and reduces rollback risk if revision tracking introduces unexpected issues.

* DD-02: `expectedRevision` remains optional on server in Phase 1
  * Research recommends: Server eventually rejects missing `expectedRevision`.
  * Plan implements: Server only enforces the field in Phase 2, after client sends it reliably.
  * Rationale: Compatibility-safe rollout; avoids breaking existing single-client sessions during Phase 1.

* DD-03: Per-author undo deferred to Phase 3 pending product decision
  * Research recommends: Confirm per-author undo semantics before implementation.
  * Plan implements: Phase 3 is gated by a product decision (PD-01) recorded in the plan.
  * Rationale: Incorrect undo semantics in a multi-user canvas are user-visible and hard to reverse; better to defer than ship the wrong behavior.

## Implementation Paths Considered

### Selected: IP-B — Operation-log + monotonic revision + ack/rebase completion

* Approach: Incrementally harden the existing server-authoritative protocol by completing client-side use of `expectedRevision`, adding `revision`/`newRevision` to ack contracts, and introducing an explicit resync event.
* Rationale: Highest alignment with current architecture (op-log, snapshot replay, monotonic `opSeq`). Lowest migration risk. Existing tests remain valid. Deterministic and testable.
* Evidence: .copilot-tracking/research/2026-07-17/multi-client-session-management-research.md (Final Recommendation section)

### IP-A: Naive last-write-wins full snapshot broadcast

* Approach: On every mutation, broadcast full canvas state to all clients. No op-log needed.
* Trade-offs: Simple to implement; loses per-operation causality; high bandwidth for large canvases; poor fit with existing op-log DB schema.
* Rejection rationale: Incompatible with existing `operation_log` persistence model and idempotency design.

### IP-C: CRDT / OT redesign

* Approach: Replace server-authoritative placement with a convergent replicated data structure (e.g., LWW-map by tile ID).
* Trade-offs: Strong convergence without server round-trip; very high migration cost; geometry constraints (overlap, boundary) require server validation regardless, eliminating the main benefit.
* Rejection rationale: Cost-benefit unfavorable for a geometry-constrained placement model within the current roadmap.

## Suggested Follow-On Work

* WI-01: Multi-tab clientId isolation — Assign a per-tab `clientId` suffix using `sessionStorage` to prevent multiple tabs from sharing an identity, then scope per-author undo and presence to the per-tab identifier. (medium priority)
  * Source: .copilot-tracking/research/2026-07-17/multi-client-session-management-research.md (Potential Next Research)
  * Dependency: Phase 3 (per-author undo) should be complete first so the correct identity surface is known.

* WI-02: Retention window audit — Verify that the retention job window in `apps/server/src/jobs/retention.ts` retains enough operation-log tail to support reconnecting clients replaying from their last known snapshot. (low priority)
  * Source: .copilot-tracking/research/2026-07-17/multi-client-session-management-research.md (Potential Next Research)
  * Dependency: None; can run independently.

* WI-03: Presence/pointer multi-client hardening — The `pointer_update` broadcast and `ClientPresence` presence model exist in contracts but are not surfaced in the React layer. Wire `client_joined`, `client_left`, and `pointer_update` events into the client state for real cursor presence. (medium priority)
  * Source: .copilot-tracking/research/2026-07-17/multi-client-session-management-research.md (API and Schema Documentation)
  * Dependency: Phase 1 complete.
