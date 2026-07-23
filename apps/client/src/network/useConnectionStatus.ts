import { useEffect, useState } from 'react'
import type { MutableRefObject } from 'react'
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error'

export interface ConnectionState {
  status: ConnectionStatus
  lastError?: string
}

type ConnectionStatusEvent = 'connect' | 'disconnect' | 'connect_error'

type ConnectionStatusSocket = {
  connected: boolean
  on: (event: ConnectionStatusEvent, listener: (...args: any[]) => void) => unknown
  off: (event: ConnectionStatusEvent, listener: (...args: any[]) => void) => unknown
}

/**
 * Hook to track Socket.io connection state
 * Pass the socket reference from useSocketConnection
 */
export const useConnectionStatus = (socketRef: MutableRefObject<ConnectionStatusSocket | null>): ConnectionState => {
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
    let activeSocket: ConnectionStatusSocket | null = null

    const handleConnect = () => {
      setConnectionState({ status: 'connected' })
    }

    const handleDisconnect = (reason: string) => {
      if (reason === 'client namespace disconnect') {
        setConnectionState({ status: 'disconnected' })
      } else {
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

    const unbindSocketEvents = (socket: ConnectionStatusSocket): void => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
    }

    const bindSocket = (socket: ConnectionStatusSocket | null): void => {
      if (activeSocket === socket) {
        return
      }

      if (activeSocket) {
        unbindSocketEvents(activeSocket)
      }

      activeSocket = socket

      if (!socket) {
        setConnectionState({ status: 'disconnected' })
        return
      }

      socket.on('connect', handleConnect)
      socket.on('disconnect', handleDisconnect)
      socket.on('connect_error', handleConnectError)

      if (socket.connected) {
        setConnectionState({ status: 'connected' })
      } else {
        setConnectionState({ status: 'connecting' })
      }
    }

    bindSocket(socketRef.current)

    const pollInterval = globalThis.setInterval(() => {
      bindSocket(socketRef.current)
    }, 200)

    return () => {
      globalThis.clearInterval(pollInterval)
      if (activeSocket) {
        unbindSocketEvents(activeSocket)
      }
    }
  }, [socketRef])

  return state
}
