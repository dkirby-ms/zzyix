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
} from '../../../server/src/contracts'
import { isInteractionRequiredError, type AccessTokenProvider, type AuthLossReason } from './authenticatedFetch'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export const useSocketConnection = (
  serverUrl: string,
  sessionId: string | null,
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
): React.MutableRefObject<AppSocket | null> => {
  const socketRef = useRef<AppSocket | null>(null)
  const selectedProtocolRef = useRef<1 | 2>(2)

  useEffect(() => {
    if (!sessionId || !acquireAccessToken) return

    let cancelled = false
    let renewalAttempted = false
    let renewal: Promise<void> | null = null

    const socket: AppSocket = io(serverUrl, {
      autoConnect: false,
      auth: async (callback) => {
        try {
          const token = await acquireAccessToken()
          callback({ token, sessionId, clientId, protocolVersion: 2, enableProtocolV1Compatibility: false })
        } catch (error) {
          onAuthLoss?.(isInteractionRequiredError(error) ? 'interaction_required' : 'authentication_failed', error)
        }
      },
      transports: ['websocket', 'polling'],
      reconnection: false,
    })

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
      console.log('✅ Socket.IO connected:', { sessionId: socket.id })
    })

    socket.on('connect_error', (error: Error & { data?: { code?: string } }) => {
      console.error('❌ Socket.IO connection error:', error.message)
      const code = error.data?.code
      if (code === 'authentication_required' || code === 'invalid_token') {
        renewAndReconnect(error)
      } else if (code === 'principal_inactive' || code === 'insufficient_scope') {
        onAuthLoss?.('authentication_failed', error)
      }
    })

    socket.on('disconnect', (reason: string) => {
      console.log('🔌 Socket.IO disconnected:', reason)
      if (reason === 'io server disconnect') renewAndReconnect(new Error('Socket authentication expired'))
    })

    const handleProtocol = (payload: QuiltProtocolHandshake): void => {
      selectedProtocolRef.current = payload.selectedProtocolVersion
      onQuiltProtocol?.(payload)
    }
    const handleSnapshot = (payload: SessionSnapshotPayload): void => {
      if (selectedProtocolRef.current === 1) onSnapshot(payload)
    }
    const handleTilePlaced = (payload: TilePlacedPayload): void => {
      if (selectedProtocolRef.current === 1) onTilePlaced(payload)
    }
    const handleTileRemoved = (payload: TileRemovedPayload): void => {
      if (selectedProtocolRef.current === 1) onTileRemoved(payload)
    }

    socket.on('quilt_protocol', handleProtocol)
    socket.on('session_snapshot', handleSnapshot)
    socket.on('tile_placed', handleTilePlaced)
    socket.on('tile_removed', handleTileRemoved)
    if (onQuiltPatchSnapshot) socket.on('quilt_patch_snapshot', onQuiltPatchSnapshot)
    if (onQuiltPatchEvent) socket.on('quilt_patch_event', onQuiltPatchEvent)
    if (onQuiltPatchResyncRequired) socket.on('quilt_patch_resync_required', onQuiltPatchResyncRequired)
    if (onPointerUpdate) {
      socket.on('pointer_update', onPointerUpdate)
    }
    if (onClientJoined) {
      socket.on('client_joined', onClientJoined)
    }
    if (onClientLeft) {
      socket.on('client_left', onClientLeft)
    }
    if (onSelectionUpdate) {
      socket.on('selection_update', onSelectionUpdate)
    }
    if (onResyncRequired) {
      socket.on('resync_required', onResyncRequired)
    }
    if (enableChunkStreaming && onChunkSnapshot) {
      socket.on('chunk_snapshot', onChunkSnapshot)
    }
    if (enableChunkStreaming && onChunkTilePlaced) {
      socket.on('chunk_tile_placed', onChunkTilePlaced)
    }
    if (enableChunkStreaming && onChunkTileRemoved) {
      socket.on('chunk_tile_removed', onChunkTileRemoved)
    }
    if (enableChunkStreaming && onChunkResyncRequired) {
      socket.on('chunk_resync_required', onChunkResyncRequired)
    }

    socketRef.current = socket
    if (socketActionRef) {
      socketActionRef.current = socket
    }
    socket.connect()

    return () => {
      cancelled = true
      socket.off('quilt_protocol', handleProtocol)
      socket.off('session_snapshot', handleSnapshot)
      socket.off('tile_placed', handleTilePlaced)
      socket.off('tile_removed', handleTileRemoved)
      if (onQuiltPatchSnapshot) socket.off('quilt_patch_snapshot', onQuiltPatchSnapshot)
      if (onQuiltPatchEvent) socket.off('quilt_patch_event', onQuiltPatchEvent)
      if (onQuiltPatchResyncRequired) socket.off('quilt_patch_resync_required', onQuiltPatchResyncRequired)
      if (onPointerUpdate) {
        socket.off('pointer_update', onPointerUpdate)
      }
      if (onClientJoined) {
        socket.off('client_joined', onClientJoined)
      }
      if (onClientLeft) {
        socket.off('client_left', onClientLeft)
      }
      if (onSelectionUpdate) {
        socket.off('selection_update', onSelectionUpdate)
      }
      if (onResyncRequired) {
        socket.off('resync_required', onResyncRequired)
      }
      if (enableChunkStreaming && onChunkSnapshot) {
        socket.off('chunk_snapshot', onChunkSnapshot)
      }
      if (enableChunkStreaming && onChunkTilePlaced) {
        socket.off('chunk_tile_placed', onChunkTilePlaced)
      }
      if (enableChunkStreaming && onChunkTileRemoved) {
        socket.off('chunk_tile_removed', onChunkTileRemoved)
      }
      if (enableChunkStreaming && onChunkResyncRequired) {
        socket.off('chunk_resync_required', onChunkResyncRequired)
      }
      socket.disconnect()
      socketRef.current = null
      if (socketActionRef) {
        socketActionRef.current = null
      }
    }
  }, [
    serverUrl,
    sessionId,
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
  ])

  return socketRef
}