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
  disconnect: ReturnType<typeof vi.fn>
}

const createMockSocket = (): MockSocket => ({
  id: 'socket-1',
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
})

describe('useSocketConnection collaboration subscriptions', () => {
  beforeEach(() => {
    ioMock.mockReset()
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

    renderHook(() =>
      useSocketConnection(
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
      ),
    )

    expect(ioMock).toHaveBeenCalledTimes(1)
    expect(socket.on).toHaveBeenCalledWith('session_snapshot', callbacks.onSnapshot)
    expect(socket.on).toHaveBeenCalledWith('tile_placed', callbacks.onTilePlaced)
    expect(socket.on).toHaveBeenCalledWith('tile_removed', callbacks.onTileRemoved)
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

    renderHook(() =>
      useSocketConnection(
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
      ),
    )

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

    renderHook(() =>
      useSocketConnection(
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
      ),
    )

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

    const { unmount } = renderHook(() =>
      useSocketConnection(
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
      ),
    )

    unmount()

    expect(socket.off).toHaveBeenCalledWith('session_snapshot', callbacks.onSnapshot)
    expect(socket.off).toHaveBeenCalledWith('tile_placed', callbacks.onTilePlaced)
    expect(socket.off).toHaveBeenCalledWith('tile_removed', callbacks.onTileRemoved)
    expect(socket.off).toHaveBeenCalledWith('resync_required', callbacks.onResyncRequired)
    expect(socket.off).toHaveBeenCalledWith('pointer_update', callbacks.onPointerUpdate)
    expect(socket.off).toHaveBeenCalledWith('client_joined', callbacks.onClientJoined)
    expect(socket.off).toHaveBeenCalledWith('client_left', callbacks.onClientLeft)
    expect(socket.off).toHaveBeenCalledWith('selection_update', callbacks.onSelectionUpdate)
    expect(socket.disconnect).toHaveBeenCalledTimes(1)
  })

  it('subscribes and unsubscribes chat listeners when callbacks are provided', () => {
    const socket = createMockSocket()
    ioMock.mockReturnValue(socket)

    const callbacks = {
      onSnapshot: vi.fn(),
      onTilePlaced: vi.fn(),
      onTileRemoved: vi.fn(),
      onChatMessage: vi.fn(),
      onChatReplay: vi.fn(),
    }

    const { unmount } = renderHook(() =>
      useSocketConnection(
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
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        callbacks.onChatMessage,
        callbacks.onChatReplay,
      ),
    )

    expect(socket.on).toHaveBeenCalledWith('chat_message', callbacks.onChatMessage)
    expect(socket.on).toHaveBeenCalledWith('chat_replay', callbacks.onChatReplay)

    unmount()

    expect(socket.off).toHaveBeenCalledWith('chat_message', callbacks.onChatMessage)
    expect(socket.off).toHaveBeenCalledWith('chat_replay', callbacks.onChatReplay)
  })
})
