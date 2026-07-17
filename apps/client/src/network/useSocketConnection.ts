import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
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
): React.MutableRefObject<AppSocket | null> => {
  const socketRef = useRef<AppSocket | null>(null)

  useEffect(() => {
    if (!sessionId) return

    const socket: AppSocket = io(serverUrl, {
      auth: { sessionId, clientId },
    })

    socket.on('session_snapshot', onSnapshot)
    socket.on('tile_placed', onTilePlaced)
    socket.on('tile_removed', onTileRemoved)

    socketRef.current = socket

    return () => {
      socket.off('session_snapshot', onSnapshot)
      socket.off('tile_placed', onTilePlaced)
      socket.off('tile_removed', onTileRemoved)
      socket.disconnect()
      socketRef.current = null
    }
  }, [serverUrl, sessionId, clientId, onSnapshot, onTilePlaced, onTileRemoved])

  return socketRef
}