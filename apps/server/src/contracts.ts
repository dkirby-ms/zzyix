/**
 * Operation contracts for the zzyix server.
 *
 * Single source of truth for the REST API and Socket.IO event protocol.
 * Domain primitive types are defined here so the server has no compile-time
 * dependency on the client package.
 *
 * Socket.IO handles connection lifecycle (heartbeat, reconnection, rooms).
 * This file covers only application-level concerns:
 *   - REST request/response shapes
 *   - Typed Socket.IO event maps (ClientToServerEvents, ServerToClientEvents)
 *   - Per-socket metadata (SocketData, ConnectionAuth)
 *
 * Usage on the server:
 *   import { Server } from 'socket.io'
 *   import type { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from './contracts'
 *   const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer)
 *
 * Usage on the client:
 *   import { io } from 'socket.io-client'
 *   import type { ClientToServerEvents, ServerToClientEvents } from '../../server/src/contracts'
 *   const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, { auth })
 */

// ─── Schema Version ──────────────────────────────────────────────────────────
// Both client and server MUST use this same version to ensure compatibility.
// Increment on any breaking change (new required fields, removed events, etc.).
export const SCHEMA_VERSION = '1.0.0'

// ─── Domain primitives ────────────────────────────────────────────────────────

export type Vec2 = { x: number; y: number }

export type TileShape = 'square' | 'triangle' | 'rectangle' | 'l-shape'

export type MaterialVariant = 'ceramic' | 'glass' | 'stone'

export type Transform2D = {
  position: Vec2
  rotation: number
  mirrored?: boolean
}

/**
 * Authoritative tile state on the server.
 * Does NOT include settleFrom (that's client-side animation metadata only).
 */
export type TileInstance = {
  id: string
  shape: TileShape
  color: string
  material: MaterialVariant
  transform: Transform2D
  createdAt: number
}

// ─── Session ──────────────────────────────────────────────────────────────────

export type Session = {
  id: string
  tiles: TileInstance[]
  createdAt: number
  updatedAt: number
}

export type ClientPresence = {
  clientId: string
  joinedAt: number
  pointer?: Vec2
}

// ─── REST API ─────────────────────────────────────────────────────────────────
//
// POST   /sessions                          → CreateSessionResponse
// GET    /sessions/:sessionId               → GetSessionResponse
// POST   /sessions/:sessionId/tiles         → PlaceTileResponse
// DELETE /sessions/:sessionId/tiles/:tileId → 204 No Content
//
// All error responses use ApiError.

export type ApiError = {
  error: string
  code:
    | 'SESSION_NOT_FOUND'
    | 'TILE_NOT_FOUND'
    | 'PLACEMENT_REJECTED'
    | 'INVALID_REQUEST'
    | 'INTERNAL_ERROR'
}

// ─── Validation Rules ─────────────────────────────────────────────────────────
// These rules are enforced by the server's domain engine (placementSolver).
// Clients MUST NOT assume a placement is valid without server authorization.
//
// A tile placement is VALID when ALL of the following conditions hold:
//   1. The tile transform's position is within the canvas bounds (default: minX=-5.2, maxX=5.2, minY=-3.4, maxY=3.4).
//   2. The transformed tile polygon does NOT overlap with any settled tile polygon.
//   3. The transformed tile polygon is NOT penetrating the canvas boundary (edge-to-edge
//      contact is allowed via grout gap tolerance MAX_GROUT_GAP = 0.22).
//
// A tile placement is NEAR-VALID when:
//   - Conditions 1 and 2 hold, but slight boundary penetration exists (< 0.5 unit).
//   - Used for ghost preview to provide soft directional correction without hard rejection.
//
// A tile placement is INVALID when:
//   - Overlap with settled tiles > 0 (penetration depth > 0).
//   - Boundary penetration > 0.5 unit.
//
// ERROR SCENARIOS AND CLIENT HANDLING:
//
// 1. PLACEMENT_REJECTED in place_tile ack (rejected: true)
//    Reason: Tile collides with another settled tile or boundary.
//    Client action: Remove optimistic tile; show "placement invalid" feedback.
//
// 2. SESSION_NOT_FOUND (404 on REST, not sent over Socket.IO)
//    Reason: Session ID does not exist.
//    Client action: Prompt user to create a new session or check session ID.
//
// 3. TILE_NOT_FOUND (404 on REST, not sent over Socket.IO)
//    Reason: Attempted to remove a tile that doesn't exist.
//    Client action: Likely a race condition; reconcile against latest broadcast.
//
// 4. Socket disconnect / reconnection
//    Reason: Network failure or ACA idle timeout (240s).
//    Socket.IO behavior: Automatic reconnection with exponential backoff.
//    Client action: Queue mutations; replay on reconnect. Server sends session_snapshot
//                   on reconnect to sync any missed broadcasts.
//
// 5. INVALID_REQUEST
//    Reason: Malformed payload (e.g., invalid shape enum, missing required field).
//    Client action: Log and alert user; check client version matches SCHEMA_VERSION.
//
// 6. INTERNAL_ERROR
//    Reason: Unexpected server error during validation or state mutation.
//    Client action: Retry after a brief delay; if persistent, alert user and suggest
//                   refreshing the page.

// POST /sessions
export type CreateSessionResponse = {
  session: Session
}

// GET /sessions/:sessionId
export type GetSessionResponse = {
  session: Session
  clients: ClientPresence[]
}

// POST /sessions/:sessionId/tiles
// Uses PlaceTilePayload (request body) and PlaceTileAck (response) — defined
// in the Socket.IO event payload types below, shared between REST and WS.

// ─── Socket.IO event contracts ────────────────────────────────────────────────
//
// Connection: client passes sessionId + clientId in socket.handshake.auth.
// On connect the server calls socket.join(sessionId) and emits session_snapshot
// to the connecting socket.
//
// Broadcast patterns:
//   tile_placed, tile_removed, client_joined, client_left
//     → io.to(sessionId).emit(...)          (all sockets in session room)
//   pointer_update
//     → socket.to(sessionId).emit(...)      (all sockets except sender)
//
// Request/response: place_tile and remove_tile use Socket.IO acknowledgements
// so the calling client gets an inline result without a separate rejection event.
//
// CONCURRENT EDITS — How simultaneous placements are handled:
//
//   1. Client A sends place_tile(tileA_payload).
//   2. Client B sends place_tile(tileB_payload) at the same time (B's client hasn't
//      received tile A yet).
//   3. Server validates both against the CURRENT authoritative state.
//      - If tileA + tileB don't collide, both are valid.
//      - If they do collide, one or both may be rejected in the ack response.
//   4. Client A's ack arrives: { placed: { id: "tile-1", ... }, rejected: false }
//   5. Client B's ack arrives: { placed: { id: "tile-2", ... }, rejected: true }
//   6. Server broadcasts tile_placed(tile-1) to all clients.
//   7. All clients receive the broadcast and converge on the same state.
//
// KEY: Clients provide stable tile IDs. Clients MUST support:
//   - Optimistic local placement (show tiles immediately, even if pending).
//   - Reconciliation on ack (if rejected, remove; if accepted, keep same ID).
//   - Reconciliation on broadcast (merge server's truth if different).
//
// Animation metadata (settleFrom) is CLIENT-ONLY and never sent to or from server.
// The client computes where to animate FROM independently; it's not part of the
// authoritative game state.

// ── Connection handshake ─────────────────────────────────────────────────────

/** Passed in socket.handshake.auth when the client connects. */
export type ConnectionAuth = {
  sessionId: string
  clientId: string
}

/** Per-socket metadata stored by Socket.IO (accessible as socket.data). */
export type SocketData = {
  clientId: string
  sessionId: string
}

// ── Event payload types ───────────────────────────────────────────────────────
// Defined separately from the event maps so client-side TypeScript
// can import individual payload types without taking the full event map.

export type PlaceTilePayload = {
  /**
   * Optional optimistic concurrency precondition.
   *
   * When provided, the server compares this value with the current canvas
   * revision and rejects stale or out-of-order requests.
   *
   * For transport retries of an already-accepted operation, clients can omit
   * this value so idempotent replay logic can return the original opSeq.
   */
  expectedRevision?: number
  tileId: string
  shape: TileShape
  color: string
  material: MaterialVariant
  transform: Transform2D
}

export type PlaceTileRejectReason =
  | 'OUT_OF_BOUNDS'
  | 'OVERLAP'
  | 'GAP_TOO_LARGE'
  | 'PLACEMENT_REJECTED'
  | 'REQUEST_HASH_MISMATCH'
  | 'DUPLICATE_OPERATION'
  | 'STALE_REVISION'
  | 'OUT_OF_ORDER_REVISION'

export type PlaceTileAck =
  | { placed: TileInstance; rejected: false; opSeq: number; idempotent?: boolean }
  | { placed: null; rejected: true; reason: PlaceTileRejectReason }

export type RemoveTileRejectReason =
  | 'TILE_NOT_FOUND'
  | 'REQUEST_HASH_MISMATCH'
  | 'DUPLICATE_OPERATION'
  | 'STALE_REVISION'
  | 'OUT_OF_ORDER_REVISION'

export type RemoveTilePayload = {
  /**
   * Optional optimistic concurrency precondition. See PlaceTilePayload for
   * replay semantics when retried operations need deterministic acknowledgements.
   */
  expectedRevision?: number
  tileId: string
}

export type RemoveTileAck =
  | { removed: true; opSeq: number; idempotent?: boolean }
  | { removed: false; reason?: RemoveTileRejectReason }

export type PointerMovePayload = {
  position: Vec2
}

export type SessionSnapshotPayload = {
  session: Session
  clients: ClientPresence[]
  lastOpSeq: number
}

export type TilePlacedPayload = {
  tile: TileInstance
  placedBy: string
  opSeq: number
}

export type TileRemovedPayload = {
  tileId: string
  removedBy: string
  opSeq: number
}

export type PointerUpdatePayload = {
  clientId: string
  position: Vec2
}

export type ClientJoinedPayload = {
  client: ClientPresence
}

export type ClientLeftPayload = {
  clientId: string
}

// ── Typed event maps ──────────────────────────────────────────────────────────
// Pass these to Server<C, S, I, D> and Socket<C, S, I, D>.

/** Events emitted by the client, received by the server. */
export interface ClientToServerEvents {
  /** Place a tile; server validates and responds via acknowledgement. */
  place_tile: (payload: PlaceTilePayload, ack: (response: PlaceTileAck) => void) => void
  /** Remove by authoritative tileId; server responds via acknowledgement. */
  remove_tile: (payload: RemoveTilePayload, ack: (response: RemoveTileAck) => void) => void
  /** Fire-and-forget cursor position for collaborative presence. */
  pointer_move: (payload: PointerMovePayload) => void
}

/** Events emitted by the server, received by clients. */
export interface ServerToClientEvents {
  /** Sent once to the connecting socket after it joins the session room. */
  session_snapshot: (payload: SessionSnapshotPayload) => void
  /** Broadcast to all sockets in the session room when a tile is placed. */
  tile_placed: (payload: TilePlacedPayload) => void
  /** Broadcast to all sockets in the session room when a tile is removed. */
  tile_removed: (payload: TileRemovedPayload) => void
  /** Broadcast to all sockets in the session room except the sender. */
  pointer_update: (payload: PointerUpdatePayload) => void
  /** Broadcast to all sockets in the session room when a peer connects. */
  client_joined: (payload: ClientJoinedPayload) => void
  /** Broadcast to all sockets in the session room when a peer disconnects. */
  client_left: (payload: ClientLeftPayload) => void
}

/** Reserved for the Socket.IO Postgres adapter (multi-server state sync). */
export interface InterServerEvents {}

// ─── FORMAL AGREEMENT ────────────────────────────────────────────────────────
//
// This section documents what BOTH client and server teams commit to.
// Any future changes to this contract MUST be reviewed and approved by both teams.
//
// CLIENT TEAM COMMITS TO:
//   ✓ Using SCHEMA_VERSION to detect compatibility issues.
//   ✓ Implementing optimistic placement (show tiles before server ack).
//   ✓ Handling place_tile ack responses correctly (accept/reject, use server ID).
//   ✓ Reconciling state when tile_placed / tile_removed broadcasts arrive.
//   ✓ Merging session_snapshot after reconnection (ground truth sync).
//   ✓ Handling all error codes in ApiError and all rejection reasons in PlaceTileAck.
//
// SERVER TEAM COMMITS TO:
//   ✓ Assigning tile IDs server-side; never trusting client-provided IDs.
//   ✓ Validating every placement against the current authoritative state using the
//     domain engine (placementSolver with SAT collision detection).
//   ✓ Responding to place_tile with either accepted (placed: TileInstance) or
//     rejected (reason: string) within the ack callback.
//   ✓ Broadcasting tile_placed / tile_removed / pointer_update to all affected clients.
//   ✓ Sending session_snapshot on connection and after reconnection.
//   ✓ Using consistent error codes and messages as defined in ApiError.
//   ✓ Maintaining a single authoritative Session.tiles array; clients are never the source of truth.
//
// CONCURRENT EDIT HANDLING (BOTH TEAMS):
//   ✓ Server validates each placement against the CURRENT state at that moment.
//   ✓ If two placements conflict, the server responds with accepted/rejected based on
//     the order received and current state.
//   ✓ Clients receive authoritative broadcasts and reconcile locally stored state.
//   ✓ Conflict resolution is deterministic (first-write-wins on the server).
//
// VERSIONING:
//   ✓ If the contract changes, SCHEMA_VERSION MUST increment.
//   ✓ Breaking changes: new required fields, removed events, renamed event names, changed error codes.
//   ✓ Non-breaking changes: new optional fields, new events, new error codes (old clients still work).
//   ✓ Client SHOULD warn if server schema version does not match; server SHOULD enforce minimum version.

