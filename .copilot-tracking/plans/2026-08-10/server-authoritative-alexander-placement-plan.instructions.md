<!-- markdownlint-disable-file -->

# Plan: Server-Authoritative Alexander Placement

## User Requests

* Replace client-side per-tile Alexander placement with a cleaner single-command workflow.
* Build the change so Alexander placement works that way instead.

## Overview

The browser should load no trusted placement data and should not stream one mutation per Alexander tile. It should send one patch-level Alexander command. The server should own manifest loading, deployment binding, per-tile command derivation, authoritative validation, persistence, and event broadcast.

## Context Summary

* Research: `.copilot-tracking/research/2026-08-10/server-authoritative-alexander-placement-research.md`
* Markdown conventions: `/home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/markdown.instructions.md`
* Writing style conventions: `/home/saitcho/.vscode-server/extensions/ise-hve-essentials.hve-core-all-3.3.101/.github/instructions/hve-core/writing-style.instructions.md`
* Current client queue: `apps/client/src/App.tsx` and `apps/client/src/domain/mosaicImport.ts`
* Current server placement authority: `apps/server/src/index.ts` and `apps/server/src/db/repository.ts`

## Implementation Checklist

1. [x] Add shared contracts for a single Alexander patch command and acknowledgement. <!-- parallelizable: false -->
2. [x] Add server-side Alexander manifest parsing, deployment binding, and import orchestration. <!-- parallelizable: false -->
3. [x] Wire a new Socket.IO handler that validates the request, invokes the server import service, and broadcasts resulting tile events. <!-- parallelizable: false -->
4. [x] Simplify the client Alexander path to emit one command after patch click and remove per-tile client queue use for Alexander. <!-- parallelizable: false -->
5. [x] Update focused tests for server import behavior and client socket traffic expectations. <!-- parallelizable: false -->
6. [x] Run focused validation and repair failures before review. <!-- parallelizable: false -->

## Dependencies

* Existing `persistQuiltTilePlacement` behavior remains the authority for validation and persistence.
* Server runtime must have access to the generated Alexander manifest file. The implementation should support an environment override and a repository-relative default.
* Existing client-owned patch selection can remain because it only chooses a target patch; the server still validates the requested patch.

## Success Criteria

* Browser sends one Alexander-specific socket mutation for a patch import.
* Browser no longer sends one `quilt_place_tile` event per Alexander tile.
* Server loads and verifies the approved manifest hash before importing.
* Server derives tile positions and IDs, then commits through existing placement validation.
* Unauthorized, stale, collision, and resource failures return structured acknowledgements.
* Focused tests pass for the touched client and server behavior.
