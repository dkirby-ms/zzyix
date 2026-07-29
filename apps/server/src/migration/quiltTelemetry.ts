export type LegacyQuiltTelemetryEvent = {
  name:
    | 'dual_read_parity'
    | 'patch_lock_wait'
    | 'mutation_latency'
    | 'snapshot_bytes'
    | 'resync'
    | 'room_churn'
    | 'attachment_use'
    | 'pool_wait'
    | 'client_runtime'
  quiltId?: string
  principalId?: string
  canary: boolean
  measurements: Record<string, number>
  dimensions?: Record<string, string | boolean>
  details?: unknown
}

export type CanonicalTelemetryBase = {
  schemaVersion: 1
  eventId: string
  attemptId: string
  occurredAt: string
  quiltId: string
  canonicalGeneration: number
  cohort: 'canary' | 'global'
}

export type CanonicalTelemetryEvent = CanonicalTelemetryBase & (
  | { name: 'canonical_discovery'; outcome: 'success' | 'unavailable' | 'error'; durationMs: number; httpStatus: 200 | 503 | 500; reasonCode?: 'missing' | 'inactive' | 'invalid_target' | 'internal_error' }
  | { name: 'canonical_entry'; outcome: 'ready' | 'discovery_failed' | 'protocol_rejected' | 'connection_failed' | 'initial_sync_failed'; durationMs: number; selectedProtocolVersion?: 1 | 2 }
  | { name: 'canonical_reconnect'; outcome: 'recovered' | 'exhausted'; durationMs: number; attempts: number }
  | { name: 'canonical_resubscribe'; outcome: 'completed' | 'failed'; durationMs: number; requestedRooms: number; acceptedRooms: number; rejectedRooms: number; resyncRequired: number }
  | { name: 'canonical_old_client_rejected'; outcome: 'rejected'; transport: 'http' | 'socket'; requestedSchemaVersion?: string; requestedProtocolVersion?: number }
  | { name: 'canonical_safety'; outcome: 'detected'; code: 'descriptor_leak' | 'target_invalidated'; requestId?: string }
  | { name: 'client_runtime'; outcome: 'sampled'; frameTimeMs: number; retainedPatchCount: number; retainedTileCount: number; sceneObjectCount: number; drawCalls: number }
)

export type QuiltTelemetryEvent = LegacyQuiltTelemetryEvent | CanonicalTelemetryEvent

type QuiltTelemetryObserver = (event: QuiltTelemetryEvent) => void

let observer: QuiltTelemetryObserver | undefined

export const configureQuiltTelemetry = (nextObserver?: QuiltTelemetryObserver): void => {
  observer = nextObserver
}

export const emitQuiltTelemetry = (event: QuiltTelemetryEvent): void => {
  observer?.(event)
}