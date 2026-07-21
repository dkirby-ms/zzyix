import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { evictStaleCollaboratorSignals, mergeCollaboratorsFromSnapshot } from './App'
import type { SessionSummary } from './network/session'

const { createSessionMock, listSessionsMock, useSocketConnectionMock } = vi.hoisted(() => ({
  createSessionMock: vi.fn<() => Promise<string>>(),
  listSessionsMock: vi.fn<() => Promise<SessionSummary[]>>(),
  useSocketConnectionMock: vi.fn(() => ({ current: null })),
}))

const sessionState = {
  storedSessionId: 'session-1',
}

const mockSessions: SessionSummary[] = [
  {
    id: 'session-1',
    displayName: 'Canvas session-1',
    connectedUserCount: 2,
    canvasSize: { width: 10, height: 6 },
  },
]

vi.mock('./network/session', () => ({
  ensureClientId: vi.fn(() => 'client-1'),
  createSession: createSessionMock,
  listSessions: listSessionsMock,
  getStoredSessionId: vi.fn(() => sessionState.storedSessionId),
  setStoredSessionId: vi.fn(),
}))

vi.mock('./network/useSocketConnection', () => ({
  useSocketConnection: useSocketConnectionMock,
}))

vi.mock('./ui/ControlsPanel', () => ({
  ControlsPanel: () => <div data-testid="controls-panel">controls</div>,
}))

vi.mock('./render/MosaicScene', () => ({
  MosaicScene: ({
    remoteCursors,
    remoteSelections,
    onPointerMove,
  }: {
    remoteCursors?: Array<{ clientId: string }>
    remoteSelections?: Array<{ clientId: string; tileId: string }>
    onPointerMove?: (x: number, y: number) => void
  }) => (
    <div
      data-testid="mosaic-scene"
      data-remote-cursors={remoteCursors?.length ?? 0}
      data-remote-selections={remoteSelections?.length ?? 0}
    >
      scene
      <button type="button" onClick={() => onPointerMove?.(1, 2)}>
        Move Pointer
      </button>
    </div>
  ),
}))

describe('App lobby-first behavior', () => {
  beforeEach(() => {
    sessionState.storedSessionId = 'session-1'
    listSessionsMock.mockReset()
    createSessionMock.mockReset()
    useSocketConnectionMock.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('does not implicitly join from stored session id on load', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await screen.findByText('Choose a Canvas')
    expect(screen.getByText('Last used')).toBeInTheDocument()
    expect(screen.queryByTestId('controls-panel')).not.toBeInTheDocument()
    expect(useSocketConnectionMock).toHaveBeenCalled()
    const firstSocketCall = useSocketConnectionMock.mock.calls[0] as unknown[] | undefined
    expect(firstSocketCall?.[1]).toBeNull()
  })

  it('explicit join transitions to canvas mode', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await screen.findByRole('button', { name: 'Join' })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => {
      expect(screen.getByTestId('controls-panel')).toBeInTheDocument()
      expect(screen.getByTestId('mosaic-scene')).toBeInTheDocument()
    })

    const lastSocketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[] | undefined
    expect(lastSocketCall?.[1]).toBe('session-1')
  })

  it('create action transitions to canvas mode', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)
    createSessionMock.mockResolvedValue('created-session-1')

    render(<App />)

    await screen.findByRole('button', { name: 'Create Canvas' })
    fireEvent.click(screen.getByRole('button', { name: 'Create Canvas' }))

    await waitFor(() => {
      expect(screen.getByTestId('controls-panel')).toBeInTheDocument()
    })

    expect(createSessionMock).toHaveBeenCalledTimes(1)
    const lastSocketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[] | undefined
    expect(lastSocketCall?.[1]).toBe('created-session-1')
  })

  it('seeds collaborators from snapshot and reconciles pointer/join/leave events', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await screen.findByRole('button', { name: 'Join' })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => {
      expect(screen.getByTestId('controls-panel')).toBeInTheDocument()
    })

    const socketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    const onSnapshot = socketCall[3] as (payload: any) => void
    const onPointerUpdate = socketCall[8] as (payload: any) => void
    const onClientJoined = socketCall[9] as (payload: any) => void
    const onClientLeft = socketCall[10] as (payload: any) => void
    const onSelectionUpdate = socketCall[11] as (payload: any) => void

    act(() => {
      onSnapshot({
        session: {
          id: 'session-1',
          tiles: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        clients: [
          { clientId: 'client-1', joinedAt: Date.now() - 100 },
          { clientId: 'client-2', joinedAt: Date.now() - 50, pointer: { x: 1, y: -2 } },
        ],
        lastOpSeq: 1,
        revision: 1,
      })
    })

    expect(screen.getByLabelText('Active collaborators')).toHaveTextContent('You')
    expect(screen.getByLabelText('Active collaborators')).toHaveTextContent('client-2')
    expect(screen.getByTestId('mosaic-scene')).toHaveAttribute('data-remote-cursors', '1')
    expect(screen.getByTestId('mosaic-scene')).toHaveAttribute('data-remote-selections', '0')

    act(() => {
      onPointerUpdate({ clientId: 'client-1', position: { x: 5, y: 3 } })
      onClientJoined({ client: { clientId: 'client-3', joinedAt: Date.now() } })
      onPointerUpdate({ clientId: 'client-3', position: { x: -1, y: 2 } })
      onSelectionUpdate({
        canvasId: 'session-1',
        clientId: 'client-3',
        tileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        updatedAt: Date.now(),
      })
    })

    expect(screen.getByLabelText('Active collaborators')).toHaveTextContent('client-3')
    expect(screen.getByTestId('mosaic-scene')).toHaveAttribute('data-remote-cursors', '2')
    expect(screen.getByTestId('mosaic-scene')).toHaveAttribute('data-remote-selections', '1')

    act(() => {
      onClientLeft({ clientId: 'client-2' })
      onSelectionUpdate({
        canvasId: 'session-1',
        clientId: 'client-3',
        tileId: undefined,
        updatedAt: Date.now(),
      })
    })

    expect(screen.getByTestId('mosaic-scene')).toHaveAttribute('data-remote-cursors', '1')
    expect(screen.getByTestId('mosaic-scene')).toHaveAttribute('data-remote-selections', '0')
    expect(screen.getByLabelText('Active collaborators')).not.toHaveTextContent('client-2')

    // Snapshot reconciliation should not drop active collaborators seen via transient events.
    act(() => {
      onSnapshot({
        session: {
          id: 'session-1',
          tiles: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        clients: [{ clientId: 'client-1', joinedAt: Date.now() - 100 }],
        lastOpSeq: 2,
        revision: 2,
      })
    })

    expect(screen.getByLabelText('Active collaborators')).toHaveTextContent('client-3')
  })

  it('evicts stale pointer and selection signals while preserving active collaborators', () => {
    const now = 10_000
    const result = evictStaleCollaboratorSignals(
      {
        'client-active': {
          clientId: 'client-active',
          present: true,
          pointer: { x: 2, y: 3 },
          selectionTileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          lastSeenAt: 1_000,
        },
        'client-inactive': {
          clientId: 'client-inactive',
          present: false,
          pointer: { x: 1, y: 1 },
          selectionTileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          lastSeenAt: 1_000,
        },
      },
      now,
    )

    expect(result['client-active']).toMatchObject({
      clientId: 'client-active',
      present: true,
      pointer: undefined,
      selectionTileId: undefined,
    })
    expect(result['client-inactive']).toBeUndefined()
  })

  it('merges snapshot baseline without dropping active transient collaborators', () => {
    const merged = mergeCollaboratorsFromSnapshot(
      {
        'client-3': {
          clientId: 'client-3',
          present: true,
          pointer: { x: -1, y: 2 },
          selectionTileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          lastSeenAt: Date.now(),
        },
      },
      [{ clientId: 'client-1', joinedAt: Date.now() - 10 }],
    )

    expect(merged['client-1']).toBeDefined()
    expect(merged['client-3']).toBeDefined()
    expect(merged['client-3'].present).toBe(true)
  })
})
