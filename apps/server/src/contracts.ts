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
// KEY: Server assigns tile IDs. Clients MUST support:
//   - Optimistic local placement (show tiles immediately, even if pending).
//   - Reconciliation on ack (if rejected, remove; if accepted, use server ID).
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
  shape: TileShape
  color: string
  material: MaterialVariant
  transform: Transform2D
}

export type PlaceTileAck =
  | { placed: TileInstance; rejected: false }
  | { placed: null; rejected: true; reason: string }

export type RemoveTilePayload = {
  tileId: string
}

export type RemoveTileAck = {
  removed: boolean
}

export type PointerMovePayload = {
  position: Vec2
}

export type SessionSnapshotPayload = {
  session: Session
  clients: ClientPresence[]
}

export type TilePlacedPayload = {
  tile: TileInstance
  placedBy: string
}

export type TileRemovedPayload = {
  tileId: string
  removedBy: string
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
  /** Remove the last tile; server responds via acknowledgement. */
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

/** Reserved for the Socket.IO Redis adapter (multi-server state sync). */
export interface InterServerEvents {}
