import { useEffect, useState } from 'react'
import type { AppSocket } from './useSocketConnection'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error'

export interface ConnectionState {
  status: ConnectionStatus
  lastError?: string
}

/**
 * Hook to track Socket.io connection state
 * Pass the socket reference from useSocketConnection
 */
export const useConnectionStatus = (socketRef: React.MutableRefObject<AppSocket | null>): ConnectionState => {
  const [state, setState] = useState<ConnectionState>({
    status: 'connecting',
  })

  const setConnectionState = (next: ConnectionState): void => {
    setState((previous) => {
      if (previous.status === next.status && previous.lastError === next.lastError) {
        return previous
      }

      return next
    })
  }

  useEffect(() => {
    const socket = socketRef.current
    if (!socket) {
      setConnectionState({ status: 'disconnected' })
      return
    }

    // Track connection events
    const handleConnect = () => {
      setConnectionState({ status: 'connected' })
    }

    const handleDisconnect = (reason: string) => {
      // Check if it's a normal disconnect or an error-based disconnect
      if (reason === 'client namespace disconnect') {
        setConnectionState({ status: 'disconnected' })
      } else {
        // Network error or unexpected disconnect - will try to reconnect
        setConnectionState({ status: 'disconnecting' })
      }
    }

    const handleConnectError = (error: Error | string) => {
      const errorMessage = typeof error === 'string' ? error : error.message
      setConnectionState({
        status: 'error',
        lastError: errorMessage,
      })
    }

    // Socket.io reserved events
    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)

    // Initialize state based on current connection status
    if (socket.connected) {
      setConnectionState({ status: 'connected' })
    } else {
      setConnectionState({ status: 'connecting' })
    }

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
    }
  }, [socketRef])

  return state
}
