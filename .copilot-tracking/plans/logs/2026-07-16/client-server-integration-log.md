<!-- markdownlint-disable-file -->
# Planning Log: Client-Server Integration (Issue #12)

## Phase 1 Validation Note

Phase 1 foundation work is complete.

* `apps/client/src/network/session.ts` and `apps/client/src/network/useSocketConnection.ts` were added.
* `apps/client/package.json` now includes `socket.io-client` at `^4.8.2`.
* `apps/client/.env` and `apps/client/.env.example` now set `VITE_SERVER_URL=http://localhost:3001`.
* Validation passed with `cd apps/client && npm install && npm run lint && npm run build`.
* The direct server contracts import from the client network hook compiled successfully, so DD-02 did not require the local mirror fallback.

## Phase 2 Validation Note

Phase 2 App.tsx integration is complete.

* `apps/client/src/App.tsx` now uses `SequencedTilesState`, boots a session and client ID, connects the socket, reconciles snapshot and broadcast events, performs optimistic placement with ack rollback/swap, and routes undo through `remove_tile`.
* `apps/client/src/interaction/controller.ts` now exports `isServerTileId` for settled-tile undo safety.
* `apps/client/src/ui/ControlsPanel.tsx` now accepts a clear-disabled flag so clear can be disabled rather than sent locally.
* Validation passed with `cd apps/client && npm run lint` and `cd apps/client && npm run build`.

## Phase 3 Validation Note

Phase 3 controller and pure-helper test coverage is complete.

* `apps/client/src/interaction/controller.ts` gained a small pure helper for optimistic ack reconciliation so the broadcast-before-ack race can be covered without a browser-level test harness.
* `apps/client/src/interaction/controller.test.ts` now covers snapshot reset, placement/removal deduplication and gap detection, server UUID identity checks, and the optimistic ack race case.
* Validation passed with `cd apps/client && npm run test`.

## Discrepancy Log

* No new discrepancies beyond the existing Phase 1 items.

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* DR-01: Stale event listener cleanup on socket teardown
  * Source: `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Complete Examples — Socket connection hook)
  * Reason: The research example does not call `socket.off()` on cleanup; only `socket.disconnect()`
  * Impact: medium — event listeners accumulate across re-renders if `useEffect` deps change; causes stale closure bugs
  * Resolution in plan: `useSocketConnection.ts` Step 1.3 explicitly calls `socket.off(event, handler)` for each listener before disconnect

* DR-02: Undo for pending (optimistic, unacknowledged) tiles
  * Source: `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Scenario C, Alt A)
  * Reason: Research defers "undo of mid-flight placements" to a follow-up; plan follows this deferral
  * Impact: low — undo simply does nothing for pending tiles (no regression; guard prevents invalid server call)
  * Resolution in plan: `isServerTileId` UUID guard is applied; pending tiles are silently skipped

* DR-03: Pointer sharing (`pointer_move` emit)
  * Source: `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Outline item 9)
  * Reason: Out of scope for Issue #12 per research scope section — no peer cursor UI exists yet
  * Impact: low — server handles `pointer_move` and emits `pointer_update`; client simply doesn't emit
  * Resolution in plan: WI-03 suggested follow-on work item tracks this

* DR-04: No explicit implementation step to export `isServerTileId` for test compilability
  * Source: `.copilot-tracking/details/2026-07-16/client-server-integration-details.md` (Step 3.1 — test case 6 note; Step 2.6 — definition site)
  * Reason: Step 2.6 defines `isServerTileId` inline in `App.tsx`. Step 3.1 test case 6 calls it from `controller.test.ts`, which imports only from `./controller`. No numbered step relocates or exports the function to a testable module. The details say "consider exporting it from controller.ts" but this is advisory, not a required step.
  * Impact: medium-high — without moving `isServerTileId` to `controller.ts` and exporting it, test case 6 will fail to compile; importing from App.tsx in a test file is non-idiomatic in a Vite/Vitest setup and may pull in CSS side-effects
  * Resolution in plan: Missing — implementer must add a step to move `isServerTileId` to `controller.ts` and export it before implementing test case 6

* DR-04: `isServerTileId` not exported from `controller.ts` in original plan
  * Source: `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Scenario C) — function defined inline in App.tsx
  * Reason: Research placed the helper in App.tsx; plan validator identified testability gap
  * Impact: medium — test case 6 (`isServerTileId` regex test) would fail to compile from `controller.test.ts` without an export
  * Resolution in plan: Step 2.6 updated to export `isServerTileId` from `controller.ts` first, then import it in App.tsx

### Plan Deviations from Research

* DD-01: No URL validation in `session.ts` beyond `res.ok`
  * Research recommends: Validate response shape before accessing `data.session.id` (contracts.ts formal agreement)
  * Plan implements: Simple `res.ok` check + type assertion `as { session: { id: string } }`
  * Rationale: Internal REST endpoint; server always returns conforming JSON when `ok`. Minimal boundary validation is appropriate for this monorepo context. Deeper validation adds complexity without meaningful protection.

* DD-02: Server contracts import path requires verification
  * Research recommends: Direct relative import `'../../../server/src/contracts'` from client
  * Plan implements: Same, but notes that if TypeScript `paths` aliases are not configured, a local type copy may be needed
  * Rationale: Path resolution depends on tsconfig `paths` and monorepo root config. The detail file documents both options. Implementer must verify before committing to one approach.

* DD-04: Plan success criteria named "undo pending" test rather than "race condition" test
  * Research recommends: The ack-vs-broadcast race is labeled **REAL and CRITICAL** by Subagent 1; the corrected ack handler is the primary fix
  * Plan implements: Success criteria now lists "race condition: broadcast before ack" as one of the 7 named tests; the `isServerTileId` regex test implicitly covers pending-tile guard behavior
  * Rationale: The race condition is the more critical correctness guarantee; a dedicated "undo pending" behavioral test is deferred as its guard is verified by the UUID regex test (test 6)

* DD-03: `onClear` disabled instead of sequential `remove_tile`
  * Research recommends: Sequential `remove_tile` calls per tile OR new server bulk-clear event
  * Plan implements: `onClear={() => undefined}` (disabled) when connected
  * Rationale: No bulk-clear event exists on the server. Sequential `remove_tile` calls with proper ordering, dedup, and rollback add significant complexity. Disabling clear is the correct scope-limited choice for Issue #12. WI-02 tracks this.

* DD-04: Plan success criteria updated to name "race condition" as test 7 instead of "undo pending"
  * Research recommends: Test for ack-vs-broadcast race — Subagent 1 labeled it REAL and CRITICAL
  * Plan implements: Success criteria updated to reference "race condition: broadcast before ack"; `isServerTileId` regex test (test 6) implicitly covers pending-tile guard behavior
  * Rationale: Race condition is the more critical correctness gate; resolved in final plan

## Implementation Paths Considered

### Selected: Phased integration with `network/` module isolation

* Approach: Create a `network/` subdirectory in `apps/client/src/` containing `session.ts` and `useSocketConnection.ts`. App.tsx consumes these via import and React hook. Sequenced state replaces bare tile array. Socket callbacks defined in App.tsx with `useCallback`.
* Rationale: Keeps controller pure-function (no network side effects). Isolates socket lifecycle from render logic. Follows existing monorepo pattern (domain/, interaction/, render/, ui/ separation). Subagent 2 confirmed useState is correct — no zustand needed for this scope.
* Evidence: `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Selected Approach: Phased Integration)

### IP-01: Socket connection managed in a zustand store

* Approach: Create a zustand store that holds both the socket instance and `SequencedTilesState`. App.tsx subscribes to the store.
* Trade-offs: Cleaner for multi-component access; adds store boilerplate; harder to test; zustand v5 is already a dependency
* Rejection rationale: Subagent 2 research confirmed useState is correct for this scope. App.tsx is the only consumer of tile state. Zustand adds overhead without benefit for a single-component use case.

### IP-02: Import only server contract types into a local `network/contracts.ts` mirror

* Approach: Copy type definitions from `apps/server/src/contracts.ts` into `apps/client/src/network/contracts.ts` to avoid cross-package relative imports.
* Trade-offs: Eliminates import path risk; introduces type drift risk (server types diverge without client updating)
* Rejection rationale: The research recommends direct relative imports for simplicity in a monorepo. A local copy is a fallback documented in DD-02, not the primary approach.

### IP-03: Use `socket.io-client` connection state recovery (`connection_state_recovery`)

* Approach: Enable `connection_state_recovery` on the socket to replay missed events on reconnect, avoiding the need for `session_snapshot` re-sync.
* Trade-offs: Reduces reconnect complexity; requires server-side configuration change; NOT enabled on the current server
* Rejection rationale: Subagent 1 confirmed `connection_state_recovery` is NOT enabled on the server (`index.ts` analysis). The server always sends `session_snapshot` on every connection — this is the correct recovery path for this codebase.

## Suggested Follow-On Work

Items identified during planning that fall outside current scope.

* WI-01: Undo for pending (optimistic, unacknowledged) tiles — Allow the user to cancel a mid-flight `place_tile` before the ack arrives (medium priority)
  * Source: `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Scenario C, Alt A)
  * Dependency: Requires tracking pending emit promises; no server change needed

* WI-02: Bulk clear via sequential `remove_tile` — Implement `onClear` as a sequential series of `remove_tile` emits with per-tile ack handling and rollback on partial failure (low priority)
  * Source: `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Scenario C, Clear all)
  * Dependency: WI-01 (pending tile tracking helps identify which tiles to skip)

* WI-03: Pointer sharing — Emit `pointer_move` on pointer update; display peer cursors via `pointer_update` broadcasts (low priority)
  * Source: `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Outline item 9)
  * Dependency: Requires cursor rendering in MosaicScene or overlay component

* WI-04: URL-based session sharing — Persist `sessionId` in URL query param (`?session=<id>`) so sessions can be shared by link (medium priority)
  * Source: `.copilot-tracking/research/2026-07-16/client-server-integration-research.md` (Scenario B, Alt B)
  * Dependency: None; purely additive to `session.ts`

* WI-05: Contract type drift protection — Add a `SCHEMA_VERSION` check on `session_snapshot` receipt to detect server/client version mismatch and surface a user-visible error (medium priority)
  * Source: `apps/server/src/contracts.ts` line 1 (`SCHEMA_VERSION = '1.0.0'`)
  * Dependency: Requires `SessionSnapshotPayload` to include `schemaVersion` field (may already exist — check contracts.ts)

* Phase 3 follow-on: browser-level socket integration tests for App.tsx are still deferred
  * Reason: This phase intentionally kept coverage at the controller/pure-helper layer to avoid a fragile UI harness
  * Impact: low — the critical sequencing and race logic is now covered in unit tests, but end-to-end socket wiring still relies on manual validation and build/test coverage
