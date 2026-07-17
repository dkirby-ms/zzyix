<!-- markdownlint-disable-file -->
# Implementation Quality: Client-Server Integration

## Scope

* Plan: .copilot-tracking/plans/2026-07-16/client-server-integration-plan.instructions.md
* Changes: .copilot-tracking/changes/2026-07-16/client-server-integration-changes.md
* Research: .copilot-tracking/research/2026-07-16/client-server-integration-research.md
* Reviewed files:
  * apps/client/package.json
  * apps/client/src/network/session.ts
  * apps/client/src/network/useSocketConnection.ts
  * apps/client/src/App.tsx
  * apps/client/src/interaction/controller.ts
  * apps/client/src/interaction/controller.test.ts
  * apps/client/.env
  * apps/client/.env.example

## Findings

### Critical

1. tileId protocol mismatch breaks authoritative place flow.
* Evidence: apps/client/src/interaction/controller.ts:218, apps/client/src/App.tsx:238, apps/server/src/index.ts:63, apps/server/src/index.ts:76
* Detail: client emits non-UUID temp tileId while server validates tileId as UUID.

### Major

1. Duplicate undo execution logic in two code paths.
* Evidence: apps/client/src/App.tsx:167, apps/client/src/App.tsx:256
2. Optimistic placement can mutate local state before socket-availability guard.
* Evidence: apps/client/src/App.tsx:231, apps/client/src/App.tsx:235
3. SCHEMA_VERSION compatibility check is not implemented in client bootstrap/connection flow.
* Evidence: apps/server/src/contracts.ts:28, apps/server/src/contracts.ts:333
4. Missing integration-level tests for App/socket/session lifecycle.
* Evidence: apps/client/src/App.tsx, apps/client/src/network/session.ts, apps/client/src/network/useSocketConnection.ts

### Minor

1. Tracking runtime .env file is a future secret-leak risk pattern.
* Evidence: apps/client/.env, apps/client/.env.example

## Severity Counts

* Critical: 1
* Major: 4
* Minor: 1

## Validation Snapshot

* lint: warning in controller.test unused import
* build: failed (socketRef use-before-declare, unused import TS error)
* test: pass (12/12)
