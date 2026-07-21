# zzyix Server

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
- `CORS_ORIGIN` — Allowed CORS origin for Socket.IO (default: *)

Chunk rollout flags:
- `FEATURE_CHUNK_STREAMING_ENABLED` — Enable chunk subscribe/unsubscribe handlers globally (`true` by default)
- `FEATURE_CHUNK_AGGREGATE_ENABLED` — Allow aggregate chunk snapshot payload mode (`true` by default)
- `FEATURE_CHUNK_CANARY_ENABLED` — Restrict chunk streaming to canary sessions only (`false` by default)
- `FEATURE_CHUNK_CANARY_SESSION_IDS` — Comma-separated session IDs allowed when canary mode is on
- `FEATURE_MULTI_REPLICA_READY` — Emit adapter-shared coordination metadata for multi-replica readiness (`false` by default)
- `REPLICA_ID` — Optional override for replica identity in coordination metadata (defaults to `HOSTNAME` or pid)

Rollout notes:
- Keep `FEATURE_CHUNK_STREAMING_ENABLED=false` to hard-disable chunk streaming and preserve legacy session snapshot + tile events.
- Enable canary mode first (`FEATURE_CHUNK_CANARY_ENABLED=true`) with a small `FEATURE_CHUNK_CANARY_SESSION_IDS` cohort before full rollout.
- Aggregate payload mode is additive and can be disabled independently to rollback to fine-grained chunk snapshots.

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
