<!-- markdownlint-disable-file -->

# Infinite Canvas Convergence Research

## Scope

Research the path from the current multi-canvas/session lobby architecture to one canonical infinite canvas, without modifying application code.

## Research Questions

1. How do client entry, lobby, create, join, URL, and local-storage flows encode canvas/session identity?
2. How do server REST and Socket.IO paths route sessions, rooms, authoritative state, and bounds policy?
3. What PostgreSQL canvas, tile, participant schema and migrations constrain convergence?
4. Are patch claims global or scoped per canvas/session, and how is ownership preserved?
5. How do chunk loading, viewport rendering, reconnect, retention/cleanup, and multi-replica behavior depend on sessions?
6. Which tests encode multi-canvas assumptions?
7. Which ADRs and prior research artifacts contain relevant decisions or evidence?
8. What is the smallest safe implementation, deployment, migration, and rollback sequence?

## Approach Evaluation

### Fixed Well-Known Canonical Canvas ID

This is the smallest code change if the identifier means a deployment-specific compatibility canvas UUID supplied through configuration. The client can skip `GET /sessions`, pass that UUID into the existing socket hook, and leave all quilt V2 behavior unchanged.

It is unsafe as a literal UUID compiled into the application. Development, test, staging, restored databases, and production do not share row identity. A deterministic seed can also collide with an existing row or point to a bounded protocol-1 compatibility quilt. Configuration drift between client and server can split traffic, and a browser-visible UUID still does not prove that the target is the intended canonical quilt.

Use a configured ID only as a temporary server-side bootstrap input. Validate at startup that it resolves to exactly one protocol-2 toroidal quilt with complete patches and policies. Do not make the client or migration SQL the source of truth.

### Singleton Database Row Discovered Through an API

This is the recommended approach. Add a singleton deployment pointer, for example a row keyed by `primary`, that references the selected quilt and its compatibility canvas ID. Expose an authenticated read endpoint that returns the compatibility `sessionId`, durable `quiltId`, topology, protocol version, and entry location. Keep provisioning as an explicit migration or operator command, not an on-demand side effect of a user request.

The pointer makes environment restores, validation, canaries, and rollback explicit. It can select an existing toroidal quilt without changing any patch, tile, membership, policy, claim, operation, snapshot, or audit identity. During transition, the compatibility canvas ID satisfies the current Socket.IO handshake and `loadQuiltDeliveryContext`; a later protocol can connect by quilt ID directly.

The singleton row needs constraints or transactional validation that prevent two active canonical pointers. A status or generation field should distinguish preparing, active, and retired targets. Switching the pointer after either target receives writes requires a reviewed merge or rollback procedure; it must never be an ordinary configuration toggle.

### Sessions as Internal Spatial Shards

This approach retains every current session and presents them as adjacent regions behind one product-level canvas. It appears attractive because it avoids moving rows, but current sessions are not shards. Each has overlapping local coordinates, independent bounds, one separate quilt, independent patch address space, canvas-scoped presence and legacy sequence, and one Socket.IO connection identity.

Federation would need a new global shard map, coordinate transforms, cross-session viewport routing, multiple connections or a gateway, cross-shard collision and mutation transactions, global object lookup, session-to-session seam rendering, claim semantics across many quilts, and migration of session-wide presence. It would also conflict with the accepted ADR, which makes patches the ownership and consistency boundary and chunks the internal delivery boundary.

Reject sessions as spatial shards for initial convergence. If scale later requires physical partitioning, shard patch/chunk storage behind one durable quilt identity without exposing those partitions as product sessions.

## Findings

### Branch Baseline

* The checked-out branch is `infinite-canvas`, the worktree was clean at the start of research, and the merge base with `main` is `79147ba27a8c41916ca0c2db77b237a01af4a1ad`.
* The branch adds the finite toroidal quilt, chunk subscriptions, patch ownership, authentication, retention, and multi-replica test surfaces. The relevant behavior is therefore branch architecture, not behavior already present on `main`.

### Client Entry and Identity

* `apps/client/src/App.tsx:423-433` owns explicit `lobby` versus `canvas` mode, a nullable `sessionId`, session discovery state, create state, pending patch claim state, and the previous session marker.
* `apps/client/src/App.tsx:543-568` always resets to the lobby on mount, clears active `sessionId`, reads the previous session only for display, and loads all sessions. It does not automatically reopen the stored session.
* `apps/client/src/App.tsx:562-616` enters a canvas by persisting its session ID, setting active state, and switching mode. Creation posts a selected finite size preset, then requires a successful patch claim before entering the returned session.
* `apps/client/src/network/session.ts:3-4,47-54,131-137` stores the last session in per-tab `sessionStorage` under `zzyix_session_id`, while the stable anonymous client ID uses `localStorage` under `zzyix_client_id`.
* No application URL parsing, route parameter, query parameter, or history mutation carries canvas identity. Direct links cannot select or restore a canvas. `apps/client/src/network/serverUrl.ts:17` uses `window.location.origin` only to resolve the server origin.
* `apps/client/src/ui/LobbyScreen.tsx:44-145` exposes refresh, create, finite size preset selection, claim, and join controls. Session rows expose an ID-derived display name, connected count, dimensions, and a last-used marker.
* `apps/client/src/network/useSocketConnection.ts:30-73` does not create a socket until `sessionId` and an access-token provider exist. The Socket.IO auth payload includes `token`, `sessionId`, stable `clientId`, protocol version 2, and disabled V1 compatibility.
* `apps/client/src/network/useSocketConnection.ts:74-113` disables Socket.IO automatic reconnection. It performs one explicit token refresh and reconnect attempt only for authentication-related server disconnects or connection errors.
* `apps/client/src/App.tsx:1060-1172` derives visible chunk IDs from viewport bounds with movement and zoom hysteresis, canonicalizes toroidal patch addresses, subscribes to quilt patch/chunk rooms, and separately maintains legacy canvas chunk subscriptions keyed by `canvasId: sessionId`.
* `apps/client/src/App.tsx:843-858` bounds the quilt cache by active patch IDs and a patch-count budget. Returning to the lobby clears protocol, quilt cache, cursors, active chunks, and collaborators (`apps/client/src/App.tsx:568-578`).

### Initial Convergence Implication

The client can converge first by replacing session discovery and creation with canonical-canvas bootstrap while retaining the existing internal `sessionId` argument. No URL migration is required because URLs do not currently encode canvas identity. The stored session key should be ignored first and removed later, after rollback no longer needs the previous lobby behavior.

### Server Identity, Routing, and State

* `apps/server/src/index.ts:109-123` defines process-local authoritative state as a `Map<string, AuthoritativeSessionState>` keyed by session ID and a separate session/client/socket membership map. Each entry contains the legacy session, canvas config, clients, and last operation sequence.
* `apps/server/src/index.ts:1090-1159` lazily creates missing in-memory session entries. Empty sessions are immediately eligible for eviction; non-empty inactive entries are evicted after 30 minutes (`apps/server/src/index.ts:133,1112-1146`). This eviction affects only process memory, not PostgreSQL rows or tiles.
* `apps/server/src/index.ts:1211-1256` treats PostgreSQL as reconnect authority for legacy sessions: join is persisted, then canvas state, active participants, snapshot, operation replay, version, and sequence are loaded.
* `apps/server/src/index.ts:1583-1618` lists every visible legacy canvas and creates a new UUID canvas, in-memory state, one bounded quilt, one unclaimed patch, and a claim target. The create request still selects `classic`, `expanded`, or `vast` bounds.
* `apps/server/src/index.ts:2050-2143` selects protocol V2 when the session resolves to a protocol-2 quilt and rollout permits it. V2 sends topology and returns before the legacy `socket.join(sessionId)` and legacy snapshot path. V1 joins the session room, hydrates process-local state, emits a whole-session snapshot, and broadcasts presence to the session room.
* `apps/server/src/db/repository.ts:2524-2585` resolves V2 topology indirectly through `quilts.legacy_canvas_id = sessionId`. Thus the handshake session ID is currently a lookup alias for one quilt, not the V2 consistency boundary.
* `apps/server/src/realtime/quiltRooms.ts:71-191` defines the V2 room boundary as `quilt:{quiltId}:patch:{row}:{column}:{kind}`. It canonicalizes toroidal row and column aliases, enforces visibility and room/chunk/churn budgets, and deduplicates equivalent canonical rooms.
* `apps/server/src/index.ts:2860-3020` loads patch snapshots or contiguous operation replay scoped to accepted chunks, enforces payload and tile budgets, and joins adapter rooms at `canonicalRoomId + chunkId`. V2 delivery is patch-revision based and does not depend on the process-local session state map.
* `apps/server/src/index.ts:3036-3078` uses process-local socket counts to decide the last connection for a client. The source explicitly warns this is not multi-replica correct without sticky sessions or shared membership. V2 connections also skip the legacy participant join path but still execute disconnect finalization, creating an asymmetric presence lifecycle that should be corrected before canonical traffic is forced entirely onto V2.

### Bounds and Infinite Rendering Policy

* Legacy session creation remains bounded through a selected size preset and `SessionCanvasConfig`. Legacy placement validates against per-session bounds.
* Quilt placement in `apps/server/src/db/repository.ts:1592-1785` requires a toroidal quilt, canonicalizes coordinates, derives all intersected and collision-neighbor patches, locks affected patches in sorted ID order, authorizes every intersected patch, validates with `{ mode: 'unbounded' }`, and stores one canonical tile plus patch/chunk spatial references.
* The current product's “infinite” behavior is a finite torus. One product-level canvas can retain that topology unchanged; changing to a mathematically unbounded plane would be a separate product and schema decision.

### PostgreSQL Aggregate Boundaries

* `apps/server/src/db/schema.ts:53-64` stores legacy canvases with a UUID, global version, optional session canvas config, and timestamps.
* `apps/server/src/db/schema.ts:115-141` stores quilts independently but permits one optional, unique `legacy_canvas_id`. Current session lookup relies on this compatibility link.
* `apps/server/src/db/schema.ts:144-164` identifies patches by stable UUID and unique `(quilt_id, row, column)`. Ownership, state, and revision belong to the patch.
* `apps/server/src/db/schema.ts:167-233` scopes membership and visibility policy to stable patch IDs.
* `apps/server/src/db/schema.ts:235-270` records claim attempts with principal, quilt, patch, outcome, and time. Claim audit and quota history therefore survive removal of the lobby if IDs are preserved.
* `apps/server/src/db/schema.ts:361-374` keys legacy participant presence by `(canvas_id, client_id)`.
* `apps/server/src/db/schema.ts:377-439` keeps `tiles.canvas_id` non-null for compatibility while adding optional `quilt_id`, anchor patch, and normalized `tile_spatial_refs`. One canonical tile can intersect multiple patch/chunk scopes without duplication.
* `apps/server/src/db/schema.ts:442-487` sequences operations and snapshots per patch. Legacy `operation_log` and `snapshots` remain canvas-scoped (`apps/server/src/db/schema.ts:489-550`).
* `apps/server/src/db/repository.ts:1383-1455` creates one bounded protocol-1 quilt and one patch for every new canvas. Existing multi-canvas rows therefore represent distinct quilts, not patches already arranged inside one shared quilt.

### Patch Claim Scope

* `apps/client/src/network/session.ts:76-91` and `apps/server/src/index.ts:1520-1527` send only `operationId` and `patchId`; canvas/session ID is absent.
* `apps/server/src/db/repository.ts:317-439` resolves the patch's quilt transactionally, locks the principal and patch, and updates ownership by stable patch ID. The active ownership limit is one patch per principal within that quilt.
* Claim attempt and successful-claim windows query by principal without a quilt filter. Those rate limits are global across quilts, while active ownership is quilt-scoped.
* Claims, memberships, policies, transfers, audit records, patch operations, and snapshots should not be re-keyed during initial convergence. Preserving the selected canonical quilt and all of its patch IDs preserves ownership and tile history without a data rewrite.

### Retention and Cleanup

* `apps/server/src/db/repository.ts:2838-2915` prunes legacy and patch operations/snapshots by global age cutoffs and expired idempotency keys. It does not delete canvases, quilts, patches, tiles, memberships, claims, or ownership.
* A canonical canvas must be exempt from any future aggregate deletion policy. Current memory cleanup is harmless to durability, but a singleton should avoid repeated empty-state creation by using database discovery before cache insertion.

### Existing Migration and Rollout Contract

* `apps/server/migrations/0005_finite_toroidal_quilt.sql:17-156` adds quilts, patches, memberships, tile quilt/anchor links, spatial references, patch operations, and patch snapshots additively. The legacy canvas foreign key is `ON DELETE RESTRICT`; tile quilt and anchor links are also restrictive.
* `apps/server/src/db/quiltBackfill.ts:72-190` idempotently creates a one-by-one bounded compatibility quilt per legacy canvas, links existing tile IDs without changing `canvas_id`, derives spatial references, and copies legacy operations and snapshots with provenance IDs.
* `apps/server/migrations/0006_authentication_authorization.sql:1-142` adds patch policy, claim quota, ownership transfer, and authorization audit rows. Audit references to quilts and patches are restrictive, while claim quota references cascade with quilt or patch deletion. Deleting or replacing identity rows would therefore either fail or erase policy history.
* `apps/server/src/migration/quiltRollout.ts:1-128` already supports quilt/principal/cohort canaries, dual reads, protocol-V2 rollout, and explicit legacy retirement gates for parity, recovery, multi-replica behavior, authenticated principal integration, client budgets, measured operation, and rollback approval.
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:21-64` defines deployments as potentially hosting multiple community quilts, patches as product ownership boundaries, chunks as implementation partitions, immutable populated topology, finite toroidal coordinates, and one canonical persisted identity per object.
* The ADR's legacy migration section (`docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md:118-127`) prohibits silently reinterpreting a bounded canvas as a one-by-one torus. Migration requires owner opt-in or reviewed deterministic packing, source-to-destination provenance, collision detection, parity verification, rollback, and continued bounded access for unmigrated canvases.
* The existing rollout machinery should be reused for canonical-canvas convergence. A separate feature flag should control canonical discovery/entry, while protocol V2 and legacy retirement remain independently reversible.

### Main Branch Comparison

* `main:apps/client/src/network/session.ts` already contained `zzyix_session_id`, `zzyix_client_id`, create/list helpers, and automatic session helper logic. The current branch changed authentication and claim behavior but did not introduce the basic session identity model.
* `main:apps/client/src/App.tsx` already owned lobby mode, explicit join/create, stored previous session, and a socket parameterized by one session ID.
* `main:apps/server/src/index.ts` already used the process-local session map, REST catalog and creation routes, session rooms, canvas-scoped chunks, participant persistence, and process-local disconnect gating.
* `main:apps/server/src/db/schema.ts` contained only canvas-scoped participants, tiles, operation log, and snapshots. The branch adds quilt and patch aggregates beside those tables, providing the intended replacement boundary while retaining compatibility.

### Production Provisioning Gap

* Production startup applies migrations and configures the PostgreSQL Socket.IO adapter (`apps/server/src/index.ts:3100-3195`) but does not create or select a toroidal quilt.
* `apps/server/src/db/repository.ts:1383-1455` creates only bounded one-by-one protocol-1 quilts for the public session creation route.
* The only repository path that seeds a protocol-2 toroidal quilt is the test-only `/test/quilt/setup` route at `apps/server/src/index.ts:1757-1823`.
* Convergence therefore requires an explicit production provisioner or reviewed SQL/data migration plus startup validation. UI removal must not ship before that target exists.

### Chunk Loading, Rendering, and Recovery

* `apps/client/src/render/MosaicScene.tsx:340-429` reports the orthographic viewport and builds periodic display images only for the camera viewport.
* `apps/client/src/render/periodicImages.ts:22-83` keeps canonical tile IDs, computes nearest periodic images, deduplicates authoritative tiles, and gives each displayed repetition a derived image key.
* `apps/client/src/domain/quiltCache.ts:5-243` keys cache state by stable patch and tile IDs, keeps per-room cursors, and pins optimistic, undo, and selected tiles during eviction.
* This client architecture is already suitable for one product-level quilt. The convergence change should alter bootstrap and identity discovery, not flatten patch state into one canvas-wide tile array.
* Protocol V2 reconnect reconstructs state from supplied per-room cursors and patch snapshots/operations. `e2e/quilt-reconnect.spec.ts:75-225` proves reconnect through another replica, authorization, stale-revision rejection, operation replay, and PostgreSQL-adapter payload delivery above 8 KB.
* Socket.IO automatic reconnection remains disabled in the browser. Before removing the lobby fallback, non-authentication transport loss needs a deliberate retry policy that resubscribes with retained cursors and clears protected cache on terminal authentication loss.

### Multi-Replica Behavior

* `apps/server/src/index.ts:1958-1974` always configures `@socket.io/postgres-adapter` outside database-less tests, so patch/chunk room fanout can cross replicas.
* `FEATURE_MULTI_REPLICA_READY` changes advertised metadata (`apps/server/src/index.ts:318-336`) but does not itself provide shared last-socket membership. Disconnect gating remains process-local.
* V2 patch state is database authoritative and room fanout is adapter shared. Presence membership and leave semantics are the remaining singleton-traffic correctness gap.

### Tests Encoding Multi-Canvas Assumptions

* `apps/client/src/App.test.tsx:167-268` asserts lobby-first startup, no implicit join from stored session, explicit join, finite preset creation, mandatory claim, and socket initialization with the selected or created session ID. The back-button test near `apps/client/src/App.test.tsx:1037` also treats return to lobby as a primary workflow.
* `apps/server/src/index.test.ts:26-82` asserts a multi-row lobby response. `apps/server/src/index.test.ts:326-355` validates finite create presets, and `apps/server/src/index.test.ts:474-510` creates multiple independently cleanable in-memory sessions.
* `apps/server/src/index.integration.test.ts:90-220` models first connect, reconnect, presence, and replay around an arbitrary `nextSessionId`. Selection and pointer tests later in the file require payload `canvasId` to match socket session membership.
* `apps/server/src/db/recovery.postgres.integration.test.ts:180-255` tests visibility of multiple session summaries and creation of new protected sessions with a new claim target.
* `apps/server/src/db/ownership.postgres.integration.test.ts:27-260` is patch/quilt based and should remain largely unchanged. It protects concurrent claims, quilt-scoped active ownership, global claim quotas, transfers, lifecycle, and replay binding.
* `e2e/authentication.spec.ts:29-89`, `e2e/smoke.spec.ts:8-19`, and `e2e/quilt-seams.spec.ts:119-145` create and claim a new canvas through the lobby. These workflows must be replaced with canonical entry and claim-selection scenarios.
* `e2e/support/testState.ts:7-58` and `e2e/support/multiUser.ts:233-350` manufacture isolated sessions and explicitly join every user to the same ID. Canonical tests need transactionally reset canonical fixtures or isolated database instances instead of creating product sessions.
* `e2e/quilt-reconnect.spec.ts` and `e2e/quilt-seams.spec.ts` already cover the correct future boundaries: quilt ID, patch room, cursor, periodic alias, stable tile identity, authorization, and replica fanout. Preserve and adapt their setup rather than rewriting their assertions around a global session snapshot.

### Relevant Prior Artifacts

* `.copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md` records that explicit lobby entry and no auto-resume were deliberate product choices. Removing them is a product change, not dead-code cleanup.
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md` selects one finite toroidal quilt with patch ownership, patch-local consistency, chunk delivery, one R3F scene, bounded cache, and canonical periodic display.
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-client-research.md` identifies lobby replacement, stable quilt/location identity, URL routing, and patch/chunk cache as client adaptation boundaries.
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-server-research.md` rejects one canvas-wide lock and session snapshots for a large world and selects quilt, patch, and chunk layers.
* `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md` confirms one active patch per principal per quilt, global claim attempt/success windows, owner-only initial mutation, authenticated access, and protected-state clearing after authentication loss.
* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md` is the controlling accepted decision. A new ADR should amend tenancy from “multiple community quilts may be hosted” to one product-level canonical quilt while preserving its topology, migration, identity, and authorization rules.

## Risks

* Selecting or creating the wrong canonical row can split users across worlds. Startup must fail closed when the pointer, compatibility canvas, topology, patch grid, or policies are incomplete.
* Re-keying patches, quilts, or tiles can break restrictive audit foreign keys, erase cascading quota history, invalidate room cursors, and orphan spatial references. Initial convergence should not re-key content.
* A canonical product entry can accidentally reactivate canvas-wide V1 snapshots and the process-local session cache at world scale. Canonical rollout must require protocol V2 for the selected quilt.
* Existing deployments may contain only bounded compatibility quilts. Product entry cannot become canonical until a toroidal protocol-2 quilt is explicitly provisioned and verified.
* Old clients can continue creating canvases while the new client assumes a singleton. Session creation needs a staged server-side disable policy and version-aware response.
* V2 presence joins and disconnects are asymmetric, and last-socket detection is process-local. Increased canonical traffic will amplify false leave events and participant-row drift.
* Browser reconnection handles token refresh but not ordinary network interruption. Removing the lobby removes the current manual recovery path unless retry and cursor resubscription are added.
* Moving legacy canvases into the canonical quilt can collide geometrically, change bounded edge semantics, alter patch claim quotas, and violate topology immutability. It needs a separate import program.
* Switching the singleton pointer after writes creates two divergent authoritative worlds. Rollback should revert client entry behavior, not repoint users to another writable quilt.
* Test isolation becomes harder when every test shares one canonical world. Per-test databases or transactional fixture resets are safer than concurrent destructive reset of one shared deployment.
* Removing the lobby also removes discovery, connected-count, finite-size selection, and a clear claim affordance. Replacement navigation and claim UX need product definition.

## Open Product Decisions

* Select the canonical target: an existing production toroidal quilt, a newly provisioned quilt, or a reviewed migration target. Repository code cannot reveal deployed row contents.
* Decide whether “infinite” remains the accepted finite torus or changes to an unbounded sparse plane. Current implementation and ADR support only the finite torus.
* Decide the fate of noncanonical legacy canvases: read-only archive, direct-link access, time-limited migration UI, owner opt-in import, or permanent retention without product discovery.
* Define canonical topology dimensions before content or claims make them immutable.
* Decide whether the root URL always opens one default location and whether canonical deep links encode quilt ID, canonical coordinates, patch ID, or tile ID. The ADR requires stable links, but no router exists.
* Define the post-lobby claim journey. New users need a way to find and claim eligible patches without creating a new canvas.
* Confirm whether one active patch per principal in the canonical quilt remains the intended ownership limit.
* Define canonical presence and roster semantics, including privacy across hidden patches and expected behavior across browser tabs and replicas.
* Decide whether older clients receive the canonical canvas from `GET /sessions`, receive a clear upgrade error from `POST /sessions`, or remain temporarily able to use legacy canvases.
* Approve migration collision policy, coordinate placement, provenance requirements, and whether stable tile and patch IDs must be preserved for every imported legacy canvas or only where feasible.

## Recommended Phased Implementation

### Phase 0: Decide and Inventory

1. Approve a new ADR for one product-level canonical quilt, finite topology, root entry, deep links, claim UX, legacy-canvas fate, and ownership limits.
2. Inventory production canvases, quilts, patches, ownership, policies, pending transfers, tiles, operations, snapshots, and audit references. Determine whether a suitable protocol-2 toroidal quilt already exists.
3. Take a database backup and complete a restore/recovery drill before any canonical provisioning or legacy import.

### Phase 1: Add Canonical Discovery Without Behavior Change

1. Add an expand-only migration for a singleton canonical-world pointer with foreign keys to the selected quilt and compatibility canvas, lifecycle status, generation, and timestamps.
2. Add an explicit idempotent provision/selection command that validates topology, complete patch addresses, policies, protocol version, and compatibility alias under a transaction and advisory lock.
3. Add an authenticated canonical discovery endpoint. Keep `GET /sessions`, `POST /sessions`, the lobby, storage key, and legacy socket path unchanged.
4. Add tests for zero, one, and conflicting canonical rows; wrong topology; missing patches/policies; restore stability; and concurrent provisioning.

### Phase 2: Canary Canonical Entry

1. Add a client/server feature flag that replaces lobby loading with canonical discovery and automatic entry after authentication. Continue passing the returned compatibility canvas ID to `useSocketConnection`.
2. Require protocol V2 for the canonical target and fail closed instead of falling back to a whole-session V1 snapshot.
3. Keep the lobby code and `zzyix_session_id` untouched but ignored while the flag is active. This provides immediate application rollback.
4. Add root-entry, refresh, sign-out/in, direct reload, unavailable-canonical, and old-client compatibility tests.

### Phase 3: Harden Canonical Runtime

1. Make V2 presence join/leave symmetric and use adapter-shared or durable membership for last-socket decisions.
2. Add ordinary network reconnection with bounded backoff, token renewal, canonical rediscovery when appropriate, cursor-based resubscription, and protected-cache clearing on terminal auth loss.
3. Run existing seam, cursor replay, cross-replica, claim, ownership, retention, cache-budget, and recovery tests against the canonical fixture.
4. Measure room churn, payload bytes, patch lock wait, cache retention, scene objects, and reconnect transfer before broad rollout.

### Phase 4: Stop Creating Product Sessions

1. Expand the canonical-entry cohort to all supported clients.
2. Make `GET /sessions` return only the canonical compatibility entry for older supported clients or version the API. Change `POST /sessions` to a documented upgrade or disabled response only after old-client telemetry is acceptable.
3. Replace lobby create/join UI with canonical navigation, search, patch discovery, and claim controls. Remove finite size presets from the product path.
4. Keep legacy storage and rows readable. Do not drop the compatibility canvas ID while the handshake still requires it.

### Phase 5: Migrate Legacy Content Separately

1. Offer owner opt-in or run a reviewed deterministic packing plan. Dry-run coordinate transforms, complete-footprint authorization, collisions, capacity, and visibility before commit.
2. Record source canvas/quilt/patch and destination provenance. Preserve patch and tile IDs only when all restrictive audit, quota, operation, snapshot, and spatial references can move atomically; otherwise use explicit identity mapping.
3. Keep source canvases immutable during each migration, verify tile fingerprints and operation/snapshot recovery, then mark the source archived rather than deleting it.
4. Roll back an import by provenance and restored source visibility, not by reversing schema migrations.

### Phase 6: Retire Compatibility After Gates Pass

1. Change the handshake to accept durable quilt identity directly and remove `legacy_canvas_id` lookup only after all clients have migrated.
2. Retire canvas-wide rooms, snapshots, operation sequencing, and process-local authoritative session state after the existing parity, recovery, multi-replica, authentication, budget, measured-window, and rollback gates pass.
3. Remove lobby/session storage and legacy REST creation code last. Keep database columns and tables until retention, legal, audit, and restore requirements authorize a contract migration.

### Deployment and Rollback Order

1. Deploy expand-only schema and server discovery support.
2. Provision and validate the canonical pointer, then deploy a client canary.
3. Enable protocol V2 and canonical entry independently so either can be rolled back.
4. During rollback, disable canonical entry and restore the lobby. Keep the canonical quilt listed and writable through its compatibility canvas ID so writes made during the canary remain reachable.
5. Never roll back by dropping additive schema, deleting the canonical quilt, or repointing to a divergent quilt. Database rollback is forward repair plus restored application routing.

## References

### Primary Code

* `apps/client/src/App.tsx`
* `apps/client/src/network/session.ts`
* `apps/client/src/network/useSocketConnection.ts`
* `apps/client/src/domain/quiltCache.ts`
* `apps/client/src/render/MosaicScene.tsx`
* `apps/client/src/render/periodicImages.ts`
* `apps/client/src/ui/LobbyScreen.tsx`
* `apps/server/src/contracts.ts`
* `apps/server/src/index.ts`
* `apps/server/src/db/schema.ts`
* `apps/server/src/db/repository.ts`
* `apps/server/src/db/quiltBackfill.ts`
* `apps/server/src/migration/quiltRollout.ts`
* `apps/server/src/realtime/quiltRooms.ts`
* `apps/server/migrations/0005_finite_toroidal_quilt.sql`
* `apps/server/migrations/0006_authentication_authorization.sql`

### Decisions, Research, and Tests

* `docs/decisions/2026-07-27-finite-toroidal-quilt-v01.md`
* `.copilot-tracking/research/2026-07-17/lobby-screen-canvas-discovery-join-research.md`
* `.copilot-tracking/research/2026-07-27/infinite-quilt-canvas-research.md`
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-client-research.md`
* `.copilot-tracking/research/subagents/2026-07-27/infinite-quilt-server-research.md`
* `.copilot-tracking/research/2026-07-28/infinite-canvas-authentication-authorization-research.md`
* `apps/client/src/App.test.tsx`
* `apps/server/src/index.test.ts`
* `apps/server/src/index.integration.test.ts`
* `apps/server/src/db/ownership.postgres.integration.test.ts`
* `apps/server/src/db/recovery.postgres.integration.test.ts`
* `e2e/authentication.spec.ts`
* `e2e/multi-user-fixtures.spec.ts`
* `e2e/quilt-reconnect.spec.ts`
* `e2e/quilt-seams.spec.ts`
* `e2e/smoke.spec.ts`
