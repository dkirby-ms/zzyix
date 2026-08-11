<!-- markdownlint-disable-file -->

# Planning Log: Server-Authoritative Alexander Placement

## Discrepancy Log

* The previous click-to-patch change log mentions a root `prepare:alexander-patch-manifest` script, but the active `package.json` snapshot does not currently include that script. The server implementation must not assume the artifact already exists.
* The selected approach reuses `persistQuiltTilePlacement` per tile server-side. This reduces client noise and centralizes trust, but it is not a single atomic database transaction for the whole patch import.

## Implementation Paths Considered

Selected path: single Socket.IO Alexander command with server-side manifest loading and sequential authoritative tile placement.

Rejected path: keep browser queue and only reduce concurrency. This does not solve the architecture concern.

Rejected path: full repository-level bulk transaction. This is attractive long term, but it is a larger rewrite of validation, idempotency, audit, and event emission behavior.

## Suggested Follow-on Work

* Make the Alexander import fully atomic or explicitly document skip-and-record partial success semantics.
* Add deployment wiring that copies the generated manifest into both local dev and server container runtime paths.
* Add progress events for large imports if the command can take longer than one socket acknowledgement should reasonably hold.
