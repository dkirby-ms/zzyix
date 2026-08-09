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
export const SCHEMA_VERSION = '2.0.0'
export const RUNTIME_CHUNK_WORLD_SIZE = 8
export const QUILT_PROTOCOL_VERSION = 2

// ─── Domain primitives ────────────────────────────────────────────────────────

export type Vec2 = { x: number; y: number }

export type TileShape =
  | 'square'
  | 'triangle'
  | 'rectangle'
  | 'l-shape'
  | 'large-square'
  | 'circle'
  | 'right-triangle'
  | 'large-right-triangle'

export type MaterialVariant = 'ceramic' | 'glass' | 'stone'

export type Transform2D = {
  position: Vec2
  rotation: number
  mirrored?: boolean
}

export type MosaicBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export const DEFAULT_BOUNDED_WORLD_BOUNDS: MosaicBounds = {
  minX: -5.2,
  maxX: 5.2,
  minY: -3.4,
  maxY: 3.4,
}

export type BoundsPolicy =
  | {
      mode: 'bounded'
      bounds: MosaicBounds
    }
  | {
      mode: 'unbounded'
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
  placedBy?: string
}

export type ClientPresence = {
  clientId: string
  joinedAt: number
  pointer?: Vec2
}

// ─── Validation Rules ─────────────────────────────────────────────────────────
// These rules are enforced by the server's domain engine (placementSolver).
// Clients MUST NOT assume a placement is valid without server authorization.
//
// A tile placement is VALID when ALL of the following conditions hold:
//   1. The tile transform's position is within the canvas bounds (default: minX=-5.2, maxX=5.2, minY=-3.4, maxY=3.4).
//   2. The transformed tile polygon does NOT overlap with any settled tile polygon.
// Tiles may be placed at any distance from settled tiles.
//
// A tile placement is NEAR-VALID when:
//   - Conditions 1 and 2 hold, but slight boundary penetration exists (< 0.22 unit).
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
// 2. TILE_NOT_FOUND
//    Reason: Attempted to remove a tile that doesn't exist.
//    Client action: Likely a race condition; reconcile against latest broadcast.
//
// 3. Socket disconnect / reconnection
//    Reason: Network failure or ACA idle timeout (240s).
//    Socket.IO behavior: Automatic reconnection with exponential backoff.
//    Client action: Resubscribe with patch cursors to recover missed operations.
//
// 4. INVALID_REQUEST
//    Reason: Malformed payload (e.g., invalid shape enum, missing required field).
//    Client action: Log and alert user; check client version matches SCHEMA_VERSION.
//
// 5. INTERNAL_ERROR
//    Reason: Unexpected server error during validation or state mutation.
//    Client action: Retry after a brief delay; if persistent, alert user and suggest
//                   refreshing the page.

export type SafePrincipalProfile = {
  displayName?: string
  email?: string
}

export type PrincipalCommandAvailability = {
  claimPatch: boolean
  createTransfer: boolean
  acceptTransfer: boolean
  cancelTransfer: boolean
  abandonPatch: boolean
  requestAccountDeletion: boolean
  recoverAccount: boolean
}

export type MeResponse = {
  profile: SafePrincipalProfile
  commands: PrincipalCommandAvailability
}

export type SafeApiError = {
  code: string
  message: string
  requestId: string
  retryAfterSeconds?: number
}

export type ClientUpgradeRequiredError = SafeApiError & {
  code: 'client_upgrade_required'
  minimumSchemaVersion: typeof SCHEMA_VERSION
  minimumProtocolVersion: typeof QUILT_PROTOCOL_VERSION
}

export type CanonicalWorldDescriptor = {
  quiltId: string
  legacyCanvasId: string
  topology: 'toroidal'
  protocolVersion: 2
  patchRows: number
  patchColumns: number
  patchWidth: number
  patchHeight: number
  originX: number
  originY: number
  generation: number
  initialPatch: {
    id: string
    row: number
    column: number
  }
}

export type CanonicalWorldEntryDescriptor = CanonicalWorldDescriptor & {
  entryAttemptId: string
  assignedPatch: {
    id: string
    row: number
    column: number
  }
}

export type CanonicalWorldUnavailableError = SafeApiError & {
  code: 'canonical_world_unavailable'
  retryAfterSeconds: 30
}

export type CanonicalPatchNavigation = {
  quiltId: string
  patchId: string
  row: number
  column: number
  centerX: number
  centerY: number
}

export type EligibleCanonicalPatchesResponse = {
  quiltId: string
  generation: number
  claimAllowed: boolean
  patches: CanonicalPatchNavigation[]
}

export type QuiltOccupancyChunk = {
  chunkId: ChunkId
  tileCount: number
}

export type QuiltOccupancyResponse = {
  quiltId: string
  chunks: QuiltOccupancyChunk[]
}

export type OwnershipOperationRequest = {
  operationId: string
}

export type ClaimPatchRequest = OwnershipOperationRequest & {
  patchId: string
}

export type CreateOwnershipTransferRequest = OwnershipOperationRequest & {
  patchId: string
  recipientPrincipalId: string
}

export type ResolveOwnershipTransferRequest = OwnershipOperationRequest & {
  transferId: string
}

export type AbandonPatchRequest = OwnershipOperationRequest & {
  patchId: string
}

export type OwnershipCommandResponse = {
  status: 'succeeded' | 'denied'
  idempotent: boolean
  transferId?: string
  revision?: number
}

export type AccountDeletionRequest = OwnershipOperationRequest

export type AccountDeletionResponse = {
  status: 'deletion_pending' | 'active'
  idempotent: boolean
  recoveryDeadline?: string
}

// ─── Socket.IO event contracts ────────────────────────────────────────────────
//
// Clients identify the canonical quilt during the authenticated handshake. Room
// membership is derived from authorized patch subscriptions.
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
  token: string
  quiltId: string
  clientId: string
  schemaVersion: typeof SCHEMA_VERSION
  protocolVersion: typeof QUILT_PROTOCOL_VERSION
  canonicalGeneration: number
  entryAttemptId: string
  lineageAttemptId?: string
}

/** Per-socket metadata stored by Socket.IO (accessible as socket.data). */
export type SocketData = {
  clientId: string
  quiltId: string
  schemaVersion: typeof SCHEMA_VERSION
  protocolVersion: typeof QUILT_PROTOCOL_VERSION
  canonicalGeneration: number
  entryAttemptId: string
  lineageAttemptId: string
  reconnectCycleLineageId?: string
  principalId: string
  tokenExpiresAt: number
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
  | { placed: TileInstance; rejected: false; opSeq: number; newRevision: number; idempotent?: boolean }
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
  | { removed: true; opSeq: number; newRevision: number; idempotent?: boolean }
  | { removed: false; reason?: RemoveTileRejectReason }

export type QuiltPatchRevisionMap = Record<string, number>

export type QuiltMutationRejectCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'MUTATION_DISABLED'
  | 'UNAUTHORIZED'
  | 'STALE_REVISION'
  | 'COLLISION'
  | 'INVALID_FOOTPRINT'
  | 'THROTTLED'
  | 'RESOURCE_UNAVAILABLE'

export type QuiltPlaceTileRequest = {
  quiltId: string
  operationId: string
  expectedPatchRevisions: QuiltPatchRevisionMap
  tile: Omit<PlaceTilePayload, 'expectedRevision'>
}

export type QuiltRemoveTileRequest = {
  quiltId: string
  operationId: string
  expectedPatchRevisions: QuiltPatchRevisionMap
  tileId: string
}

export type QuiltMutationAcceptedAck = {
  status: 'accepted'
  operationId: string
  eventIds: Record<string, string>
  patchRevisions: QuiltPatchRevisionMap
  idempotent: boolean
}

export type QuiltMutationRejectedAck = {
  status: 'rejected'
  operationId: string
  code: QuiltMutationRejectCode
  message: string
  requestId: string
  retryAfterSeconds?: number
}

export type QuiltPlaceTileAck =
  | (QuiltMutationAcceptedAck & { tile: TileInstance })
  | QuiltMutationRejectedAck

export type QuiltRemoveTileAck = QuiltMutationAcceptedAck | QuiltMutationRejectedAck

export type TilePlacedPayload = {
  tile: TileInstance
  placedBy: string
  opSeq: number
  revision: number
}

export type TileRemovedPayload = {
  tileId: string
  removedBy: string
  opSeq: number
  revision: number
}

export type ClientJoinedPayload = {
  client: ClientPresence
}

export type ClientLeftPayload = {
  clientId: string
}

export type ChunkId = `${number}:${number}`

export type ChunkPayloadMode = 'fine' | 'aggregate'

export type ChunkCursor = {
  opSeq: number
  revision: number
}

export type ChunkSnapshotEntry = {
  chunkId: ChunkId
  tiles: TileInstance[]
  aggregate?: {
    tileCount: number
    byShape: Partial<Record<TileShape, number>>
    byMaterial: Partial<Record<MaterialVariant, number>>
  }
  opSeq: number
  revision: number
}

export type QuiltTopologyHandshake = {
  quiltId: string
  topology: 'bounded' | 'toroidal'
  patchRows: number
  patchColumns: number
  patchWidth: number
  patchHeight: number
}

export type QuiltProtocolLimits = {
  maxRoomsPerConnection: number
  maxRoomsPerRequest: number
  maxChunksPerRequest: number
  maxRoomChurnPerMinute: number
  maxSnapshotTiles: number
  maxPayloadBytes: number
  source: 'canary-default' | 'measured'
}

export type QuiltProtocolHandshake = {
  selectedProtocolVersion: 1 | 2
  v1CompatibilityEnabled: boolean
  mutationEnabled: boolean
  ownershipIdentity?: string
  canaryTelemetryEnabled?: boolean
  topology?: QuiltTopologyHandshake
  limits?: QuiltProtocolLimits
}

export type QuiltClientRuntimeMetrics = {
  sampleId: string
  entryAttemptId: string
  canonicalGeneration: number
  quiltId: string
  retainedPatchCount: number
  retainedTileCount: number
  sceneObjectCount: number
  drawCalls: number
  frameTimeMs: number
}

export type CanonicalClientTelemetry =
  | { name: 'canonical_entry'; outcome: 'ready' | 'discovery_failed' | 'protocol_rejected' | 'connection_failed' | 'initial_sync_failed'; durationMs: number; selectedProtocolVersion?: 1 | 2 }
  | { name: 'canonical_reconnect'; outcome: 'recovered' | 'exhausted'; durationMs: number; attempts: number }
  | { name: 'canonical_resubscribe'; outcome: 'completed' | 'failed'; durationMs: number; requestedRooms: number; acceptedRooms: number; rejectedRooms: number; resyncRequired: number }

export type QuiltRoomKind = 'fine' | 'aggregate' | 'presence' | 'events'

export type QuiltRoomRequest = {
  requestId: string
  kind: QuiltRoomKind
  row: number
  column: number
  chunkIds?: ChunkId[]
}

export type QuiltPatchCursor = {
  patchId: string
  opSeq: number
  revision: number
  eventId?: string
  chunkIds?: ChunkId[]
}

export type QuiltRoomOutcome =
  | { requestId: string; status: 'accepted'; canonicalRoomId: string; cursor?: QuiltPatchCursor }
  | { requestId: string; status: 'forbidden' | 'invalid' | 'budget-exceeded'; reason: string }

export type SubscribeQuiltAreaPayload = {
  quiltId: string
  rooms: QuiltRoomRequest[]
  cursors?: Record<string, QuiltPatchCursor>
}

export type SubscribeQuiltAreaAck = {
  outcomes: QuiltRoomOutcome[]
  acceptedCursors: Record<string, QuiltPatchCursor>
}

export type QuiltScopedStatePayload = {
  quiltId: string
  canonicalRoomId: string
  patchId: string
  payloadMode: ChunkPayloadMode
  chunkIds: ChunkId[]
  tiles: TileInstance[]
  aggregates?: Array<Pick<ChunkSnapshotEntry, 'chunkId' | 'aggregate'>>
  cursor: QuiltPatchCursor
}

export type QuiltPatchEventPayload = {
  quiltId: string
  canonicalRoomId: string
  patchId: string
  eventId: string
  opSeq: number
  revision: number
  operation: TilePlacedPayload | TileRemovedPayload
  testAttachment?: string
}

export type QuiltPatchResyncRequiredPayload = {
  quiltId: string
  canonicalRoomId: string
  patchId: string
  cursor: QuiltPatchCursor
  reason: 'EVENT_GAP' | 'CURSOR_AHEAD' | 'SNAPSHOT_REQUIRED'
}

// ── Resident domain and event contracts ─────────────────────────────────────

export const RESIDENT_SCHEMA_VERSION = 1 as const

export const residentMemoryClassificationValues = ['creative', 'sensitive'] as const
export type ResidentMemoryClassification = (typeof residentMemoryClassificationValues)[number]

export const residentRetentionTierValues = ['ephemeral', 'short_lived', 'long_lived'] as const
export type ResidentRetentionTier = (typeof residentRetentionTierValues)[number]

export const residentDeletionScopeValues = ['record', 'principal', 'quilt'] as const
export type ResidentDeletionScope = (typeof residentDeletionScopeValues)[number]

export const residentTransportBoundaryValues = ['runtime_internal', 'server_control_plane', 'client_visible'] as const
export type ResidentTransportBoundary = (typeof residentTransportBoundaryValues)[number]

export const DEFAULT_RESIDENT_CREATIVE_MEMORY_RETENTION_TIER: ResidentRetentionTier = 'short_lived'
export const DEFAULT_RESIDENT_CREATIVE_MEMORY_DELETION_SCOPE: ResidentDeletionScope = 'principal'
export const DEFAULT_RESIDENT_CREATIVE_MEMORY_TRANSPORT_BOUNDARIES = [
  'runtime_internal',
  'server_control_plane',
] as const satisfies readonly Exclude<ResidentTransportBoundary, 'client_visible'>[]

/**
 * Creative memory can be persisted only after an explicit policy decision.
 * Sensitive memory is never persisted and remains runtime-only.
 */
export type ResidentMemoryPolicy =
  | {
      classification: 'creative'
      persistence: 'allowed'
      retentionTier: ResidentRetentionTier
      deletionScope: ResidentDeletionScope
      transport: Exclude<ResidentTransportBoundary, 'client_visible'>
    }
  | {
      classification: 'sensitive'
      persistence: 'forbidden'
      retentionTier: 'ephemeral'
      deletionScope: 'record'
      transport: 'runtime_internal'
    }

export const SENSITIVE_MEMORY_POLICY: Extract<ResidentMemoryPolicy, { classification: 'sensitive' }> = {
  classification: 'sensitive',
  persistence: 'forbidden',
  retentionTier: 'ephemeral',
  deletionScope: 'record',
  transport: 'runtime_internal',
}

export const defaultCreativeMemoryPolicy = (): Extract<ResidentMemoryPolicy, { classification: 'creative' }> => ({
  classification: 'creative',
  persistence: 'allowed',
  retentionTier: DEFAULT_RESIDENT_CREATIVE_MEMORY_RETENTION_TIER,
  deletionScope: DEFAULT_RESIDENT_CREATIVE_MEMORY_DELETION_SCOPE,
  transport: DEFAULT_RESIDENT_CREATIVE_MEMORY_TRANSPORT_BOUNDARIES[1],
})

export const residentEventTypeValues = [
  'worker_trigger_claimed',
  'worker_lease_unavailable',
  'worker_checkpoint_recovered',
  'worker_checkpoint_committed',
  'worker_lease_lost',
  'worker_run_completed',
  'worker_run_failed',
  'worker_tool_call',
  'worker_tool_failure',
] as const
export type ResidentEventType = (typeof residentEventTypeValues)[number]

export type ResidentEventEnvelope = {
  schemaVersion: typeof RESIDENT_SCHEMA_VERSION
  eventType: ResidentEventType
  occurredAt: string
  quiltId: string
  runId?: string
  triggerId?: string
  payload?: Record<string, unknown>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isEnumValue = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === 'string' && values.includes(value as T[number])

export const isResidentMemoryPolicy = (value: unknown): value is ResidentMemoryPolicy => {
  if (!isRecord(value)) return false
  if (!isEnumValue(residentMemoryClassificationValues, value.classification)) return false
  if (value.classification === 'creative') {
    return value.persistence === 'allowed'
      && isEnumValue(residentRetentionTierValues, value.retentionTier)
      && isEnumValue(residentDeletionScopeValues, value.deletionScope)
      && isEnumValue(['runtime_internal', 'server_control_plane'] as const, value.transport)
  }
  return value.persistence === 'forbidden'
    && value.retentionTier === 'ephemeral'
    && value.deletionScope === 'record'
    && value.transport === 'runtime_internal'
}

export const isResidentEventEnvelope = (value: unknown): value is ResidentEventEnvelope => {
  if (!isRecord(value)) return false
  if (value.schemaVersion !== RESIDENT_SCHEMA_VERSION) return false
  if (!isEnumValue(residentEventTypeValues, value.eventType)) return false
  if (typeof value.occurredAt !== 'string' || value.occurredAt.length === 0) return false
  if (typeof value.quiltId !== 'string' || value.quiltId.length === 0) return false
  if (value.runId !== undefined && typeof value.runId !== 'string') return false
  if (value.triggerId !== undefined && typeof value.triggerId !== 'string') return false
  if (value.payload !== undefined && !isRecord(value.payload)) return false
  return true
}

// ── Typed event maps ──────────────────────────────────────────────────────────
// Pass these to Server<C, S, I, D> and Socket<C, S, I, D>.

/** Events emitted by the client, received by the server. */
export interface ClientToServerEvents {
  /** Place a canonical quilt tile through the authenticated protocol-v2 transaction. */
  quilt_place_tile: (payload: QuiltPlaceTileRequest, ack: (response: QuiltPlaceTileAck) => void) => void
  /** Remove a canonical quilt tile through the authenticated protocol-v2 transaction. */
  quilt_remove_tile: (payload: QuiltRemoveTileRequest, ack: (response: QuiltRemoveTileAck) => void) => void
  /** Subscribe to authorized protocol-v2 quilt rooms and reconcile patch cursors. */
  subscribe_quilt_area: (payload: SubscribeQuiltAreaPayload, ack: (response: SubscribeQuiltAreaAck) => void) => void
  /** Submit sampled client runtime measurements for an authenticated canary subject. */
  quilt_client_runtime_metrics: (payload: QuiltClientRuntimeMetrics) => void
  /** Submit one canonical entry/reconnect/resubscribe terminal for server-owned telemetry. */
  canonical_telemetry: (payload: CanonicalClientTelemetry) => void
}

/** Events emitted by the server, received by clients. */
export interface ServerToClientEvents {
  /** Rotates the principal-bound lineage used to authorize later reconnect cycles. */
  canonical_lineage: (payload: { lineageAttemptId: string }) => void
  /** Announces the selected transport protocol and immutable quilt topology. */
  quilt_protocol: (payload: QuiltProtocolHandshake) => void
  /** Announces a principal's first active presence lease in the canonical quilt. */
  client_joined: (payload: ClientJoinedPayload) => void
  /** Announces release of a principal's final active presence lease. */
  client_left: (payload: ClientLeftPayload) => void
  /** Reconstructable protocol-v2 snapshot scoped to one accepted room. */
  quilt_patch_state: (payload: QuiltScopedStatePayload) => void
  /** Durable protocol-v2 event scoped to one accepted room. */
  quilt_patch_event: (payload: QuiltPatchEventPayload) => void
  /** Requests cursor-based recovery for one accepted room. */
  quilt_patch_resync_required: (payload: QuiltPatchResyncRequiredPayload) => void
}

/** Reserved for the Socket.IO Postgres adapter (multi-server state sync). */
export interface InterServerEvents {}
