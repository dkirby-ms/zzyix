---
title: zzyix Server
description: Development, deployment, and migration operations for the zzyix collaborative server.
---

WebSocket + REST API server for the zzyix collaborative mosaic tile-placement application.

## Quick Start

```bash
npm install
npm run dev
```

Server runs on `http://localhost:3001` with Socket.IO WebSocket on the same origin.

## Development

- `npm run dev` — Start with hot reload (via nodemon + tsx)
- `npm run build` — Compile TypeScript to `dist/`
- `npm run lint` — Run oxlint
- `npm run test` — Run tests with coverage
- `npm run test:watch` — Watch tests

## Deployment

```bash
npm run build
npm start
```

Set environment variables:
- `PORT` — Server port (default: 3001)
- `HOST` — Server host (default: 0.0.0.0)
- `CORS_ORIGIN` — Allowed CORS origin for Socket.IO (default: http://localhost:5173)

Chunk rollout flags:
- `FEATURE_CHUNK_STREAMING_ENABLED` — Enable chunk subscribe/unsubscribe handlers globally (`true` by default)
- `FEATURE_CHUNK_AGGREGATE_ENABLED` — Allow aggregate chunk snapshot payload mode (`true` by default)
- `FEATURE_CHUNK_CANARY_ENABLED` — Restrict chunk streaming to canary sessions only (`false` by default)
- `FEATURE_CHUNK_CANARY_SESSION_IDS` — Comma-separated session IDs allowed when canary mode is on
- `FEATURE_MULTI_REPLICA_READY` — Emit adapter-shared coordination metadata for multi-replica readiness (`false` by default)
- `REPLICA_ID` — Optional override for replica identity in coordination metadata (defaults to `HOSTNAME` or pid)

Protocol-v2 area-of-interest limits:

- `QUILT_V2_MAX_ROOMS_PER_CONNECTION` controls accepted canonical rooms per socket (canary default: `64`)
- `QUILT_V2_MAX_ROOMS_PER_REQUEST` controls room outcomes per acknowledgement (canary default: `32`)
- `QUILT_V2_MAX_CHUNKS_PER_REQUEST` controls deduplicated chunks within one room request (canary default: `64`)
- `QUILT_V2_MAX_ROOM_CHURN_PER_MINUTE` controls new room joins in a rolling minute (canary default: `120`)
- `QUILT_V2_MAX_SNAPSHOT_TILES` controls tiles in one scoped patch snapshot (canary default: `2000`)
- `QUILT_V2_MAX_PAYLOAD_BYTES` controls encoded scoped snapshot bytes (canary default: `262144`)

These values are conservative canary defaults. They are not final measured production thresholds. Replace them only after representative protocol telemetry records the workload, deployment class, measurement window, failure criterion, and rollback trigger.

Protocol-v2 clients request `protocolVersion: 2` in Socket.IO auth. The server selects v2 only for quilts whose persisted `protocol_version` is `2`, announces immutable topology and negotiated limits with `quilt_protocol`, and accepts canonical `subscribe_quilt_area` requests. Acknowledgements report `accepted`, `forbidden`, `invalid`, or `budget-exceeded` for every requested room. Reconnect recovery compares patch operation sequence, revision, and event ID cursors, then emits only the required `quilt_patch_snapshot`; it does not send a whole-quilt snapshot.

Protocol v1 remains available only through explicit compatibility settings. V2 connections suppress session-wide durable mutation events. Toroidal mutation stays disabled until authentication maps an external identity to a stable internal principal; `clientId`, socket identity, and attribution fields are not principals.

Rollout notes:
- Keep `FEATURE_CHUNK_STREAMING_ENABLED=false` to hard-disable chunk streaming and preserve legacy session snapshot + tile events.
- Enable canary mode first (`FEATURE_CHUNK_CANARY_ENABLED=true`) with a small `FEATURE_CHUNK_CANARY_SESSION_IDS` cohort before full rollout.
- Aggregate payload mode is additive and can be disabled independently to rollback to fine-grained chunk snapshots.

## Quilt Migration Canary

Migration dual reads compare full persisted tile identity, shape, color, material,
position, rotation, mirroring, creation time, and authorship. A mismatch returns
the legacy read and emits `quilt_migration_dual_read_parity` with a bounded
mismatch report. Legacy tables and nullable compatibility links remain the
rollback source of truth.

Canary telemetry requires both a quilt and a resolved authenticated principal.
Current protocol-v2 connections do not resolve an external identity, so these
controls cannot enroll a client until principal integration is implemented:

* `FEATURE_QUILT_DUAL_READ_CANARY_ENABLED`
* `FEATURE_QUILT_DUAL_READ_CANARY_QUILT_IDS`
* `FEATURE_QUILT_DUAL_READ_CANARY_PRINCIPAL_IDS`
* `FEATURE_QUILT_DUAL_READ_CANARY_PERCENT`

The structured migration events cover parity failures, patch lock wait,
mutation latency, snapshot bytes, resyncs, room churn, attachment bytes,
PostgreSQL pool wait, retained client cache and scene counts, draw calls, and
frame time. Events contain raw measurements and cohort dimensions. Measured
thresholds, observation windows, alert policy, and rollback triggers remain
external release gates.

## Migration Rehearsal

Start loopback PostgreSQL and run the disposable rehearsal:

```bash
docker compose up -d postgres
./scripts/verify-quilt-migration.sh rehearse
```

The rehearsal creates a temporary database, applies migrations, seeds stable
tile IDs with transforms and authorship, runs backfill twice, verifies parity,
rolls additive quilt data back, verifies the legacy fingerprint, recovers, and
verifies parity again. Its cleanup trap drops the temporary database.

Individual loopback operations use `DATABASE_URL`:

```bash
./scripts/verify-quilt-migration.sh migrate
./scripts/verify-quilt-migration.sh backfill
./scripts/verify-quilt-migration.sh parity
./scripts/verify-quilt-migration.sh rollback
./scripts/verify-quilt-migration.sh recover
```

The rollback operation is valid only while compatibility remains. It clears
nullable tile-to-quilt links and deletes quilts linked to legacy canvases.
Cascade constraints remove their additive patch history and spatial references;
legacy canvases, tiles, operation history, snapshots, IDs, layout, and
authorship remain. Run `recover` to recreate additive data and verify parity.

> [!CAUTION]
> Non-loopback targets are refused unless
> `QUILT_MIGRATION_PRODUCTION_APPROVED=true`,
> `QUILT_MIGRATION_CHANGE_ID` is nonempty, and
> `QUILT_MIGRATION_CONFIRM_DATABASE` exactly matches the URL database name.
> The script never prints `DATABASE_URL`.

## Legacy Retirement Gates

Protocol v1 and legacy storage are still available. No contract migration has
removed legacy columns or constraints. Setting
`FEATURE_LEGACY_RETIREMENT_REQUESTED=true` records intent only; startup reports
the unmet gates and continues preserving both rollback paths.

Every gate must be explicitly true before a later reviewed removal can proceed:

* `LEGACY_RETIREMENT_PARITY_PASSED`
* `LEGACY_RETIREMENT_RECOVERY_PASSED`
* `LEGACY_RETIREMENT_MULTI_REPLICA_PASSED`
* `LEGACY_RETIREMENT_AUTHENTICATED_PRINCIPAL_INTEGRATION_PASSED`
* `LEGACY_RETIREMENT_CLIENT_BUDGET_PASSED`
* `LEGACY_RETIREMENT_MEASURED_WINDOW_APPROVED`
* `LEGACY_RETIREMENT_ROLLBACK_POLICY_APPROVED`

The decision surface does not remove code or data even when every variable is
true. Actual protocol and storage retirement remains a separately reviewed
follow-on after the measured exit window and rollback policy are approved.

## Architecture

- **Express** — REST API layer (health checks, session management)
- **Socket.IO** — WebSocket protocol with typed events (ClientToServerEvents, ServerToClientEvents)
- **Domain Engine** — `apps/server/src/domain/` — Tile validation, placement logic, authoritative game state

## Contracts

All REST and Socket.IO operations are defined in `src/contracts.ts`. This file is the single source of truth for the API specification and must be shared with the client team.

See [contracts.ts](./src/contracts.ts) for:
- Typed Socket.IO event maps
- REST endpoint shapes
- Validation rules
- Error codes and scenarios
- Formal agreement between client and server teams
