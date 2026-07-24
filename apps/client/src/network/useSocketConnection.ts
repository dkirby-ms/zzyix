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
  ChatMessage,
  ChatReplayPayload,
} from '../../../server/src/contracts'

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
  onChatMessage?: (payload: ChatMessage) => void,
  onChatReplay?: (payload: ChatReplayPayload) => void,
): React.MutableRefObject<AppSocket | null> => {
  const socketRef = useRef<AppSocket | null>(null)

  useEffect(() => {
    if (!sessionId) return

    const socket: AppSocket = io(serverUrl, {
      auth: { sessionId, clientId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    })

    socket.on('connect', () => {
      console.log('✅ Socket.IO connected:', { sessionId: socket.id })
    })

    socket.on('connect_error', (error: Error) => {
      console.error('❌ Socket.IO connection error:', error.message)
    })

    socket.on('disconnect', (reason: string) => {
      console.log('🔌 Socket.IO disconnected:', reason)
    })

    socket.on('session_snapshot', onSnapshot)
    socket.on('tile_placed', onTilePlaced)
    socket.on('tile_removed', onTileRemoved)
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
    if (onChatMessage) {
      socket.on('chat_message', onChatMessage)
    }
    if (onChatReplay) {
      socket.on('chat_replay', onChatReplay)
    }

    socketRef.current = socket
    if (socketActionRef) {
      socketActionRef.current = socket
    }

    return () => {
      socket.off('session_snapshot', onSnapshot)
      socket.off('tile_placed', onTilePlaced)
      socket.off('tile_removed', onTileRemoved)
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
      if (onChatMessage) {
        socket.off('chat_message', onChatMessage)
      }
      if (onChatReplay) {
        socket.off('chat_replay', onChatReplay)
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
    onChatMessage,
    onChatReplay,
  ])

  return socketRef
}