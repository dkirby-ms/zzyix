import { act, renderHook } from '@testing-library/react'
import type { MutableRefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { useConnectionStatus } from './useConnectionStatus'

type EventHandler = (...args: unknown[]) => void
type ConnectionStatusEvent = 'connect' | 'disconnect' | 'connect_error'
type SocketMockFn = Mock<(event: ConnectionStatusEvent, handler: EventHandler) => MockSocket>

type MockSocket = {
  connected: boolean
  on: SocketMockFn
  off: SocketMockFn
}

const createMockSocket = (connected: boolean): MockSocket => {
  const socket = {
    connected,
    on: vi.fn<(event: ConnectionStatusEvent, handler: EventHandler) => MockSocket>(),
    off: vi.fn<(event: ConnectionStatusEvent, handler: EventHandler) => MockSocket>(),
  } satisfies MockSocket

  socket.on.mockImplementation(() => socket)
  socket.off.mockImplementation(() => socket)

  return socket
}

describe('useConnectionStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('updates to connected when socket is attached after initial render', () => {
    const socketRef = { current: null as unknown }
    const socket = createMockSocket(true)

    const { result } = renderHook(() =>
      useConnectionStatus(socketRef as MutableRefObject<MockSocket | null>),
    )

    act(() => {
      socketRef.current = socket
      vi.advanceTimersByTime(250)
    })

    expect(result.current.status).toBe('connected')
    expect(socket.on).toHaveBeenCalledWith('connect', expect.any(Function))
    expect(socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function))
    expect(socket.on).toHaveBeenCalledWith('connect_error', expect.any(Function))
  })

  it('transitions to disconnecting when disconnect event indicates reconnectable drop', () => {
    const socketRef = { current: createMockSocket(true) }

    const { result } = renderHook(() =>
      useConnectionStatus(socketRef as MutableRefObject<MockSocket | null>),
    )

    const registeredDisconnect = socketRef.current.on.mock.calls.find((call) => call[0] === 'disconnect')?.[1] as
      | EventHandler
      | undefined

    expect(registeredDisconnect).toBeDefined()

    act(() => {
      registeredDisconnect?.('transport close')
    })

    expect(result.current.status).toBe('disconnecting')
  })
})
