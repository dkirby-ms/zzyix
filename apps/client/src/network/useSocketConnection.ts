import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import type {
  ClientJoinedPayload,
  ClientLeftPayload,
  ClientToServerEvents,
  PointerUpdatePayload,
  SelectionUpdatePayload,
  ServerToClientEvents,
  ResyncRequiredPayload,
  SessionSnapshotPayload,
  TilePlacedPayload,
  TileRemovedPayload,
  ChunkSnapshotPayload,
  ChunkTilePlacedPayload,
  ChunkTileRemovedPayload,
  ChunkResyncRequiredPayload,
  QuiltPatchEventPayload,
  QuiltPatchResyncRequiredPayload,
  QuiltProtocolHandshake,
  QuiltScopedSnapshotPayload,
  CanonicalWorldDescriptor,
  CanonicalClientTelemetry,
} from '../../../server/src/contracts'
import { SCHEMA_VERSION } from '../../../server/src/contracts'
import { isInteractionRequiredError, type AccessTokenProvider, type AuthLossReason } from './authenticatedFetch'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export const useSocketConnection = (
  serverUrl: string,
  canonicalWorld: CanonicalWorldDescriptor | string | null,
  clientId: string,
  onSnapshot: (payload: SessionSnapshotPayload) => void,
  onTilePlaced: (payload: TilePlacedPayload) => void,
  onTileRemoved: (payload: TileRemovedPayload) => void,
  onResyncRequired?: (payload: ResyncRequiredPayload) => void,
  socketActionRef?: React.MutableRefObject<AppSocket | null>,
  onPointerUpdate?: (payload: PointerUpdatePayload) => void,
  onClientJoined?: (payload: ClientJoinedPayload) => void,
  onClientLeft?: (payload: ClientLeftPayload) => void,
  onSelectionUpdate?: (payload: SelectionUpdatePayload) => void,
  onChunkSnapshot?: (payload: ChunkSnapshotPayload) => void,
  onChunkTilePlaced?: (payload: ChunkTilePlacedPayload) => void,
  onChunkTileRemoved?: (payload: ChunkTileRemovedPayload) => void,
  onChunkResyncRequired?: (payload: ChunkResyncRequiredPayload) => void,
  enableChunkStreaming: boolean = true,
  onQuiltProtocol?: (payload: QuiltProtocolHandshake) => void,
  onQuiltPatchSnapshot?: (payload: QuiltScopedSnapshotPayload) => void,
  onQuiltPatchEvent?: (payload: QuiltPatchEventPayload) => void,
  onQuiltPatchResyncRequired?: (payload: QuiltPatchResyncRequiredPayload) => void,
  acquireAccessToken?: AccessTokenProvider,
  onAuthLoss?: (reason: AuthLossReason, error?: unknown) => void,
  expectedProtocolV2: boolean = false,
  onProtocolMismatch?: () => void,
  onConnectionEpoch?: (epoch: number) => void,
  entryAttemptId: string = crypto.randomUUID(),
): React.MutableRefObject<AppSocket | null> => {
  const socketRef = useRef<AppSocket | null>(null)

  useEffect(() => {
    if (!canonicalWorld || !acquireAccessToken) return
    const quiltId = typeof canonicalWorld === 'string' ? canonicalWorld : canonicalWorld.quiltId
    const canonicalGeneration = typeof canonicalWorld === 'string' ? 1 : canonicalWorld.generation

    let cancelled = false
    let renewalAttempted = false
    let renewal: Promise<void> | null = null
    let connectionEpoch = 0
    const entryStartedAt = performance.now()
    let entryReported = false
    let disconnectedAt: number | null = null
    let reconnectAttempts = 0

    const socket: AppSocket = io(serverUrl, {
      autoConnect: false,
      auth: async (callback) => {
        try {
          const token = await acquireAccessToken()
          callback({
            token,
            quiltId,
            clientId,
            schemaVersion: SCHEMA_VERSION,
            protocolVersion: 2,
            canonicalGeneration,
            entryAttemptId,
          })
        } catch (error) {
          onAuthLoss?.(isInteractionRequiredError(error) ? 'interaction_required' : 'authentication_failed', error)
        }
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      randomizationFactor: 0.25,
    })

    const deliverTerminal = async (payload: CanonicalClientTelemetry): Promise<void> => {
      if (socket.connected) {
        socket.emit('canonical_telemetry', payload)
        return
      }
      try {
        const token = await acquireAccessToken()
        await fetch(new URL('/quilts/canonical/telemetry', serverUrl || location.origin), {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'x-canonical-attempt-id': entryAttemptId,
          },
          body: JSON.stringify(payload),
          keepalive: true,
        })
      } catch {
        // The server also records every failure it can observe during authentication and initialization.
      }
    }

    const renewAndReconnect = (error?: unknown): void => {
      if (renewal) return
      if (renewalAttempted) {
        onAuthLoss?.('authentication_failed', error)
        return
      }

      renewalAttempted = true
      renewal = acquireAccessToken({ forceRefresh: true })
        .then(() => {
          if (!cancelled) socket.connect()
        })
        .catch((renewalError) => {
          if (!cancelled) {
            onAuthLoss?.(
              isInteractionRequiredError(renewalError) ? 'interaction_required' : 'authentication_failed',
              renewalError,
            )
          }
        })
        .finally(() => { renewal = null })
    }

    socket.on('connect', () => {
      renewalAttempted = false
      connectionEpoch += 1
      if (disconnectedAt !== null) {
        socket.emit('canonical_telemetry', {
          name: 'canonical_reconnect',
          outcome: 'recovered',
          durationMs: performance.now() - disconnectedAt,
          attempts: Math.max(1, reconnectAttempts),
        })
        disconnectedAt = null
        reconnectAttempts = 0
      }
      onConnectionEpoch?.(connectionEpoch)
      console.log('✅ Socket.IO connected:', { quiltId, socketId: socket.id })
    })

    socket.on('connect_error', (error: Error & { data?: { code?: string } }) => {
      console.error('❌ Socket.IO connection error:', error.message)
      const code = error.data?.code
      if (code === 'authentication_required' || code === 'invalid_token') {
        renewAndReconnect(error)
      } else if (code === 'principal_inactive' || code === 'insufficient_scope') {
        onAuthLoss?.('authentication_failed', error)
      } else if (!entryReported) {
        entryReported = true
        void deliverTerminal({
          name: 'canonical_entry',
          outcome: 'connection_failed',
          durationMs: performance.now() - entryStartedAt,
        })
      }
    })

    socket.on('disconnect', (reason: string) => {
      disconnectedAt = performance.now()
      reconnectAttempts = 0
      console.log('🔌 Socket.IO disconnected:', reason)
      if (reason === 'io server disconnect') renewAndReconnect(new Error('Socket authentication expired'))
    })

    const handleReconnectAttempt = (): void => {
      reconnectAttempts += 1
    }
    const handleReconnectFailed = (): void => {
      if (disconnectedAt === null) return
      void deliverTerminal({
        name: 'canonical_reconnect',
        outcome: 'exhausted',
        durationMs: performance.now() - disconnectedAt,
        attempts: reconnectAttempts,
      })
      disconnectedAt = null
      reconnectAttempts = 0
    }
    socket.io.on('reconnect_attempt', handleReconnectAttempt)
    socket.io.on('reconnect_failed', handleReconnectFailed)

    const handleProtocol = (payload: QuiltProtocolHandshake): void => {
      if (expectedProtocolV2 && (payload.selectedProtocolVersion !== 2 || !payload.topology)) {
        if (!entryReported) {
          entryReported = true
          socket.emit('canonical_telemetry', {
            name: 'canonical_entry',
            outcome: 'protocol_rejected',
            durationMs: performance.now() - entryStartedAt,
            selectedProtocolVersion: payload.selectedProtocolVersion,
          })
        }
        socket.disconnect()
        onProtocolMismatch?.()
        return
      }
      if (!entryReported && payload.selectedProtocolVersion === 2 && payload.topology) {
        entryReported = true
        socket.emit('canonical_telemetry', {
          name: 'canonical_entry',
          outcome: 'ready',
          durationMs: performance.now() - entryStartedAt,
          selectedProtocolVersion: 2,
        })
      }
      onQuiltProtocol?.(payload)
    }
    socket.on('quilt_protocol', handleProtocol)
    if (onQuiltPatchSnapshot) socket.on('quilt_patch_snapshot', onQuiltPatchSnapshot)
    if (onQuiltPatchEvent) socket.on('quilt_patch_event', onQuiltPatchEvent)
    if (onQuiltPatchResyncRequired) socket.on('quilt_patch_resync_required', onQuiltPatchResyncRequired)
    if (onClientJoined) {
      socket.on('client_joined', onClientJoined)
    }
    if (onClientLeft) {
      socket.on('client_left', onClientLeft)
    }

    socketRef.current = socket
    if (socketActionRef) {
      socketActionRef.current = socket
    }
    socket.connect()

    return () => {
      cancelled = true
      socket.off('quilt_protocol', handleProtocol)
      if (onQuiltPatchSnapshot) socket.off('quilt_patch_snapshot', onQuiltPatchSnapshot)
      if (onQuiltPatchEvent) socket.off('quilt_patch_event', onQuiltPatchEvent)
      if (onQuiltPatchResyncRequired) socket.off('quilt_patch_resync_required', onQuiltPatchResyncRequired)
      if (onClientJoined) {
        socket.off('client_joined', onClientJoined)
      }
      if (onClientLeft) {
        socket.off('client_left', onClientLeft)
      }
      socket.io.off('reconnect_attempt', handleReconnectAttempt)
      socket.io.off('reconnect_failed', handleReconnectFailed)
      socket.disconnect()
      socketRef.current = null
      if (socketActionRef) {
        socketActionRef.current = null
      }
    }
  }, [
    serverUrl,
    canonicalWorld,
    clientId,
    onSnapshot,
    onTilePlaced,
    onTileRemoved,
    onResyncRequired,
    socketActionRef,
    onPointerUpdate,
    onClientJoined,
    onClientLeft,
    onSelectionUpdate,
    onChunkSnapshot,
    onChunkTilePlaced,
    onChunkTileRemoved,
    onChunkResyncRequired,
    enableChunkStreaming,
    onQuiltProtocol,
    onQuiltPatchSnapshot,
    onQuiltPatchEvent,
    onQuiltPatchResyncRequired,
    acquireAccessToken,
    onAuthLoss,
    expectedProtocolV2,
    onProtocolMismatch,
    onConnectionEpoch,
    entryAttemptId,
  ])

  return socketRef
}