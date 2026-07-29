import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSocketConnection } from './useSocketConnection'

const { ioMock } = vi.hoisted(() => ({
  ioMock: vi.fn(),
}))

vi.mock('socket.io-client', () => ({
  io: ioMock,
}))

type MockSocket = {
  id: string
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

const registeredHandler = <T extends (...args: any[]) => any>(socket: MockSocket, eventName: string): T => {
  const call = socket.on.mock.calls.find(([event]) => event === eventName)
  if (!call) throw new Error(`Missing handler for ${eventName}`)
  return call[1] as T
}

const createMockSocket = (): MockSocket => ({
  id: 'socket-1',
  on: vi.fn(),
  off: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
})

const accessTokenProvider = vi.fn(async () => 'access-token')

const renderAuthenticatedSocket = (
  parameters: Parameters<typeof useSocketConnection>,
  acquireAccessToken = accessTokenProvider,
  onAuthLoss = vi.fn(),
) => {
  const paddedParameters: unknown[] = [...parameters]
  while (paddedParameters.length < 21) paddedParameters.push(undefined)
  paddedParameters[21] = acquireAccessToken
  paddedParameters[22] = onAuthLoss
  const invokeHook = useSocketConnection as unknown as (...args: unknown[]) => ReturnType<typeof useSocketConnection>
  return renderHook(() => invokeHook(...paddedParameters))
}

describe('useSocketConnection collaboration subscriptions', () => {
  beforeEach(() => {
    ioMock.mockReset()
    accessTokenProvider.mockReset()
    accessTokenProvider.mockResolvedValue('access-token')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('subscribes collaboration events when callbacks are provided', () => {
    const socket = createMockSocket()
    ioMock.mockReturnValue(socket)

    const callbacks = {
      onSnapshot: vi.fn(),
      onTilePlaced: vi.fn(),
      onTileRemoved: vi.fn(),
      onResyncRequired: vi.fn(),
      onPointerUpdate: vi.fn(),
      onClientJoined: vi.fn(),
      onClientLeft: vi.fn(),
      onSelectionUpdate: vi.fn(),
    }

    renderAuthenticatedSocket([
        'http://localhost:3001',
        'session-1',
        'client-1',
        callbacks.onSnapshot,
        callbacks.onTilePlaced,
        callbacks.onTileRemoved,
        callbacks.onResyncRequired,
        undefined,
        callbacks.onPointerUpdate,
        callbacks.onClientJoined,
        callbacks.onClientLeft,
        callbacks.onSelectionUpdate,
    ])

    expect(ioMock).toHaveBeenCalledTimes(1)
    expect(socket.on).toHaveBeenCalledWith('quilt_protocol', expect.any(Function))
    expect(socket.on).toHaveBeenCalledWith('session_snapshot', expect.any(Function))
    expect(socket.on).toHaveBeenCalledWith('tile_placed', expect.any(Function))
    expect(socket.on).toHaveBeenCalledWith('tile_removed', expect.any(Function))
    expect(socket.on).toHaveBeenCalledWith('resync_required', callbacks.onResyncRequired)
    expect(socket.on).toHaveBeenCalledWith('pointer_update', callbacks.onPointerUpdate)
    expect(socket.on).toHaveBeenCalledWith('client_joined', callbacks.onClientJoined)
    expect(socket.on).toHaveBeenCalledWith('client_left', callbacks.onClientLeft)
    expect(socket.on).toHaveBeenCalledWith('selection_update', callbacks.onSelectionUpdate)
  })

  it('subscribes chunk events when chunk streaming is enabled', () => {
    const socket = createMockSocket()
    ioMock.mockReturnValue(socket)

    const callbacks = {
      onSnapshot: vi.fn(),
      onTilePlaced: vi.fn(),
      onTileRemoved: vi.fn(),
      onChunkSnapshot: vi.fn(),
      onChunkTilePlaced: vi.fn(),
      onChunkTileRemoved: vi.fn(),
      onChunkResyncRequired: vi.fn(),
    }

    renderAuthenticatedSocket([
        'http://localhost:3001',
        'session-1',
        'client-1',
        callbacks.onSnapshot,
        callbacks.onTilePlaced,
        callbacks.onTileRemoved,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        callbacks.onChunkSnapshot,
        callbacks.onChunkTilePlaced,
        callbacks.onChunkTileRemoved,
        callbacks.onChunkResyncRequired,
        true,
    ])

    expect(socket.on).toHaveBeenCalledWith('chunk_snapshot', callbacks.onChunkSnapshot)
    expect(socket.on).toHaveBeenCalledWith('chunk_tile_placed', callbacks.onChunkTilePlaced)
    expect(socket.on).toHaveBeenCalledWith('chunk_tile_removed', callbacks.onChunkTileRemoved)
    expect(socket.on).toHaveBeenCalledWith('chunk_resync_required', callbacks.onChunkResyncRequired)
  })

  it('does not subscribe chunk events when chunk streaming is disabled', () => {
    const socket = createMockSocket()
    ioMock.mockReturnValue(socket)

    const callbacks = {
      onSnapshot: vi.fn(),
      onTilePlaced: vi.fn(),
      onTileRemoved: vi.fn(),
      onChunkSnapshot: vi.fn(),
      onChunkTilePlaced: vi.fn(),
      onChunkTileRemoved: vi.fn(),
      onChunkResyncRequired: vi.fn(),
    }

    renderAuthenticatedSocket([
        'http://localhost:3001',
        'session-1',
        'client-1',
        callbacks.onSnapshot,
        callbacks.onTilePlaced,
        callbacks.onTileRemoved,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        callbacks.onChunkSnapshot,
        callbacks.onChunkTilePlaced,
        callbacks.onChunkTileRemoved,
        callbacks.onChunkResyncRequired,
        false,
    ])

    expect(socket.on).not.toHaveBeenCalledWith('chunk_snapshot', callbacks.onChunkSnapshot)
    expect(socket.on).not.toHaveBeenCalledWith('chunk_tile_placed', callbacks.onChunkTilePlaced)
    expect(socket.on).not.toHaveBeenCalledWith('chunk_tile_removed', callbacks.onChunkTileRemoved)
    expect(socket.on).not.toHaveBeenCalledWith('chunk_resync_required', callbacks.onChunkResyncRequired)
  })

  it('unsubscribes collaboration events and disconnects on cleanup', () => {
    const socket = createMockSocket()
    ioMock.mockReturnValue(socket)

    const callbacks = {
      onSnapshot: vi.fn(),
      onTilePlaced: vi.fn(),
      onTileRemoved: vi.fn(),
      onResyncRequired: vi.fn(),
      onPointerUpdate: vi.fn(),
      onClientJoined: vi.fn(),
      onClientLeft: vi.fn(),
      onSelectionUpdate: vi.fn(),
    }

    const { unmount } = renderAuthenticatedSocket([
        'http://localhost:3001',
        'session-1',
        'client-1',
        callbacks.onSnapshot,
        callbacks.onTilePlaced,
        callbacks.onTileRemoved,
        callbacks.onResyncRequired,
        undefined,
        callbacks.onPointerUpdate,
        callbacks.onClientJoined,
        callbacks.onClientLeft,
        callbacks.onSelectionUpdate,
    ])

    unmount()

    expect(socket.off).toHaveBeenCalledWith('quilt_protocol', expect.any(Function))
    expect(socket.off).toHaveBeenCalledWith('session_snapshot', expect.any(Function))
    expect(socket.off).toHaveBeenCalledWith('tile_placed', expect.any(Function))
    expect(socket.off).toHaveBeenCalledWith('tile_removed', expect.any(Function))
    expect(socket.off).toHaveBeenCalledWith('resync_required', callbacks.onResyncRequired)
    expect(socket.off).toHaveBeenCalledWith('pointer_update', callbacks.onPointerUpdate)
    expect(socket.off).toHaveBeenCalledWith('client_joined', callbacks.onClientJoined)
    expect(socket.off).toHaveBeenCalledWith('client_left', callbacks.onClientLeft)
    expect(socket.off).toHaveBeenCalledWith('selection_update', callbacks.onSelectionUpdate)
    expect(socket.disconnect).toHaveBeenCalledTimes(1)
  })

  it('negotiates v2 and suppresses duplicate v1 durable events unless the server selects v1', () => {
    const socket = createMockSocket()
    ioMock.mockReturnValue(socket)
    const onSnapshot = vi.fn()
    const onTilePlaced = vi.fn()
    const onTileRemoved = vi.fn()

    renderAuthenticatedSocket([
      'http://localhost:3001',
      'session-1',
      'client-1',
      onSnapshot,
      onTilePlaced,
      onTileRemoved,
    ])

    expect(ioMock).toHaveBeenCalledWith('http://localhost:3001', expect.objectContaining({
      auth: expect.any(Function),
      autoConnect: false,
      reconnection: false,
    }))

    const protocol = registeredHandler<(payload: { selectedProtocolVersion: 1 | 2 }) => void>(socket, 'quilt_protocol')
    const snapshot = registeredHandler<(payload: unknown) => void>(socket, 'session_snapshot')
    const placed = registeredHandler<(payload: unknown) => void>(socket, 'tile_placed')
    const removed = registeredHandler<(payload: unknown) => void>(socket, 'tile_removed')

    protocol({ selectedProtocolVersion: 2 })
    snapshot({})
    placed({})
    removed({})
    expect(onSnapshot).not.toHaveBeenCalled()
    expect(onTilePlaced).not.toHaveBeenCalled()
    expect(onTileRemoved).not.toHaveBeenCalled()

    protocol({ selectedProtocolVersion: 1 })
    snapshot({})
    placed({})
    removed({})
    expect(onSnapshot).toHaveBeenCalledTimes(1)
    expect(onTilePlaced).toHaveBeenCalledTimes(1)
    expect(onTileRemoved).toHaveBeenCalledTimes(1)
  })

  it('supplies the current token through Socket.IO auth without putting it in the URL', async () => {
    const socket = createMockSocket()
    ioMock.mockReturnValue(socket)

    renderAuthenticatedSocket([
      'https://api.example.test',
      'session-1',
      'client-1',
      vi.fn(),
      vi.fn(),
      vi.fn(),
    ])

    const options = ioMock.mock.calls[0]?.[1] as { auth: (callback: (auth: Record<string, unknown>) => void) => void }
    const callback = vi.fn()
    await options.auth(callback)

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      token: 'access-token',
      sessionId: 'session-1',
      clientId: 'client-1',
    }))
    expect(ioMock.mock.calls[0]?.[0]).toBe('https://api.example.test')
    expect(ioMock.mock.calls[0]?.[0]).not.toContain('access-token')
  })

  it('forces one renewal and reconnects after an authentication failure', async () => {
    const socket = createMockSocket()
    ioMock.mockReturnValue(socket)
    const acquireAccessToken = vi.fn(async () => 'renewed-token')
    const onAuthLoss = vi.fn()

    renderAuthenticatedSocket([
      'https://api.example.test',
      'session-1',
      'client-1',
      vi.fn(),
      vi.fn(),
      vi.fn(),
    ], acquireAccessToken, onAuthLoss)

    const connectError = registeredHandler<(error: Error & { data?: { code?: string } }) => void>(socket, 'connect_error')
    connectError(Object.assign(new Error('expired'), { data: { code: 'invalid_token' } }))
    await vi.waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(2))

    connectError(Object.assign(new Error('expired again'), { data: { code: 'invalid_token' } }))
    expect(acquireAccessToken).toHaveBeenCalledTimes(1)
    expect(acquireAccessToken).toHaveBeenCalledWith({ forceRefresh: true })
    expect(onAuthLoss).toHaveBeenCalledWith('authentication_failed', expect.any(Error))
  })
})
