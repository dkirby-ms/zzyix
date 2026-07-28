export type QuiltTelemetryEvent = {
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

type QuiltTelemetryObserver = (event: QuiltTelemetryEvent) => void

let observer: QuiltTelemetryObserver | undefined

export const configureQuiltTelemetry = (nextObserver?: QuiltTelemetryObserver): void => {
  observer = nextObserver
}

export const emitQuiltTelemetry = (event: QuiltTelemetryEvent): void => {
  observer?.(event)
}