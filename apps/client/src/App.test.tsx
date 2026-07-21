import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { evictStaleCollaboratorSignals, mergeCollaboratorsFromSnapshot } from './domain/collaboratorUtils'
import type { SessionSummary } from './network/session'
import { RUNTIME_CHUNK_WORLD_SIZE } from '../../server/src/contracts'

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
    worldBounds,
    onPointerMove,
    cameraPolicy,
    cameraPan,
    onCameraPan,
    onViewportChanged,
    onZoomTierChanged,
  }: {
    remoteCursors?: Array<{ clientId: string }>
    remoteSelections?: Array<{ clientId: string; tileId: string }>
    worldBounds?: { minX: number; maxX: number; minY: number; maxY: number }
    onPointerMove?: (x: number, y: number) => void
    cameraPolicy?: { minZoom: number; maxZoom: number; panSensitivity: number }
    cameraPan?: { x: number; y: number }
    onCameraPan?: (deltaX: number, deltaY: number) => void
    onViewportChanged?: (payload: {
      center: { x: number; y: number }
      viewport: { minX: number; maxX: number; minY: number; maxY: number }
      zoom: number
    }) => void
    onZoomTierChanged?: (zoom: number) => void
  }) => (
    <div
      data-testid="mosaic-scene"
      data-remote-cursors={remoteCursors?.length ?? 0}
      data-remote-selections={remoteSelections?.length ?? 0}
      data-min-zoom={cameraPolicy?.minZoom ?? -1}
      data-max-zoom={cameraPolicy?.maxZoom ?? -1}
      data-pan-sensitivity={cameraPolicy?.panSensitivity ?? -1}
      data-camera-pan={`${cameraPan?.x ?? 0},${cameraPan?.y ?? 0}`}
      data-world-bounds={worldBounds ? `${worldBounds.minX},${worldBounds.maxX},${worldBounds.minY},${worldBounds.maxY}` : 'unset'}
    >
      scene
      <button type="button" onClick={() => onPointerMove?.(0, 0)}>
        Move Pointer Near
      </button>
      <button type="button" onClick={() => onPointerMove?.(5, 5)}>
        Move Pointer Far
      </button>
      <button type="button" onClick={() => onCameraPan?.(10, -5)}>
        Pan Camera
      </button>
      <button
        type="button"
        onClick={() => onViewportChanged?.({
          center: { x: 0, y: 0 },
          viewport: {
            minX: -RUNTIME_CHUNK_WORLD_SIZE,
            maxX: 0,
            minY: -RUNTIME_CHUNK_WORLD_SIZE,
            maxY: 0,
          },
          zoom: 60,
        })}
      >
        Emit Viewport
      </button>
      <button type="button" onClick={() => onZoomTierChanged?.(30)}>
        Zoom Aggregate
      </button>
      <button type="button" onClick={() => onZoomTierChanged?.(60)}>
        Zoom Fine
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
    vi.useRealTimers()
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
    fireEvent.click(screen.getByRole('button', { name: /Vast/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Canvas' }))

    await waitFor(() => {
      expect(screen.getByTestId('controls-panel')).toBeInTheDocument()
    })

    expect(createSessionMock).toHaveBeenCalledTimes(1)
    expect(createSessionMock).toHaveBeenCalledWith({ canvasPreset: 'vast' })
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

    // Snapshot reconciliation is authoritative for presence membership.
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

    expect(screen.getByLabelText('Active collaborators')).not.toHaveTextContent('client-3')
    expect(screen.getByTestId('mosaic-scene')).toHaveAttribute('data-remote-cursors', '0')
    expect(screen.getByTestId('mosaic-scene')).toHaveAttribute('data-remote-selections', '0')
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
      present: false,
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
    expect(merged['client-3'].present).toBe(false)
  })

  it('throttles pointer and selection emits with bounded rate and trailing flush semantics', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    const emitMock = vi.fn()
    useSocketConnectionMock.mockImplementation((...args: unknown[]) => {
      const actionRef = args[7] as { current: { emit: typeof emitMock } | null } | undefined
      const socketRef = { current: { emit: emitMock } }
      if (actionRef) {
        actionRef.current = socketRef.current
      }
      return socketRef as any
    })

    render(<App />)

    await screen.findByRole('button', { name: 'Join' })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(await screen.findByTestId('controls-panel')).toBeInTheDocument()

    vi.useFakeTimers()

    const socketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    const onSnapshot = socketCall[3] as (payload: any) => void

    act(() => {
      onSnapshot({
        session: {
          id: 'session-1',
          tiles: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              shape: 'square',
              color: '#abc',
              material: 'ceramic',
              transform: { position: { x: 0, y: 0 }, rotation: 0, mirrored: false },
              createdAt: Date.now(),
              placedBy: 'client-2',
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        clients: [{ clientId: 'client-1', joinedAt: Date.now() - 10 }],
        lastOpSeq: 1,
        revision: 1,
      })
    })

    const moveNearButton = screen.getByRole('button', { name: 'Move Pointer Near' })
    const moveFarButton = screen.getByRole('button', { name: 'Move Pointer Far' })

    fireEvent.click(moveNearButton)

    expect(emitMock).toHaveBeenCalledWith('pointer_move', { position: { x: 0, y: 0 } })

    const immediateCount = emitMock.mock.calls.filter((call) => call[0] === 'pointer_move').length
    expect(immediateCount).toBe(1)

    const immediateSelectionCount = emitMock.mock.calls.filter((call) => call[0] === 'selection_update').length
    expect(immediateSelectionCount).toBe(1)

    fireEvent.click(moveFarButton)

    const beforeFlushCount = emitMock.mock.calls.filter((call) => call[0] === 'pointer_move').length
    expect(beforeFlushCount).toBe(1)

    const beforeSelectionFlushCount = emitMock.mock.calls.filter((call) => call[0] === 'selection_update').length
    expect(beforeSelectionFlushCount).toBe(1)

    await act(async () => {
      vi.advanceTimersByTime(50)
    })

    const afterFlushCalls = emitMock.mock.calls.filter((call) => call[0] === 'pointer_move')
    expect(afterFlushCalls.length).toBe(2)
    expect(afterFlushCalls.at(-1)?.[1]).toEqual({ position: { x: 5, y: 5 } })

    const selectionAfterFlushCalls = emitMock.mock.calls.filter((call) => call[0] === 'selection_update')
    expect(selectionAfterFlushCalls.length).toBe(2)
    expect(selectionAfterFlushCalls.at(-1)?.[1]).toMatchObject({
      canvasId: 'session-1',
      clientId: 'client-1',
      tileId: undefined,
    })

    vi.useRealTimers()
  })

  it('wires camera pan and zoom policy into MosaicScene', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await screen.findByRole('button', { name: 'Join' })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    const scene = await screen.findByTestId('mosaic-scene')

    expect(scene).toHaveAttribute('data-min-zoom', '20')
    expect(scene).toHaveAttribute('data-max-zoom', '140')
    expect(scene).toHaveAttribute('data-pan-sensitivity', '0.02')
    expect(scene).toHaveAttribute('data-camera-pan', '0,0')
    expect(scene).toHaveAttribute('data-world-bounds', '-5.2,5.2,-3.4,3.4')

    fireEvent.click(screen.getByRole('button', { name: 'Pan Camera' }))

    expect(screen.getByTestId('mosaic-scene')).toHaveAttribute('data-camera-pan', '-0.2,-0.1')
  })

  it('maps bounded snapshot policy to scene world bounds', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await screen.findByRole('button', { name: 'Join' })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(await screen.findByTestId('controls-panel')).toBeInTheDocument()

    const socketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    const onSnapshot = socketCall[3] as (payload: any) => void

    act(() => {
      onSnapshot({
        session: {
          id: 'session-1',
          tiles: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        canvasConfig: {
          canvasSize: { width: 31.2, height: 20.4 },
          boundsPolicy: {
            mode: 'bounded',
            bounds: {
              minX: -15.6,
              maxX: 15.6,
              minY: -10.2,
              maxY: 10.2,
            },
          },
        },
        clients: [{ clientId: 'client-1', joinedAt: Date.now() - 10 }],
        lastOpSeq: 1,
        revision: 1,
      })
    })

    expect(screen.getByTestId('mosaic-scene')).toHaveAttribute('data-world-bounds', '-15.6,15.6,-10.2,10.2')
  })

  it('uses snapshot world bounds for pointer validation feedback in app flow', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await screen.findByRole('button', { name: 'Join' })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(await screen.findByTestId('controls-panel')).toBeInTheDocument()

    const socketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    const onSnapshot = socketCall[3] as (payload: any) => void

    act(() => {
      onSnapshot({
        session: {
          id: 'session-1',
          tiles: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        canvasConfig: {
          canvasSize: { width: 31.2, height: 20.4 },
          boundsPolicy: {
            mode: 'bounded',
            bounds: {
              minX: -15.6,
              maxX: 15.6,
              minY: -10.2,
              maxY: 10.2,
            },
          },
        },
        clients: [{ clientId: 'client-1', joinedAt: Date.now() - 10 }],
        lastOpSeq: 1,
        revision: 1,
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Move Pointer Far' }))

    expect(screen.getByText('0 placed').closest('.status-strip')).toHaveAttribute('data-state', 'valid')
  })

  it('keeps existing fine tiles when aggregate chunk snapshots arrive, then replaces with fine chunk snapshot', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await screen.findByRole('button', { name: 'Join' })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(await screen.findByTestId('controls-panel')).toBeInTheDocument()

    const socketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    const onSnapshot = socketCall[3] as (payload: any) => void
    const onChunkSnapshot = socketCall[12] as (payload: any) => void

    act(() => {
      onSnapshot({
        session: {
          id: 'session-1',
          tiles: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              shape: 'square',
              color: '#111',
              material: 'ceramic',
              transform: { position: { x: 1, y: 1 }, rotation: 0, mirrored: false },
              createdAt: Date.now(),
              placedBy: 'client-2',
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        clients: [{ clientId: 'client-1', joinedAt: Date.now() - 10 }],
        lastOpSeq: 1,
        revision: 1,
        realtimeCapabilities: {
          chunkStreamingEnabled: true,
          aggregateSnapshotEnabled: true,
          chunkCanaryEnabled: false,
          multiReplicaReady: false,
        },
      })
    })

    expect(screen.getByText('1 placed')).toBeInTheDocument()

    act(() => {
      onChunkSnapshot({
        canvasId: 'session-1',
        payloadMode: 'aggregate',
        coordination: {
          replicaId: 'r1',
          membershipScope: 'process-local',
          membershipAssumption: 'best-effort',
          emittedAt: Date.now(),
        },
        chunks: [
          {
            chunkId: '0:0',
            tiles: [],
            aggregate: { tileCount: 1, byShape: { square: 1 }, byMaterial: { ceramic: 1 } },
            opSeq: 2,
            revision: 2,
          },
        ],
        serverOpSeq: 2,
        serverRevision: 2,
      })
    })

    expect(screen.getByText('1 placed')).toBeInTheDocument()

    act(() => {
      onChunkSnapshot({
        canvasId: 'session-1',
        payloadMode: 'fine',
        coordination: {
          replicaId: 'r1',
          membershipScope: 'process-local',
          membershipAssumption: 'best-effort',
          emittedAt: Date.now(),
        },
        chunks: [
          {
            chunkId: '0:0',
            tiles: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                shape: 'triangle',
                color: '#222',
                material: 'stone',
                transform: { position: { x: 2, y: 2 }, rotation: 0, mirrored: false },
                createdAt: Date.now(),
                placedBy: 'client-3',
              },
            ],
            opSeq: 3,
            revision: 3,
          },
        ],
        serverOpSeq: 3,
        serverRevision: 3,
      })
    })

    expect(screen.getByText('1 placed')).toBeInTheDocument()
  })

  it('emits mode-coherent request_chunk_snapshot on chunk resync', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    const emitMock = vi.fn()
    useSocketConnectionMock.mockImplementation((...args: unknown[]) => {
      const actionRef = args[7] as { current: { emit: typeof emitMock } | null } | undefined
      const socketRef = { current: { emit: emitMock } }
      if (actionRef) {
        actionRef.current = socketRef.current
      }
      return socketRef as any
    })

    render(<App />)

    await screen.findByRole('button', { name: 'Join' })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(await screen.findByTestId('controls-panel')).toBeInTheDocument()

    const socketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    const onSnapshot = socketCall[3] as (payload: any) => void
    const onChunkResyncRequired = socketCall[15] as (payload: any) => void

    act(() => {
      onSnapshot({
        session: {
          id: 'session-1',
          tiles: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        clients: [{ clientId: 'client-1', joinedAt: Date.now() - 10 }],
        lastOpSeq: 1,
        revision: 1,
        realtimeCapabilities: {
          chunkStreamingEnabled: true,
          aggregateSnapshotEnabled: true,
          chunkCanaryEnabled: false,
          multiReplicaReady: false,
        },
      })
    })

    act(() => {
      onChunkResyncRequired({
        canvasId: 'session-1',
        chunkId: '0:0',
        payloadMode: 'aggregate',
        coordination: {
          replicaId: 'r1',
          membershipScope: 'process-local',
          membershipAssumption: 'best-effort',
          emittedAt: Date.now(),
        },
        currentOpSeq: 5,
        currentRevision: 5,
        reason: 'REVISION_MISMATCH',
      })
    })

    expect(emitMock).toHaveBeenCalledWith('request_chunk_snapshot', {
      canvasId: 'session-1',
      chunks: ['0:0'],
      payloadMode: 'aggregate',
    })

    act(() => {
      onChunkResyncRequired({
        canvasId: 'session-1',
        chunkId: '1:1',
        payloadMode: 'fine',
        coordination: {
          replicaId: 'r1',
          membershipScope: 'process-local',
          membershipAssumption: 'best-effort',
          emittedAt: Date.now(),
        },
        currentOpSeq: 6,
        currentRevision: 6,
        reason: 'GAP_DETECTED',
      })
    })

    expect(emitMock).toHaveBeenCalledWith('request_chunk_snapshot', {
      canvasId: 'session-1',
      chunks: ['1:1'],
      payloadMode: 'fine',
    })
  })

  it('gates chunk streaming wiring until capabilities are known and enabled', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await screen.findByRole('button', { name: 'Join' })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(await screen.findByTestId('controls-panel')).toBeInTheDocument()

    const initialSocketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    expect(initialSocketCall[16]).toBe(false)

    const onSnapshot = initialSocketCall[3] as (payload: any) => void

    act(() => {
      onSnapshot({
        session: {
          id: 'session-1',
          tiles: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        clients: [{ clientId: 'client-1', joinedAt: Date.now() - 10 }],
        lastOpSeq: 1,
        revision: 1,
        realtimeCapabilities: {
          chunkStreamingEnabled: true,
          aggregateSnapshotEnabled: true,
          chunkCanaryEnabled: false,
          multiReplicaReady: false,
        },
      })
    })

    const enabledSocketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    expect(enabledSocketCall[16]).toBe(true)
  })
})
