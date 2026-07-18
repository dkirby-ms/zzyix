import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ResyncRequiredPayload,
  SessionSnapshotPayload,
  TilePlacedPayload,
  TileRemovedPayload,
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
    if (onResyncRequired) {
      socket.on('resync_required', onResyncRequired)
    }

    socketRef.current = socket
    if (socketActionRef) {
      socketActionRef.current = socket
    }

    return () => {
      socket.off('session_snapshot', onSnapshot)
      socket.off('tile_placed', onTilePlaced)
      socket.off('tile_removed', onTileRemoved)
      if (onResyncRequired) {
        socket.off('resync_required', onResyncRequired)
      }
      socket.disconnect()
      socketRef.current = null
      if (socketActionRef) {
        socketActionRef.current = null
      }
    }
  }, [serverUrl, sessionId, clientId, onSnapshot, onTilePlaced, onTileRemoved, onResyncRequired, socketActionRef])

  return socketRef
}