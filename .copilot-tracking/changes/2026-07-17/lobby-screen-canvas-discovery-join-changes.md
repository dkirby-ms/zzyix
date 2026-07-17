<!-- markdownlint-disable-file -->
# Release Changes: Lobby Screen for Canvas Discovery and Join

**Related Plan**: .copilot-tracking/plans/2026-07-17/lobby-screen-canvas-discovery-join-plan.instructions.md
**Implementation Date**: 2026-07-17

## Summary

Implemented a lobby-first entry flow for canvas discovery and explicit join/create before websocket participation begins.

## Changes

### Added

* apps/client/src/ui/LobbyScreen.tsx - Added lobby discovery UI with canvas metadata, explicit join actions, create canvas action, and loading/error states

### Modified

* apps/client/src/App.tsx - Added lobby-first mode flow, explicit join/create handlers, and removed automatic session bootstrap on mount
* apps/client/src/network/session.ts - Added session list/create API utilities and session storage accessor helpers for lobby flow
* apps/client/src/App.css - Added lobby layout and responsive styles for session list rendering
* apps/server/src/index.ts - Added `GET /sessions` endpoint and summary response mapper with fallback display names and canonical canvas size metadata
* apps/server/src/contracts.ts - Added lobby summary contract types and aligned REST route comments with implemented server behavior
* apps/server/src/db/repository.ts - Added session summary query helper with active participant counts for lobby list metadata
* apps/server/src/index.test.ts - Added server unit coverage for deterministic fallback display naming and canonical `canvasSize` response shape
* apps/server/src/index.integration.test.ts - Added metadata mapping assertions to protect participant count and `canvasSize` semantics

### Removed

## Additional or Deviating Changes

* Used package-local validation commands in apps/client with corepack pnpm instead of root `pnpm --filter client ...`
	* Reason: workspace lacks pnpm-workspace.yaml, so root filter commands do not resolve project selectors
* Client build currently blocked by pre-existing TypeScript errors outside this phase scope
	* Reason: `three` typing issues in render layer files (apps/client/src/render/MosaicScene.tsx and apps/client/src/render/materials.ts)
* Server and full validation used npm workspace equivalents instead of pnpm commands
	* Reason: `pnpm` is unavailable in environment; used `npm run <script> --workspace=<pkg>` mapping for equivalent validation execution

## Release Summary

Implemented a lobby-first join flow across client and server layers with explicit discovery and canvas selection before websocket participation.

Files affected:
* Added: 1
* Modified: 8
* Removed: 0

Validation outcomes:
* Client lint: pass
* Client tests: pass
* Client build: blocked by pre-existing render typings outside this scope
* Server lint: pass
* Server tests: pass
* Server build: pass
* Workspace lint/test: pass using npm workspace command equivalents

Deployment and dependency notes:
* No schema migration introduced in V1; fallback canvas display naming retained by design
* No infrastructure or runtime configuration changes required for this feature slice
