import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { evictStaleCollaboratorSignals, mergeCollaboratorsFromSnapshot } from './domain/collaboratorUtils'
import { resolvePaletteColorSelection } from './ui/palettes'
import type { MeResponse } from '../../server/src/contracts'
import { RUNTIME_CHUNK_WORLD_SIZE } from '../../server/src/contracts'

const {
  discoverCanonicalWorldMock,
  getStoredSessionIdMock,
  getCanonicalPatchLinkMock,
  listSessionsMock,
  resolveCanonicalPatchNavigationMock,
  setCanonicalPatchLinkMock,
  setStoredSessionIdMock,
  useSocketConnectionMock,
  resolveCanvasDebugMock,
  authSessionState,
} = vi.hoisted(() => ({
  discoverCanonicalWorldMock: vi.fn(),
  getStoredSessionIdMock: vi.fn(),
  getCanonicalPatchLinkMock: vi.fn(),
  listSessionsMock: vi.fn<() => Promise<SessionSummary[]>>(),
  resolveCanonicalPatchNavigationMock: vi.fn(),
  setCanonicalPatchLinkMock: vi.fn(),
  setStoredSessionIdMock: vi.fn(),
  useSocketConnectionMock: vi.fn(() => ({ current: null })),
  resolveCanvasDebugMock: vi.fn(() => false),
  authSessionState: {
    status: 'authenticated',
    principal: {
      profile: { displayName: 'Ada' },
      commands: {
        claimPatch: true,
        createTransfer: true,
        acceptTransfer: true,
        cancelTransfer: true,
        abandonPatch: true,
        requestAccountDeletion: true,
        recoverAccount: true,
      },
    } as MeResponse | null,
    error: null as string | null,
    apiOrigin: 'http://localhost:3001',
    authenticatedFetch: vi.fn<typeof fetch>(),
    acquireAccessToken: vi.fn(async () => 'access-token'),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    handleAuthLoss: vi.fn(),
  },
}))

const sessionState = {
  storedSessionId: 'session-1',
}

type SessionSummary = {
  id: string
  displayName: string
  connectedUserCount: number
  canvasSize: { width: number; height: number }
}

const mockSessions: SessionSummary[] = [
  {
    id: 'session-1',
    displayName: 'Canvas session-1',
    connectedUserCount: 2,
    canvasSize: { width: 10, height: 6 },
  },
]

const canonicalDescriptor = {
  quiltId: '10000000-0000-4000-8000-000000000001',
  legacyCanvasId: '20000000-0000-4000-8000-000000000001',
  topology: 'toroidal' as const,
  protocolVersion: 2 as const,
  patchRows: 1,
  patchColumns: 1,
  patchWidth: 10,
  patchHeight: 10,
  originX: 0,
  originY: 0,
  generation: 2,
  entryAttemptId: '40000000-0000-4000-8000-000000000001',
  initialPatch: { id: '30000000-0000-4000-8000-000000000001', row: 0, column: 0 },
  assignedPatch: { id: '30000000-0000-4000-8000-000000000001', row: 0, column: 0 },
}

const enterCanonicalCanvas = async (): Promise<void> => {
  await waitFor(() => expect((useSocketConnectionMock.mock.calls.at(-1) as unknown[])[1]).toMatchObject({
    quiltId: canonicalDescriptor.quiltId,
  }))
  const socketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
  const onQuiltProtocol = socketCall[6] as (payload: unknown) => void
  act(() => onQuiltProtocol({
    selectedProtocolVersion: 2,
    mutationEnabled: true,
    v1CompatibilityEnabled: false,
    topology: {
      quiltId: canonicalDescriptor.quiltId,
      topology: 'toroidal',
      patchRows: 1,
      patchColumns: 1,
      patchWidth: 10,
      patchHeight: 10,
    },
  }))
  await screen.findByTestId('mosaic-scene')
}

vi.mock('./network/session', () => ({
  ensureClientId: vi.fn(() => 'client-1'),
  listSessions: listSessionsMock,
  discoverCanonicalWorld: discoverCanonicalWorldMock,
  getCanonicalPatchLink: getCanonicalPatchLinkMock,
  getStoredSessionId: getStoredSessionIdMock,
  setStoredSessionId: setStoredSessionIdMock,
  resolveCanonicalPatchNavigation: resolveCanonicalPatchNavigationMock,
  setCanonicalPatchLink: setCanonicalPatchLinkMock,
}))

vi.mock('./network/useSocketConnection', () => ({
  useSocketConnection: useSocketConnectionMock,
}))

vi.mock('./auth/useAuthSession', () => ({
  useAuthSession: () => authSessionState,
}))

vi.mock('./config/debugFlags', () => ({
  resolveCanvasDebug: resolveCanvasDebugMock,
}))

vi.mock('./render/MosaicScene', () => ({
  MosaicScene: ({
    remoteCursors,
    remoteSelections,
    tiles,
    ghost,
    gridOverlay,
    worldBounds,
    onPointerMove,
    onPointerUp,
    cameraPolicy,
    cameraPan,
    onCameraPan,
    onViewportChanged,
    onZoomTierChanged,
  }: {
    remoteCursors?: Array<{ clientId: string }>
    remoteSelections?: Array<{ clientId: string; tileId: string }>
    tiles?: Array<{ id: string; transform: { position: { x: number; y: number }; rotation: number; mirrored?: boolean } }>
    ghost?: { transform: { position: { x: number; y: number }; rotation: number; mirrored?: boolean } }
    gridOverlay?: { pattern: { id: string }; activeSlotId?: string }
    worldBounds?: { minX: number; maxX: number; minY: number; maxY: number }
    onPointerMove?: (x: number, y: number) => void
    onPointerUp?: () => void
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
      data-tile-count={tiles?.length ?? 0}
      data-tile-transforms={JSON.stringify(tiles?.map((tile) => tile.transform) ?? [])}
      data-grid-pattern={gridOverlay?.pattern.id ?? 'off'}
      data-grid-slot={gridOverlay?.activeSlotId ?? 'none'}
      data-ghost-transform={ghost
        ? `${ghost.transform.position.x},${ghost.transform.position.y},${ghost.transform.rotation},${ghost.transform.mirrored ?? false}`
        : 'unset'}
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
      <button type="button" onClick={() => onPointerMove?.(0.66, 0.04)}>
        Move Pointer Offset
      </button>
      <button type="button" onClick={() => onPointerUp?.()}>
        Place Tile
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

describe('App canonical canvas behavior', () => {
  beforeEach(() => {
    authSessionState.status = 'authenticated'
    authSessionState.principal = {
      profile: { displayName: 'Ada' },
      commands: {
        claimPatch: true,
        createTransfer: true,
        acceptTransfer: true,
        cancelTransfer: true,
        abandonPatch: true,
        requestAccountDeletion: true,
        recoverAccount: true,
      },
    }
    authSessionState.error = null
    authSessionState.login.mockClear()
    authSessionState.logout.mockClear()
    authSessionState.handleAuthLoss.mockClear()
    sessionState.storedSessionId = 'session-1'
    getStoredSessionIdMock.mockReset()
    getStoredSessionIdMock.mockImplementation(() => sessionState.storedSessionId)
    setStoredSessionIdMock.mockReset()
    discoverCanonicalWorldMock.mockReset()
    discoverCanonicalWorldMock.mockResolvedValue(canonicalDescriptor)
    getCanonicalPatchLinkMock.mockReset()
    getCanonicalPatchLinkMock.mockReturnValue(null)
    resolveCanonicalPatchNavigationMock.mockReset()
    setCanonicalPatchLinkMock.mockReset()
    listSessionsMock.mockReset()
    useSocketConnectionMock.mockClear()
    resolveCanvasDebugMock.mockReset()
    resolveCanvasDebugMock.mockReturnValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('discovers and enters the canonical canvas without session storage', async () => {
    discoverCanonicalWorldMock.mockResolvedValue({
      quiltId: 'quilt-1',
      legacyCanvasId: 'canonical-canvas',
      protocolVersion: 2,
      patchRows: 1,
      patchColumns: 1,
      patchWidth: 10,
      patchHeight: 10,
      originX: 0,
      originY: 0,
      generation: 1,
      initialPatch: { id: 'patch-root', row: 0, column: 0 },
      assignedPatch: { id: 'patch-assigned', row: 0, column: 0 },
    })

    render(<App />)

    expect(await screen.findByText('Loading the canonical canvas...')).toBeInTheDocument()
    await waitFor(() => {
      const socketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
      expect(socketCall[1]).toMatchObject({ quiltId: 'quilt-1', generation: 1 })
    })
    expect(getStoredSessionIdMock).not.toHaveBeenCalled()
    expect(setStoredSessionIdMock).not.toHaveBeenCalled()
    expect(listSessionsMock).not.toHaveBeenCalled()

    const socketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    const onQuiltProtocol = socketCall[6] as (payload: any) => void
    act(() => onQuiltProtocol({
      selectedProtocolVersion: 2,
      mutationEnabled: false,
      v1CompatibilityEnabled: false,
      topology: {
        quiltId: 'quilt-1',
        topology: 'toroidal',
        patchRows: 1,
        patchColumns: 1,
        patchWidth: 10,
        patchHeight: 10,
      },
    }))

    expect(await screen.findByTestId('mosaic-scene')).toBeInTheDocument()
    expect(screen.getByTestId('mosaic-scene')).toHaveAttribute('data-camera-pan', '5,5')
    expect(screen.getByRole('region', { name: 'Canonical patch navigation' })).toBeInTheDocument()
    expect(setCanonicalPatchLinkMock).toHaveBeenCalledWith(expect.objectContaining({ patchId: 'patch-assigned' }))
    expect(screen.queryByText('Choose a Canvas')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '← Back' })).not.toBeInTheDocument()
  })

  it('resolves a durable patch link without rendering manual claim controls', async () => {
    discoverCanonicalWorldMock.mockResolvedValue({
      quiltId: 'quilt-1', legacyCanvasId: 'canonical-canvas', topology: 'toroidal', protocolVersion: 2,
      patchRows: 2, patchColumns: 2, patchWidth: 10, patchHeight: 10, originX: 0, originY: 0,
      generation: 1, initialPatch: { id: 'patch-root', row: 0, column: 0 },
      assignedPatch: { id: 'patch-assigned', row: 0, column: 1 },
    })
    getCanonicalPatchLinkMock.mockReturnValue({ quiltId: 'quilt-1', patchId: 'patch-deep' })
    resolveCanonicalPatchNavigationMock.mockResolvedValue({
      quiltId: 'quilt-1', patchId: 'patch-deep', row: 1, column: 1, centerX: 15, centerY: 15,
    })
    render(<App />)
    await waitFor(() => expect(resolveCanonicalPatchNavigationMock).toHaveBeenCalledWith(
      authSessionState.authenticatedFetch,
      authSessionState.apiOrigin,
      'quilt-1',
      'patch-deep',
    ))
    const socketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    const onQuiltProtocol = socketCall[6] as (payload: unknown) => void
    act(() => onQuiltProtocol({
      selectedProtocolVersion: 2,
      mutationEnabled: true,
      v1CompatibilityEnabled: false,
      topology: {
        quiltId: 'quilt-1', topology: 'toroidal', patchRows: 2, patchColumns: 2,
        patchWidth: 10, patchHeight: 10,
      },
    }))
    expect(screen.getByText('Patch 1, 1')).toBeInTheDocument()
    expect(screen.getByTestId('mosaic-scene')).toHaveAttribute('data-camera-pan', '15,15')
    expect(screen.queryByRole('button', { name: /^Claim / })).not.toBeInTheDocument()
  })

  it('rediscovers canonical entry on reload without consulting selected-session storage', async () => {
    discoverCanonicalWorldMock.mockResolvedValue(canonicalDescriptor)

    const firstRender = render(<App />)
    await waitFor(() => expect((useSocketConnectionMock.mock.calls.at(-1) as unknown[])[1]).toMatchObject({ quiltId: canonicalDescriptor.quiltId }))
    firstRender.unmount()
    render(<App />)
    await waitFor(() => expect(discoverCanonicalWorldMock).toHaveBeenCalledTimes(2))

    expect(getStoredSessionIdMock).not.toHaveBeenCalled()
    expect(setStoredSessionIdMock).not.toHaveBeenCalled()
  })

  it('shows a controlled unavailable state when canonical discovery fails', async () => {
    discoverCanonicalWorldMock.mockRejectedValue(new Error('Canonical world is unavailable (503)'))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Canvas unavailable')
    expect(screen.getByRole('alert')).toHaveTextContent('Canonical world is unavailable (503)')
    expect(getStoredSessionIdMock).not.toHaveBeenCalled()
    expect(setStoredSessionIdMock).not.toHaveBeenCalled()
  })

  it('clears canonical state and becomes unavailable after v1 negotiation', async () => {
    discoverCanonicalWorldMock.mockResolvedValue(canonicalDescriptor)

    render(<App />)
    await waitFor(() => expect((useSocketConnectionMock.mock.calls.at(-1) as unknown[])[1]).toMatchObject({ quiltId: canonicalDescriptor.quiltId }))
    const socketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    const onProtocolMismatch = socketCall[13] as () => void
    act(() => onProtocolMismatch())

    expect(await screen.findByRole('alert')).toHaveTextContent('required protocol version')
    const lastSocketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    expect(lastSocketCall[1]).toBeNull()
  })

  it.skip('unmounts all protected state and transport data before rendering sign-in after auth loss', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)
    const { rerender } = render(<App />)

    await enterCanonicalCanvas()
    await screen.findByTestId('mosaic-scene')

    const socketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    const onSnapshot = socketCall[3] as (payload: any) => void
    const onPointerUpdate = socketCall[8] as (payload: any) => void
    act(() => {
      onSnapshot({
        session: {
          id: 'session-1',
          tiles: [{
            id: 'tile-1',
            shape: 'square',
            color: '#000000',
            material: 'ceramic',
            transform: { position: { x: 0, y: 0 }, rotation: 0 },
          }],
          boundsPolicy: { mode: 'bounded', bounds: { minX: 0, maxX: 10, minY: 0, maxY: 6 } },
        },
        clients: [{ clientId: 'remote-client', pointer: { x: 1, y: 1 } }],
        lastOpSeq: 1,
        revision: 1,
      })
      onPointerUpdate({ clientId: 'remote-client', position: { x: 2, y: 2 } })
    })

    expect(screen.getByTestId('mosaic-scene')).toHaveAttribute('data-tile-count', '0')
    expect(screen.getByLabelText('Active collaborators')).toBeInTheDocument()

    authSessionState.status = 'signed_out'
    authSessionState.principal = null
    rerender(<App />)

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByTestId('mosaic-scene')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Active collaborators')).not.toBeInTheDocument()
    expect(screen.queryByText('Choose a Canvas')).not.toBeInTheDocument()

    authSessionState.status = 'authenticated'
    authSessionState.principal = {
      profile: { displayName: 'Ada' },
      commands: {
        claimPatch: true,
        createTransfer: true,
        acceptTransfer: true,
        cancelTransfer: true,
        abandonPatch: true,
        requestAccountDeletion: true,
        recoverAccount: true,
      },
    }
    rerender(<App />)

    await screen.findByText('Loading the canonical canvas...')
    expect(screen.queryByTestId('mosaic-scene')).not.toBeInTheDocument()
  })

  it.skip('seeds collaborators from snapshot and reconciles pointer/join/leave events', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()
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

  it.skip('evicts stale pointer and selection signals while preserving active collaborators', () => {
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

  it.skip('merges snapshot baseline without dropping active transient collaborators', () => {
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

  it.skip('throttles pointer and selection emits with bounded rate and trailing flush semantics', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    const emitMock = vi.fn()
    useSocketConnectionMock.mockImplementation((...args: unknown[]) => {
      const actionRef = args[3] as { current: { emit: typeof emitMock } | null } | undefined
      const socketRef = {
        current: {
          emit: emitMock,
          on: vi.fn(),
          off: vi.fn(),
          connected: false,
        },
      }
      if (actionRef) {
        actionRef.current = socketRef.current
      }
      return socketRef as any
    })

    render(<App />)

    await enterCanonicalCanvas()

    expect(await screen.findByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()

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

    await enterCanonicalCanvas()

    const scene = await screen.findByTestId('mosaic-scene')

    expect(scene).toHaveAttribute('data-min-zoom', '20')
    expect(scene).toHaveAttribute('data-max-zoom', '140')
    expect(scene).toHaveAttribute('data-pan-sensitivity', '0.02')
    expect(scene).toHaveAttribute('data-camera-pan', '5,5')
    expect(scene).toHaveAttribute('data-world-bounds', '0,10,0,10')

    fireEvent.click(screen.getByRole('button', { name: 'Pan Camera' }))

    expect(screen.getByTestId('mosaic-scene')).toHaveAttribute('data-camera-pan', '4.8,4.9')
  })

  it.skip('maps bounded snapshot policy to scene world bounds', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await enterCanonicalCanvas()

    expect(await screen.findByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()

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

  it.skip('uses snapshot world bounds for pointer validation feedback in app flow', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await enterCanonicalCanvas()

    expect(await screen.findByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()

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

  it.skip('keeps existing fine tiles when aggregate chunk snapshots arrive, then replaces with fine chunk snapshot', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await enterCanonicalCanvas()

    expect(await screen.findByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()

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

  it.skip('emits mode-coherent request_chunk_snapshot on chunk resync', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    const emitMock = vi.fn()
    useSocketConnectionMock.mockImplementation((...args: unknown[]) => {
      const actionRef = args[3] as { current: { emit: typeof emitMock } | null } | undefined
      const socketRef = {
        current: {
          emit: emitMock,
          on: vi.fn(),
          off: vi.fn(),
          connected: false,
        },
      }
      if (actionRef) {
        actionRef.current = socketRef.current
      }
      return socketRef as any
    })

    render(<App />)

    await enterCanonicalCanvas()

    expect(await screen.findByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()

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

  it.skip('gates chunk streaming wiring until capabilities are known and enabled', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await enterCanonicalCanvas()

    expect(await screen.findByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()

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

  it('subscribes canonical v2 AOI rooms and replaces only the recovered patch', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)
    const emitMock = vi.fn((event: string, _payload: unknown, callback?: (ack: any) => void) => {
      if (event === 'subscribe_quilt_area') callback?.({ outcomes: [], acceptedCursors: {} })
    })
    useSocketConnectionMock.mockImplementation((...args: unknown[]) => {
      const actionRef = args[3] as { current: { emit: typeof emitMock } | null } | undefined
      const socketRef = { current: { emit: emitMock, on: vi.fn(), off: vi.fn(), connected: true } }
      if (actionRef) actionRef.current = socketRef.current
      return socketRef as any
    })

    render(<App />)
    await enterCanonicalCanvas()
    expect(await screen.findByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()

    const socketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    const onQuiltProtocol = socketCall[6] as (payload: any) => void
    const onQuiltPatchSnapshot = socketCall[7] as (payload: any) => void

    vi.useFakeTimers()
    act(() => onQuiltProtocol({
      selectedProtocolVersion: 2,
      v1CompatibilityEnabled: false,
      mutationEnabled: false,
      canaryTelemetryEnabled: true,
      topology: {
        quiltId: 'quilt-1',
        topology: 'toroidal',
        patchRows: 1,
        patchColumns: 2,
        patchWidth: RUNTIME_CHUNK_WORLD_SIZE,
        patchHeight: RUNTIME_CHUNK_WORLD_SIZE,
      },
      limits: {
        maxRoomsPerConnection: 64,
        maxRoomsPerRequest: 32,
        maxChunksPerRequest: 64,
        maxRoomChurnPerMinute: 120,
        maxSnapshotTiles: 2_000,
        maxPayloadBytes: 262_144,
        source: 'canary-default',
      },
    }))

    act(() => vi.advanceTimersByTime(10_000))
    expect(emitMock).toHaveBeenCalledWith('quilt_client_runtime_metrics', expect.objectContaining({
      quiltId: 'quilt-1',
      retainedPatchCount: 0,
      retainedTileCount: 0,
    }))
    vi.useRealTimers()

    fireEvent.click(screen.getByRole('button', { name: 'Emit Viewport' }))
    await waitFor(() => expect(emitMock).toHaveBeenCalledWith(
      'subscribe_quilt_area',
      expect.objectContaining({ quiltId: 'quilt-1' }),
      expect.any(Function),
    ))
    const subscription = emitMock.mock.calls.find((call) => call[0] === 'subscribe_quilt_area')?.[1] as any
    const roomKeys = subscription.rooms.map((room: any) => `${room.row}:${room.column}:${room.kind}`)
    expect(new Set(roomKeys).size).toBe(roomKeys.length)

    const tileA = {
      id: '11111111-1111-4111-8111-111111111111',
      shape: 'square', color: '#111', material: 'ceramic',
      transform: { position: { x: 1, y: 1 }, rotation: 0 }, createdAt: 1,
    }
    const tileB = {
      id: '22222222-2222-4222-8222-222222222222',
      shape: 'triangle', color: '#222', material: 'stone',
      transform: { position: { x: 9, y: 1 }, rotation: 0 }, createdAt: 2,
    }
    act(() => {
      onQuiltPatchSnapshot({
        quiltId: 'quilt-1', canonicalRoomId: 'room-a', patchId: 'patch-a', tiles: [tileA],
        cursor: { patchId: 'patch-a', opSeq: 1, revision: 1, eventId: 'event-a' },
      })
      onQuiltPatchSnapshot({
        quiltId: 'quilt-1', canonicalRoomId: 'room-b', patchId: 'patch-b', tiles: [tileB],
        cursor: { patchId: 'patch-b', opSeq: 1, revision: 1, eventId: 'event-b' },
      })
    })
    expect(screen.getByText('2 placed')).toBeInTheDocument()

    act(() => onQuiltPatchSnapshot({
      quiltId: 'quilt-1', canonicalRoomId: 'room-a', patchId: 'patch-a', tiles: [],
      cursor: { patchId: 'patch-a', opSeq: 2, revision: 2, eventId: 'event-c' },
    }))
    expect(screen.getByText('1 placed')).toBeInTheDocument()
  })

  it('canvas shell does not produce horizontal overflow at 320px viewport', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 320 })

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()
    })

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)

    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
  })

  it('does not expose a lobby return command', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByRole('banner')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /Back/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Choose a Canvas')).not.toBeInTheDocument()
  })

  it('resolvePaletteColorSelection preserves color when the target palette contains it', () => {
    const resolved = resolvePaletteColorSelection('terracotta', '#5f7588')

    expect(resolved).toEqual({ color: '#5f7588', didFallback: false })
  })

  it('announces deterministic fallback when palette switch cannot preserve the selected swatch', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('radio', { name: 'Color #2f4557' }))
    fireEvent.click(screen.getByRole('radio', { name: 'lagoon' }))

    expect(screen.getByText('Palette: lagoon')).toBeInTheDocument()
    expect(screen.getByText('Color: #4e6d7c')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Palette changed to lagoon. #2f4557 unavailable; selected #4e6d7c.',
    )
  })

  it('does not announce fallback when palette switch preserves the selected swatch', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('radio', { name: 'Color #5f7588' }))
    fireEvent.click(screen.getByRole('radio', { name: 'terracotta' }))

    expect(screen.getByText('Palette: terracotta')).toBeInTheDocument()
    expect(screen.getByText('Color: #5f7588')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it.skip('keeps active selection in sync with keyboard rotation, mirror, and undo shortcuts', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    const placePayloads: Array<{
      shape: string
      color: string
      material: string
      transform: { position: { x: number; y: number }; rotation: number; mirrored: boolean }
    }> = []
    const removeTilePayloads: Array<{ tileId: string; expectedRevision: number }> = []

    const emitMock = vi.fn((event: string, payload: unknown, callback?: (ack: any) => void) => {
      if (event === 'place_tile') {
        placePayloads.push(payload as {
          shape: string
          color: string
          material: string
          transform: { position: { x: number; y: number }; rotation: number; mirrored: boolean }
        })
        callback?.({
          rejected: false,
          placed: {
            id: `44444444-4444-4444-8444-44444444444${placePayloads.length}`,
            ...(payload as {
              shape: string
              color: string
              material: string
              transform: { position: { x: number; y: number }; rotation: number; mirrored: boolean }
            }),
            placedBy: 'client-1',
            createdAt: Date.now(),
          },
          opSeq: 20 + placePayloads.length,
          newRevision: 5 + placePayloads.length,
        })
      }

      if (event === 'remove_tile') {
        removeTilePayloads.push(payload as { tileId: string; expectedRevision: number })
        callback?.({
          removed: true,
          opSeq: 99,
          newRevision: 12,
        })
      }
    })

    useSocketConnectionMock.mockImplementation((...args: unknown[]) => {
      const actionRef = args[3] as { current: { emit: typeof emitMock } | null } | undefined
      const socketRef = {
        current: {
          emit: emitMock,
          on: vi.fn(),
          off: vi.fn(),
          connected: false,
        },
      }
      if (actionRef) {
        actionRef.current = socketRef.current
      }
      return socketRef as any
    })

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()
    })

    expect(screen.getByText('Color: #d4614f')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'r' })
    fireEvent.click(screen.getByRole('button', { name: 'Move Pointer Near' }))
    fireEvent.click(screen.getByRole('button', { name: 'Place Tile' }))

    expect(placePayloads.at(-1)).toMatchObject({
      transform: {
        rotation: Math.PI / 2,
        mirrored: false,
      },
    })

    fireEvent.keyDown(window, { key: 'f' })
    expect(screen.getByText('Shape: square')).toBeInTheDocument()
    expect(screen.getByText('Material: ceramic')).toBeInTheDocument()
    expect(screen.getByText('Palette: terracotta')).toBeInTheDocument()
    expect(screen.getByText('Color: #d4614f')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Square' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'ceramic' })).toHaveAttribute('aria-checked', 'true')

    expect(screen.getByText('Shape: square')).toBeInTheDocument()
    expect(screen.getByText('Material: ceramic')).toBeInTheDocument()
    expect(screen.getByText('Palette: terracotta')).toBeInTheDocument()
    expect(screen.getByText('Color: #d4614f')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Move Pointer Near' }))
    fireEvent.click(screen.getByRole('button', { name: 'Place Tile' }))
    fireEvent.keyDown(window, { key: 'z' })

    expect(removeTilePayloads.length).toBeGreaterThan(0)
    expect(removeTilePayloads.at(-1)?.tileId).toBeDefined()
    expect(screen.getByText('Shape: square')).toBeInTheDocument()
    expect(screen.getByText('Material: ceramic')).toBeInTheDocument()
    expect(screen.getByText('Palette: terracotta')).toBeInTheDocument()
    expect(screen.getByText('Color: #d4614f')).toBeInTheDocument()
  })

  it.skip('removes the most recent settled placement when undo is triggered from the keyboard', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    const emitMock = vi.fn((event: string, _payload: unknown, callback?: (ack: any) => void) => {
      if (event === 'place_tile' && callback) {
        callback({
          rejected: false,
          placed: {
            id: '55555555-5555-4555-8555-555555555555',
            shape: 'square',
            color: '#d4614f',
            material: 'ceramic',
            transform: {
              position: { x: 0, y: 0 },
              rotation: 0,
              mirrored: false,
            },
            placedBy: 'client-1',
            createdAt: Date.now(),
          },
          opSeq: 30,
          newRevision: 7,
        })
      }

      if (event === 'remove_tile' && callback) {
        callback({
          removed: true,
          opSeq: 31,
          newRevision: 8,
        })
      }
    })

    useSocketConnectionMock.mockImplementation((...args: unknown[]) => {
      const actionRef = args[3] as { current: { emit: typeof emitMock } | null } | undefined
      const socketRef = {
        current: {
          emit: emitMock,
          on: vi.fn(),
          off: vi.fn(),
          connected: false,
        },
      }
      if (actionRef) {
        actionRef.current = socketRef.current
      }
      return socketRef as any
    })

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Move Pointer Near' }))
    fireEvent.click(screen.getByRole('button', { name: 'Place Tile' }))

    fireEvent.keyDown(window, { key: 'z' })

    expect(emitMock).toHaveBeenCalledWith(
      'remove_tile',
      expect.objectContaining({ tileId: '55555555-5555-4555-8555-555555555555' }),
      expect.any(Function),
    )
    expect(screen.getByText('Shape: square')).toBeInTheDocument()
    expect(screen.getByText('Color: #d4614f')).toBeInTheDocument()
  })

  it('toggles palette open and collapsed state from the palette header', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('radiogroup', { name: 'Shape' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))

    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('radiogroup', { name: 'Shape' })).not.toBeInTheDocument()
  })

  it.skip('retains the selected grid pattern while hidden and preserves settled tiles', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByTestId('mosaic-scene')).toBeInTheDocument()
    })

    const socketCall = useSocketConnectionMock.mock.calls.at(-1) as unknown[]
    const onSnapshot = socketCall[3] as (payload: any) => void

    act(() => {
      onSnapshot({
        session: {
          id: 'session-1',
          tiles: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              shape: 'square',
              color: '#d4614f',
              material: 'ceramic',
              transform: {
                position: { x: 0, y: 0 },
                rotation: Math.PI / 2,
                mirrored: true,
              },
              createdAt: 1,
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        clients: [],
        lastOpSeq: 1,
        revision: 1,
      })
    })

    const scene = screen.getByTestId('mosaic-scene')
    const settledTransforms = scene.getAttribute('data-tile-transforms')
    const toggle = screen.getByRole('button', { name: 'Grid overlay' })

    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('radio', { name: 'Running bond' }))

    expect(scene).toHaveAttribute('data-grid-pattern', 'running-bond')
    expect(scene).toHaveAttribute('data-tile-transforms', settledTransforms)

    fireEvent.click(toggle)
    expect(scene).toHaveAttribute('data-grid-pattern', 'off')
    expect(scene).toHaveAttribute('data-tile-transforms', settledTransforms)
    expect(screen.getByText('Running bond')).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(screen.getByRole('radio', { name: 'Running bond' })).toHaveAttribute('aria-checked', 'true')
    expect(scene).toHaveAttribute('data-grid-pattern', 'running-bond')
  })

  it.skip('sends raw-pointer transforms by default and exact slot transforms when guided', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    const emitMock = vi.fn((event: string, _payload: unknown, callback?: (ack: any) => void) => {
      if (event === 'place_tile' && callback) {
        callback({ rejected: true, placed: null })
      }
    })

    useSocketConnectionMock.mockImplementation((...args: unknown[]) => {
      const actionRef = args[3] as { current: { emit: typeof emitMock } | null } | undefined
      const socketRef = {
        current: {
          emit: emitMock,
          on: vi.fn(),
          off: vi.fn(),
          connected: false,
        },
      }
      if (actionRef) {
        actionRef.current = socketRef.current
      }
      return socketRef as any
    })

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByTestId('mosaic-scene')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Move Pointer Offset' }))
    fireEvent.click(screen.getByRole('button', { name: 'Place Tile' }))

    const rawPlacement = emitMock.mock.calls.find((call) => call[0] === 'place_tile')?.[1] as any
    expect(rawPlacement.transform).toEqual({
      position: { x: 0.66, y: 0.04 },
      rotation: 0,
      mirrored: false,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Grid overlay' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Triangle tessellation' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Triangle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move Pointer Offset' }))
    fireEvent.click(screen.getByRole('button', { name: 'Place Tile' }))

    const guidedPlacement = emitMock.mock.calls.filter((call) => call[0] === 'place_tile')[1]?.[1] as any
    expect(guidedPlacement.transform.position.x).toBeCloseTo(0.6404)
    expect(guidedPlacement.transform.position.y).toBe(0)
    expect(guidedPlacement.transform.rotation).toBe(Math.PI)
    expect(guidedPlacement.transform.mirrored).toBe(false)
  })

  it.skip('keeps active selection after successful placement acknowledgement', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    const emitMock = vi.fn((event: string, _payload: unknown, callback?: (ack: any) => void) => {
      if (event === 'place_tile' && callback) {
        callback({
          rejected: false,
          placed: {
            id: '33333333-3333-4333-8333-333333333333',
            shape: 'triangle',
            color: '#d9efe6',
            material: 'glass',
            transform: {
              position: { x: 0, y: 0 },
              rotation: 0,
              mirrored: false,
            },
            placedBy: 'client-1',
            createdAt: Date.now(),
          },
          opSeq: 10,
          newRevision: 2,
        })
      }
    })

    useSocketConnectionMock.mockImplementation((...args: unknown[]) => {
      const actionRef = args[3] as { current: { emit: typeof emitMock } | null } | undefined
      const socketRef = {
        current: {
          emit: emitMock,
          on: vi.fn(),
          off: vi.fn(),
          connected: false,
        },
      }
      if (actionRef) {
        actionRef.current = socketRef.current
      }
      return socketRef as any
    })

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('radio', { name: 'Triangle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Grid overlay' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Triangle tessellation' }))
    fireEvent.click(screen.getByRole('radio', { name: 'glass' }))
    fireEvent.click(screen.getByRole('radio', { name: 'lagoon' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Color #d9efe6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move Pointer Near' }))
    fireEvent.click(screen.getByRole('button', { name: 'Place Tile' }))

    expect(emitMock).toHaveBeenCalledWith(
      'place_tile',
      expect.objectContaining({ shape: 'triangle', material: 'glass', color: '#d9efe6' }),
      expect.any(Function),
    )
    expect(screen.getByRole('radio', { name: 'Triangle' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'glass' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'lagoon' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Color #d9efe6' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Shape: triangle')).toBeInTheDocument()
    expect(screen.getByText('Material: glass')).toBeInTheDocument()
    expect(screen.getByText('Palette: lagoon')).toBeInTheDocument()
    expect(screen.getByText('Color: #d9efe6')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Grid overlay' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('radio', { name: 'Triangle tessellation' })).toHaveAttribute('aria-checked', 'true')
  })

  it('removes optimistic placement while preserving active selection when placement ack is rejected', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    const emitMock = vi.fn((event: string, _payload: unknown, callback?: (ack: any) => void) => {
      if (event === 'place_tile' && callback) {
        callback({
          rejected: true,
          placed: null,
        })
      }
    })

    useSocketConnectionMock.mockImplementation((...args: unknown[]) => {
      const actionRef = args[3] as { current: { emit: typeof emitMock } | null } | undefined
      const socketRef = {
        current: {
          emit: emitMock,
          on: vi.fn(),
          off: vi.fn(),
          connected: false,
        },
      }
      if (actionRef) {
        actionRef.current = socketRef.current
      }
      return socketRef as any
    })

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('radio', { name: 'Triangle' }))
    fireEvent.click(screen.getByRole('radio', { name: 'glass' }))
    fireEvent.click(screen.getByRole('radio', { name: 'lagoon' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Color #d9efe6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Grid overlay' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Triangle tessellation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move Pointer Near' }))
    fireEvent.click(screen.getByRole('button', { name: 'Place Tile' }))

    await waitFor(() => {
      expect(screen.getByText('0 placed')).toBeInTheDocument()
    })

    expect(screen.getByRole('radio', { name: 'Triangle' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'glass' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'lagoon' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Color #d9efe6' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Shape: triangle')).toBeInTheDocument()
    expect(screen.getByText('Material: glass')).toBeInTheDocument()
    expect(screen.getByText('Palette: lagoon')).toBeInTheDocument()
    expect(screen.getByText('Color: #d9efe6')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Grid overlay' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('radio', { name: 'Triangle tessellation' })).toHaveAttribute('aria-checked', 'true')
  })

  it.skip('persists optimistic placement until delayed placement ack settles', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    let placeAckCallback: ((ack: any) => void) | undefined
    const emitMock = vi.fn((event: string, _payload: unknown, callback?: (ack: any) => void) => {
      if (event === 'place_tile' && callback) {
        placeAckCallback = callback
      }
    })

    useSocketConnectionMock.mockImplementation((...args: unknown[]) => {
      const actionRef = args[3] as { current: { emit: typeof emitMock } | null } | undefined
      const socketRef = {
        current: {
          emit: emitMock,
          on: vi.fn(),
          off: vi.fn(),
          connected: false,
        },
      }
      if (actionRef) {
        actionRef.current = socketRef.current
      }
      return socketRef as any
    })

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('radio', { name: 'Triangle' }))
    fireEvent.click(screen.getByRole('radio', { name: 'glass' }))
    fireEvent.click(screen.getByRole('radio', { name: 'lagoon' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Color #d9efe6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move Pointer Near' }))
    fireEvent.click(screen.getByRole('button', { name: 'Place Tile' }))

    await waitFor(() => {
      expect(screen.getByText('1 placed')).toBeInTheDocument()
    })

    expect(placeAckCallback).toBeDefined()
    expect(screen.getByText('Shape: triangle')).toBeInTheDocument()
    expect(screen.getByText('Material: glass')).toBeInTheDocument()
    expect(screen.getByText('Palette: lagoon')).toBeInTheDocument()
    expect(screen.getByText('Color: #d9efe6')).toBeInTheDocument()

    act(() => {
      placeAckCallback?.({
        rejected: false,
        placed: {
          id: '44444444-4444-4444-8444-444444444444',
          shape: 'triangle',
          color: '#d9efe6',
          material: 'glass',
          transform: {
            position: { x: 0, y: 0 },
            rotation: 0,
            mirrored: false,
          },
          placedBy: 'client-1',
          createdAt: Date.now(),
        },
        opSeq: 11,
        newRevision: 3,
      })
    })

    await waitFor(() => {
      expect(screen.getByText('1 placed')).toBeInTheDocument()
    })
    expect(screen.getByRole('radio', { name: 'Triangle' })).toHaveAttribute('aria-checked', 'true')
  })

  it('debug diagnostics are hidden by default in canvas mode', async () => {
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByTestId('mosaic-scene')).toBeInTheDocument()
    })

    expect(document.querySelector('.debug-overlay')).toBeNull()
  })

  it('shows debug diagnostics when debug mode is enabled and pointer is active', async () => {
    resolveCanvasDebugMock.mockReturnValue(true)
    listSessionsMock.mockResolvedValue(mockSessions)

    render(<App />)

    await enterCanonicalCanvas()

    await waitFor(() => {
      expect(screen.getByTestId('mosaic-scene')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Move Pointer Near' }))

    await waitFor(() => {
      expect(document.querySelector('.debug-overlay')).not.toBeNull()
    })
  })
})
