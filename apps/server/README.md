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

### External ID API Registration

Register a separate zzyix API application in the same Microsoft Entra External
ID external tenant as the SPA. Expose one delegated access scope for the
initial release and grant the SPA permission to request it. Record the exact
tenant values in protected deployment administration, not in source control.

Configure these GitHub environment variables for each deployment environment:

* `AUTH_TRUSTED_ISSUER`: Exact `iss` value accepted from API access tokens
* `AUTH_API_AUDIENCE`: Exact API application ID URI or audience claim
* `AUTH_REQUIRED_SCOPE`: Delegated scope name required by the API
* `AUTH_JWKS_URI`: HTTPS JWKS endpoint for the trusted external tenant
* `AUTH_ACCEPTED_ALGORITHM`: Accepted asymmetric signing algorithm, initially
	`RS256` unless the tenant registration requires another reviewed algorithm
* `SERVER_CORS_ORIGIN`: Exact deployed client origin
* `MIGRATION_JOB_NAME`: Environment-specific Container Apps migration job name
* `AUTH_TELEMETRY_GATE_APPROVED`: Confirms dashboards and alerts cover request,
	socket, operation, replica, policy version, and outcome signals
* `AUTH_ROLLBACK_GATE_APPROVED`: Confirms the release has an approved rollback
	owner and trigger
* `AUTH_RETENTION_POLICY_APPROVED`: Confirms privacy and legal approval for
	authorization audit and pseudonymous attribution retention
* `AUTH_DELETION_COMPLETION_POLICY_APPROVED`: Confirms approved deletion
	completion behavior when ownership remains blocked

The corresponding client values are `AUTH_AUTHORITY`, `AUTH_CLIENT_ID`,
`AUTH_API_SCOPE`, `AUTH_API_ORIGIN`, `AUTH_REDIRECT_URI`, and
`AUTH_POST_LOGOUT_REDIRECT_URI`. CD validates all client and server identity
settings before changing either Container App. `SERVER_DATABASE_URL` remains a
GitHub environment secret; none of the identity settings above are secrets.

The server Container App has internal ingress. Browsers use the deployed client
origin as `AUTH_API_ORIGIN`; they never address the server ingress directly.
The client nginx proxy forwards `/health`, `/me`, `/sessions`, `/quilts`,
`/claims`, `/ownership-transfers`, `/account`, and `/socket.io`. These are the
current and planned top-level API route roots. All other browser paths remain
client SPA or static asset routes. Keep the nginx and Vite allowlists aligned
when introducing another protected top-level route.

The trusted issuer must match tokens exactly. Do not derive it from email,
display name, tenant branding, or the requested authority. The API audience and
delegated scope must match the exposed API registration. Test issuer keys and
settings must never be configured in production.

Production startup and CD both require every operational approval above. A
missing or false value stops rollout before a new application revision starts.
Migration failure also stops deployment because the release-owned migration job
must complete successfully before the server step runs.

Structured server telemetry is recursively redacted at the logging boundary.
Do not add raw bearer tokens, authorization headers, provider subjects, or email
addresses to logs or general telemetry. Internal request, socket, operation,
principal, replica, policy-version, and outcome identifiers remain available for
correlation.

Target-subscription administrators must confirm that the subscription can host
an External ID external tenant and approve tenant branding, domain, and enabled
sign-in methods before deployment. Repository configuration cannot validate
those provider administration decisions.

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

Protocol-v2 execution is fail-closed. `FEATURE_QUILT_PROTOCOL_V2_ENABLED=true`
enables it globally. Otherwise, only authenticated quilt and principal pairs
selected by the canary controls receive v2; other requested v2 connections
negotiate v1. `FEATURE_QUILT_DUAL_READ_ENABLED=true` enables migration dual
reads globally. Otherwise, dual reads run only for selected canary pairs.

Protocol v1 remains available only through explicit compatibility settings. V2 connections suppress session-wide durable mutation events. Toroidal mutation stays disabled until authentication maps an external identity to a stable internal principal; `clientId`, socket identity, and attribution fields are not principals.

### Mutation acceptance gates

The initial owner-only gate covers authenticated owner placement and removal,
denied non-owner mutation, stale revision rejection, canonical aliases, scoped
post-commit fanout, expiry renewal, and two-replica reconnect convergence. Run:

```bash
npm run test:e2e:owner-only
npm run test:e2e:multi-replica
```

Delegated-capability and moderator acceptance remains deferred. The
`test:e2e:delegated` command intentionally fails so automation cannot treat that
work as complete.

Production CD always writes `FEATURE_PROTOCOL_V2_MUTATION_ENABLED=false`.
Changing that default requires separate reviewed workflow work after the
owner-only gate, migration rehearsal, telemetry, retention, deletion, and
rollback approvals are recorded. Runtime startup additionally requires
`AUTH_OWNER_E2E_GATE_APPROVED`, `AUTH_MIGRATION_REHEARSAL_APPROVED`, and
`AUTH_MUTATION_ROLLBACK_APPROVED` whenever mutation is requested.

Rollout notes:
- Keep `FEATURE_CHUNK_STREAMING_ENABLED=false` to hard-disable chunk streaming and preserve legacy session snapshot + tile events.
- Enable canary mode first (`FEATURE_CHUNK_CANARY_ENABLED=true`) with a small `FEATURE_CHUNK_CANARY_SESSION_IDS` cohort before full rollout.
- Aggregate payload mode is additive and can be disabled independently to rollback to fine-grained chunk snapshots.

## Quilt Migration Canary

Migration dual reads compare stable tile ID, shape, color, material, position,
rotation, mirrored state, creation time, and authorship. A mismatch returns the
legacy read and emits `quilt_migration_dual_read_parity` with a bounded mismatch
report. Disabling the global dual-read flag and canary controls stops those
comparisons without changing legacy data or nullable compatibility links.

Canary telemetry requires both a quilt and a resolved authenticated principal.

* `FEATURE_QUILT_DUAL_READ_CANARY_ENABLED`
* `FEATURE_QUILT_DUAL_READ_CANARY_QUILT_IDS`
* `FEATURE_QUILT_DUAL_READ_CANARY_PRINCIPAL_IDS`
* `FEATURE_QUILT_DUAL_READ_CANARY_PERCENT`
* `FEATURE_QUILT_DUAL_READ_ENABLED`
* `FEATURE_QUILT_PROTOCOL_V2_ENABLED`

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

The rehearsal creates a temporary database and seeds classic, expanded, and
vast bounded canvases with edge and chunk-boundary tiles. Its parity command
fingerprints stable ID, canvas ID, shape, color, material, position, stored
chunk layout, rotation, mirrored state, nullable authorship, and creation time
for every authoritative tile row visible through the migrated links. It also
checks bounded canvas dimensions and origins, tile linkage, spatial-reference
coverage, and the absence of inferred patch owners.

The rehearsal creates both a fresh database and an upgrade database. It applies
migrations through 0004 to the upgrade database, seeds representative legacy
data, applies 0005, and compares its server-side schema fingerprint with the
fresh database. It then runs backfill twice in separate Node processes, rolls
additive quilt data back, compares complete legacy canvas and tile
fingerprints, then backfills and verifies again. The cleanup trap drops both
temporary databases.

CD owns production migration execution through one manually triggered
Container Apps job. The job runs the release server image's `db:apply` command
with parallelism one, retries a failed replica twice, and must report success
before the server Container App receives the new image. CD releases queue
without cancellation, and deployment fails closed before changing the job when
Azure reports an active execution. Every release reapplies and verifies the
manual trigger, parallelism, completion count, timeout, and retry settings
before starting the job. A failed or timed-out migration stops the deployment.
Production server startup remains verification-only and never applies DDL.
Rollback keeps the previous server revision active; any data rollback requires
a separately reviewed reverse migration because additive migrations are not
automatically reversed.

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
