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

- Fixed well-known canonical canvas ID.
- Singleton database row discovered through an API.
- Sessions retained as internal spatial shards behind one product-level canvas.

## Findings

Research in progress.

## Risks

Research in progress.

## Open Product Decisions

Research in progress.

## Recommended Phased Implementation

Research in progress.

## References

Research in progress.
