import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import {
  applyChunkSubscriptionBudgets,
  shouldRecomputeVisibleChunks,
  vec2,
  viewportToChunkIds,
  type ChunkId,
  type ViewportBounds,
} from './domain/math2d'
import { getTileDefinition, normalizeAngle, quantizeRotation, TILE_SHAPES, transformPolygon } from './domain/tileGeometry'
import type { TileShape } from './domain/tileGeometry'
import { GRID_PATTERNS, getConstructibleGridPatterns } from './domain/gridPatterns'
import type { GridPatternId } from './domain/gridPatterns'
import {
  createInitialGhost,
  createInitialSequencedTilesState,
  createServerTileId,
  isServerTileId,
  stepGhost,
  tryPlaceTile,
  updateGhostTarget,
} from './interaction/controller'
import type { ActiveTile, PlacementGuide, SequencedTilesState } from './interaction/controller'
import { ensureClientId } from './network/session'
import { derivePlacementBounds } from './domain/placementSolver'
import {
  clearCanonicalPatchLink,
  discoverCanonicalWorld,
  getCanonicalPatchLink,
  resolveCanonicalPatchNavigation,
  setCanonicalPatchLink,
} from './network/session'
import { resolveCanvasDebug } from './config/debugFlags'
import { useSocketConnection } from './network/useSocketConnection'
import { useConnectionStatus } from './network/useConnectionStatus'
import type { AuthLossReason } from './network/authenticatedFetch'
import { StatusIndicator } from './ui/StatusIndicator'
import { DEFAULT_BOUNDED_WORLD_BOUNDS, RUNTIME_CHUNK_WORLD_SIZE } from '../../server/src/contracts'
import type {
  CanonicalPatchNavigation,
  ClientJoinedPayload,
  ClientLeftPayload,
  PlaceTilePayload,
  QuiltPatchCursor,
  QuiltPatchEventPayload,
  QuiltPatchResyncRequiredPayload,
  QuiltProtocolHandshake,
  QuiltPlaceTileAck,
  QuiltPlaceTileRequest,
  QuiltRemoveTileAck,
  QuiltRemoveTileRequest,
  QuiltScopedStatePayload,
  QuiltTopologyHandshake,
  CanonicalWorldEntryDescriptor,
} from '../../server/src/contracts'
import { decomposeWrappedViewport } from '../../server/src/domain/quiltTopology'
import { CanvasLoadingFallback } from './ui/CanvasLoadingFallback'
import { TilePalette } from './ui/TilePalette'
import { GridOverlayControls } from './ui/GridOverlayControls'
import { AppHeader } from './ui/AppHeader'
import { palettes } from './ui/palettes'
import { resolvePaletteColorSelection } from './ui/palettes'
import type { PaletteName } from './ui/palettes'
import { TooltipProvider } from './ui/primitives/Tooltip'
import { useAuthSession } from './auth/useAuthSession'
import {
  COLLABORATOR_CLEANUP_INTERVAL_MS,
  evictStaleCollaboratorSignals,
  formatCollaboratorLabel,
  updateCollaborator,
  type RemoteCollaboratorMap,
} from './domain/collaboratorUtils'
import { registerCanvasTestApi, toCanvasTestTileSnapshot } from './test/canvasTestApi'
import {
  applyQuiltPatchPlacement,
  applyQuiltPatchRemoval,
  clearQuiltOptimisticTile,
  clearQuiltUndoMetadata,
  createQuiltCache,
  evictQuiltCache,
  mergeQuiltPatchSnapshot,
  reconcileQuiltMutationRevisions,
  selectQuiltCursors,
  selectQuiltTiles,
  setQuiltOptimisticTile,
  setQuiltUndoMetadata,
  type QuiltCacheState,
} from './domain/quiltCache'
import './App.css'

const CHUNK_WORLD_SIZE = RUNTIME_CHUNK_WORLD_SIZE
const CHUNK_PREFETCH_RING = 1
const CHUNK_SOFT_SUBSCRIPTION_LIMIT = 64
const CHUNK_HARD_SUBSCRIPTION_LIMIT = 128
const CHUNK_MOVEMENT_HYSTERESIS_RATIO = 0.25
const CHUNK_ZOOM_HYSTERESIS = 0.5
const QUILT_CACHE_PATCH_BUDGET = 64
const AGGREGATE_TIER_ENTER_ZOOM = 45
const AGGREGATE_TIER_EXIT_ZOOM = 47

const MosaicScene = lazy(async () => {
  const module = await import('./render/MosaicScene')
  return { default: module.MosaicScene }
})

type CanvasErrorBoundaryProps = {
  children: ReactNode
}

type CanvasErrorBoundaryState = {
  hasError: boolean
  retryKey: number
}

class CanvasErrorBoundary extends Component<CanvasErrorBoundaryProps, CanvasErrorBoundaryState> {
  state: CanvasErrorBoundaryState = {
    hasError: false,
    retryKey: 0,
  }

  static getDerivedStateFromError(): Partial<CanvasErrorBoundaryState> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Canvas lazy-load failed', error, errorInfo)
  }

  private readonly handleRetry = (): void => {
    this.setState((previousState) => ({
      hasError: false,
      retryKey: previousState.retryKey + 1,
    }))
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="canvas-loading-fallback" role="alert">
          <span>Canvas failed to load.</span>
          <button type="button" onClick={this.handleRetry}>Retry</button>
        </div>
      )
    }

    return <div key={this.state.retryKey} className="canvas-scene">{this.props.children}</div>
  }
}

type ZoomTier = 'fine' | 'aggregate'

type ActiveTileUiState = {
  activeTile: ActiveTile
  paletteName: PaletteName
  paletteOpen: boolean
  paletteFallbackAnnouncement: string
}

type ActiveTileUiAction =
  | { type: 'set-shape'; shape: TileShape }
  | { type: 'set-material'; material: ActiveTile['material'] }
  | { type: 'set-color'; color: string }
  | { type: 'patch-active-tile'; patch: Partial<ActiveTile> }
  | { type: 'set-palette'; paletteName: PaletteName }
  | { type: 'rotate-quarter'; direction: 1 | -1 }
  | { type: 'rotate-fine'; delta: number }
  | { type: 'toggle-mirror' }
  | { type: 'toggle-palette-open' }

const createInitialActiveTileUiState = (): ActiveTileUiState => ({
  activeTile: {
    shape: 'square',
    color: palettes.terracotta[0],
    material: 'ceramic',
    rotation: 0,
    mirrored: false,
  },
  paletteName: 'terracotta',
  paletteOpen: true,
  paletteFallbackAnnouncement: '',
})

const activeTileUiReducer = (state: ActiveTileUiState, action: ActiveTileUiAction): ActiveTileUiState => {
  switch (action.type) {
    case 'set-shape':
      return {
        ...state,
        activeTile: {
          ...state.activeTile,
          shape: action.shape,
        },
      }
    case 'set-material':
      return {
        ...state,
        activeTile: {
          ...state.activeTile,
          material: action.material,
        },
      }
    case 'set-color':
      return {
        ...state,
        activeTile: {
          ...state.activeTile,
          color: action.color,
        },
        paletteFallbackAnnouncement: '',
      }
    case 'patch-active-tile':
      return {
        ...state,
        activeTile: {
          ...state.activeTile,
          ...action.patch,
          rotation: action.patch.rotation === undefined
            ? state.activeTile.rotation
            : normalizeAngle(action.patch.rotation),
          mirrored: action.patch.mirrored ?? state.activeTile.mirrored,
        },
      }
    case 'set-palette': {
      const { color: nextColor, didFallback } = resolvePaletteColorSelection(action.paletteName, state.activeTile.color)

      return {
        ...state,
        paletteName: action.paletteName,
        activeTile: {
          ...state.activeTile,
          color: nextColor,
        },
        paletteFallbackAnnouncement: didFallback
          ? `Palette changed to ${action.paletteName}. ${state.activeTile.color} unavailable; selected ${nextColor}.`
          : '',
      }
    }
    case 'rotate-quarter':
      return {
        ...state,
        activeTile: {
          ...state.activeTile,
          rotation: quantizeRotation(state.activeTile.rotation + action.direction * (Math.PI / 2)),
        },
      }
    case 'rotate-fine':
      return {
        ...state,
        activeTile: {
          ...state.activeTile,
          rotation: normalizeAngle(state.activeTile.rotation + action.delta),
        },
      }
    case 'toggle-mirror':
      return {
        ...state,
        activeTile: {
          ...state.activeTile,
          mirrored: !state.activeTile.mirrored,
        },
      }
    case 'toggle-palette-open':
      return {
        ...state,
        paletteOpen: !state.paletteOpen,
      }
    default:
      return state
  }
}

const resolveZoomTier = (previous: ZoomTier | null, zoom: number): ZoomTier => {
  if (previous === 'aggregate') {
    return zoom > AGGREGATE_TIER_EXIT_ZOOM ? 'fine' : 'aggregate'
  }

  return zoom <= AGGREGATE_TIER_ENTER_ZOOM ? 'aggregate' : 'fine'
}

const isPointInPolygon = (point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean => {
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y

    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON) + xi)

    if (intersect) {
      inside = !inside
    }
  }

  return inside
}

const findHoveredTileId = (x: number, y: number, tiles: SequencedTilesState['tiles']): string | undefined => {
  for (let index = tiles.length - 1; index >= 0; index -= 1) {
    const tile = tiles[index]
    const outline = getTileDefinition(tile.shape).outline
    const transformedOutline = transformPolygon(outline, tile.transform)
    if (isPointInPolygon({ x, y }, transformedOutline)) {
      return tile.id
    }
  }

  return undefined
}

const worldToChunkId = (x: number, y: number, chunkSize: number): ChunkId =>
  `${Math.floor(x / chunkSize)}:${Math.floor(y / chunkSize)}`

const findCachedPatchId = (
  cache: QuiltCacheState,
  position: { x: number; y: number },
): string | undefined => {
  const chunkId = worldToChunkId(position.x, position.y, CHUNK_WORLD_SIZE)
  return Object.values(cache.patches).find((patch) => patch.chunkIds.includes(chunkId))?.patchId
}

const findTilePatchIds = (cache: QuiltCacheState, tileId: string): string[] =>
  Object.values(cache.patches)
    .filter((patch) => patch.tileIds.includes(tileId))
    .map((patch) => patch.patchId)

const findAffectedCachedPatchIds = (
  cache: QuiltCacheState,
  tile: Pick<PlaceTilePayload, 'shape' | 'transform'>,
  topology: QuiltTopologyHandshake,
): string[] | undefined => {
  const addressToPatchId = new Map<string, string>()
  Object.values(cache.patches).forEach((patch) => {
    const match = patch.roomId.match(/:patch:(\d+):(\d+):/)
    if (match) addressToPatchId.set(`${match[1]}:${match[2]}`, patch.patchId)
  })
  const addresses = new Set<string>()
  for (const rect of decomposeWrappedViewport(derivePlacementBounds(tile.shape, tile.transform), topology)) {
    const maxX = rect.maxX === rect.minX ? rect.maxX : Math.max(rect.minX, rect.maxX - Number.EPSILON)
    const maxY = rect.maxY === rect.minY ? rect.maxY : Math.max(rect.minY, rect.maxY - Number.EPSILON)
    const minColumn = Math.floor(rect.minX / topology.patchWidth)
    const maxColumn = Math.floor(maxX / topology.patchWidth)
    const minRow = Math.floor(rect.minY / topology.patchHeight)
    const maxRow = Math.floor(maxY / topology.patchHeight)
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) addresses.add(`${row}:${column}`)
    }
  }
  const patchIds = [...addresses].map((address) => addressToPatchId.get(address))
  return patchIds.every((patchId): patchId is string => patchId !== undefined) ? [...new Set(patchIds)] : undefined
}

const expectedPatchRevisions = (
  cache: QuiltCacheState,
  patchIds: readonly string[],
): Record<string, number> => Object.fromEntries(patchIds.map((patchId) => [
  patchId,
  cache.patches[patchId]?.cursor.revision,
]).filter((entry): entry is [string, number] => entry[1] !== undefined))

const DEFAULT_WORLD_BOUNDS = DEFAULT_BOUNDED_WORLD_BOUNDS

function ProtectedApp() {
  const auth = useAuthSession()
  const [sequencedState, setSequencedState] = useState<SequencedTilesState>(
    createInitialSequencedTilesState(),
  )
  const [activeTileUiState, dispatchActiveTileUi] = useReducer(activeTileUiReducer, undefined, createInitialActiveTileUiState)
  const constructibleGridPatterns = useMemo(
    () => getConstructibleGridPatterns(new Set(TILE_SHAPES), GRID_PATTERNS),
    [],
  )
  const [gridOverlayEnabled, setGridOverlayEnabled] = useState(false)
  const [selectedGridPatternId, setSelectedGridPatternId] = useState<GridPatternId | undefined>(
    constructibleGridPatterns[0]?.id,
  )
  const [gridOverlayAnnouncement, setGridOverlayAnnouncement] = useState('')
  const [ghost, setGhost] = useState(createInitialGhost())
  const [ghostVisible, setGhostVisible] = useState(false)
  const [invalidPulse, setInvalidPulse] = useState(false)
  const [cameraPan, setCameraPan] = useState({ x: 0, y: 0 })
  const [cameraPolicy] = useState({
    minZoom: 20,
    maxZoom: 140,
    panSensitivity: 0.02,
  })
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [mode, setMode] = useState<'canonical-loading' | 'canonical-unavailable' | 'canvas'>('canonical-loading')
  const [canonicalError, setCanonicalError] = useState<string | null>(null)
  const [canonicalDescriptor, setCanonicalDescriptor] = useState<CanonicalWorldEntryDescriptor | null>(null)
  const [focusedCanonicalPatch, setFocusedCanonicalPatch] = useState<CanonicalPatchNavigation | null>(null)
  const [collaborators, setCollaborators] = useState<RemoteCollaboratorMap>({})
  const [activeChunkIds, setActiveChunkIds] = useState<ChunkId[]>([])
  const [zoomTier, setZoomTier] = useState<ZoomTier>('fine')
  const [quiltProtocol, setQuiltProtocol] = useState<QuiltProtocolHandshake | null>(null)
  const [quiltCache, setQuiltCache] = useState<QuiltCacheState>(createQuiltCache)
  const [quiltSubscriptionEpoch, setQuiltSubscriptionEpoch] = useState(0)
  const [connectionEpoch, setConnectionEpoch] = useState(0)
  const [worldBounds, setWorldBounds] = useState(DEFAULT_WORLD_BOUNDS)
  const lastPointerWorldRef = useRef<{ x: number; y: number } | null>(null)
  const activeTileRef = useRef(activeTileUiState.activeTile)
  const sequencedStateRef = useRef(sequencedState)
  const quiltCursorsRef = useRef<Record<string, QuiltPatchCursor>>({})
  const ghostRef = useRef(ghost)
  const ghostVisibleRef = useRef(ghostVisible)
  const socketActionRef = useRef<ReturnType<typeof useSocketConnection>['current']>(null)
  const pointerEmitThrottleRef = useRef<{
    lastSentAt: number
    pendingPosition?: { x: number; y: number }
    timeoutId: number | null
  }>({ lastSentAt: 0, pendingPosition: undefined, timeoutId: null })
  const selectionEmitThrottleRef = useRef<{
    lastSentAt: number
    lastTileId?: string
    pendingTileId?: string
    timeoutId: number | null
  }>({ lastSentAt: 0, lastTileId: undefined, pendingTileId: undefined, timeoutId: null })
  const lastChunkViewportRef = useRef<{
    center: { x: number; y: number }
    zoom: number
    viewport: ViewportBounds
  } | null>(null)
  const subscribedChunkIdsRef = useRef<Set<ChunkId>>(new Set())
  const zoomTierRef = useRef<ZoomTier>('fine')
  const clientTelemetryRef = useRef({
    tierTransitions: 0,
    subscribeEvents: 0,
    unsubscribeEvents: 0,
    resyncEvents: 0,
  })
  const sceneMetricsRef = useRef({ sceneObjectCount: 0, drawCalls: 0, frameTimeMs: 0 })
  const clientId = useMemo(() => ensureClientId(), [])
  const canvasDebug = useMemo(() => resolveCanvasDebug(), [])

  const { activeTile, paletteName, paletteOpen, paletteFallbackAnnouncement } = activeTileUiState
  const isQuiltV2 = quiltProtocol?.selectedProtocolVersion === 2 && quiltProtocol.topology !== undefined
  const mutationControlsEnabled = !isQuiltV2 || quiltProtocol.mutationEnabled
  const ownedPatchBounds = useMemo(() => canonicalDescriptor ? {
    minX: canonicalDescriptor.originX + canonicalDescriptor.assignedPatch.column * canonicalDescriptor.patchWidth,
    maxX: canonicalDescriptor.originX + (canonicalDescriptor.assignedPatch.column + 1) * canonicalDescriptor.patchWidth,
    minY: canonicalDescriptor.originY + canonicalDescriptor.assignedPatch.row * canonicalDescriptor.patchHeight,
    maxY: canonicalDescriptor.originY + (canonicalDescriptor.assignedPatch.row + 1) * canonicalDescriptor.patchHeight,
  } : undefined, [canonicalDescriptor])
  const visibleTiles = useMemo(
    () => isQuiltV2 ? selectQuiltTiles(quiltCache) : sequencedState.tiles,
    [isQuiltV2, quiltCache, sequencedState.tiles],
  )

  useEffect(() => {
    activeTileRef.current = activeTile
  }, [activeTile])

  useEffect(() => {
    sequencedStateRef.current = sequencedState
  }, [sequencedState])

  useEffect(() => {
    ghostRef.current = ghost
  }, [ghost])

  useEffect(() => {
    ghostVisibleRef.current = ghostVisible
  }, [ghostVisible])

  const selectedGridPattern = useMemo(
    () => constructibleGridPatterns.find((pattern) => pattern.id === selectedGridPatternId),
    [constructibleGridPatterns, selectedGridPatternId],
  )
  const placementGuide = useMemo<PlacementGuide>(
    () => gridOverlayEnabled && selectedGridPattern
      ? { enabled: true, pattern: selectedGridPattern }
      : { enabled: false },
    [gridOverlayEnabled, selectedGridPattern],
  )

  const handlePaletteChange = useCallback((name: PaletteName): void => {
    dispatchActiveTileUi({ type: 'set-palette', paletteName: name })
  }, [])

  useEffect(() => {
    if (constructibleGridPatterns.length === 0) {
      if (gridOverlayEnabled) {
        setGridOverlayEnabled(false)
      }
      if (selectedGridPatternId !== undefined) {
        setSelectedGridPatternId(undefined)
      }
      setGridOverlayAnnouncement('No grid patterns are available for the current tile library.')
      return
    }

    if (!selectedGridPattern) {
      const fallback = constructibleGridPatterns[0]
      setSelectedGridPatternId(fallback.id)
      setGridOverlayAnnouncement(`Grid pattern changed to ${fallback.label} because the previous pattern is unavailable.`)
    }
  }, [
    constructibleGridPatterns,
    gridOverlayEnabled,
    selectedGridPattern,
    selectedGridPatternId,
  ])

  const clearProtectedWorldState = useCallback((): void => {
    setSessionId(null)
    setCanonicalDescriptor(null)
    setFocusedCanonicalPatch(null)
    setQuiltProtocol(null)
    setQuiltCache(createQuiltCache())
    setSequencedState(createInitialSequencedTilesState())
    quiltCursorsRef.current = {}
    subscribedChunkIdsRef.current = new Set()
    lastChunkViewportRef.current = null
    setActiveChunkIds([])
    setCollaborators({})
    setWorldBounds(DEFAULT_WORLD_BOUNDS)
    setConnectionEpoch(0)
  }, [])

  useEffect(() => {
    let cancelled = false
    clearProtectedWorldState()
    setCanonicalError(null)

    setMode('canonical-loading')
    const enterCanonicalWorld = async (): Promise<void> => {
      try {
        const descriptor = await discoverCanonicalWorld(auth.authenticatedFetch, auth.apiOrigin)
        if (!cancelled) {
          setCanonicalDescriptor(descriptor)
          setSessionId(descriptor.quiltId)
        }
      } catch (error) {
        if (!cancelled) {
          clearProtectedWorldState()
          setCanonicalError(error instanceof Error ? error.message : 'Canonical world is unavailable')
          setMode('canonical-unavailable')
        }
      }
    }
    void enterCanonicalWorld()
    return () => { cancelled = true }
  }, [auth.apiOrigin, auth.authenticatedFetch, clearProtectedWorldState])

  const focusCanonicalPatch = useCallback((navigation: CanonicalPatchNavigation): void => {
    setFocusedCanonicalPatch(navigation)
    setCameraPan({ x: navigation.centerX, y: navigation.centerY })
    setCanonicalPatchLink(navigation)
  }, [])

  useEffect(() => {
    if (!canonicalDescriptor?.quiltId) return

    let cancelled = false
    const assignedPatch: CanonicalPatchNavigation = {
      quiltId: canonicalDescriptor.quiltId,
      patchId: canonicalDescriptor.assignedPatch.id,
      row: canonicalDescriptor.assignedPatch.row,
      column: canonicalDescriptor.assignedPatch.column,
      centerX: canonicalDescriptor.originX + (canonicalDescriptor.assignedPatch.column + 0.5) * canonicalDescriptor.patchWidth,
      centerY: canonicalDescriptor.originY + (canonicalDescriptor.assignedPatch.row + 0.5) * canonicalDescriptor.patchHeight,
    }
    const durableLink = getCanonicalPatchLink()

    if (!durableLink || durableLink.quiltId !== canonicalDescriptor.quiltId) {
      focusCanonicalPatch(assignedPatch)
    } else {
      void resolveCanonicalPatchNavigation(
        auth.authenticatedFetch,
        auth.apiOrigin,
        durableLink.quiltId,
        durableLink.patchId,
      ).then((navigation) => {
        if (!cancelled) focusCanonicalPatch(navigation)
      }).catch(() => {
        if (!cancelled) focusCanonicalPatch(assignedPatch)
      })
    }

    return () => { cancelled = true }
  }, [
    auth.apiOrigin,
    auth.authenticatedFetch,
    canonicalDescriptor,
    focusCanonicalPatch,
  ])

  useEffect(() => {
    if (connectionEpoch <= 1 || !canonicalDescriptor) return

    let cancelled = false
    void discoverCanonicalWorld(auth.authenticatedFetch, auth.apiOrigin)
      .then((descriptor) => {
        if (cancelled || descriptor.generation === canonicalDescriptor.generation) return
        clearProtectedWorldState()
        setCanonicalDescriptor(descriptor)
        setSessionId(descriptor.quiltId)
        setMode('canonical-loading')
      })
      .catch((error) => {
        if (cancelled) return
        clearProtectedWorldState()
        setCanonicalError(error instanceof Error ? error.message : 'Canonical world is unavailable')
        setMode('canonical-unavailable')
      })

    return () => { cancelled = true }
  }, [
    auth.apiOrigin,
    auth.authenticatedFetch,
    canonicalDescriptor,
    clearProtectedWorldState,
    connectionEpoch,
  ])

  const triggerInvalidPulse = useCallback((): void => {
    setInvalidPulse(true)
    window.setTimeout(() => setInvalidPulse(false), 180)
  }, [])

  const onQuiltProtocol = useCallback((payload: QuiltProtocolHandshake): void => {
    setQuiltProtocol(payload)
    if (payload.selectedProtocolVersion !== 2 || !payload.topology) return

    setWorldBounds({
      minX: 0,
      maxX: payload.topology.patchColumns * payload.topology.patchWidth,
      minY: 0,
      maxY: payload.topology.patchRows * payload.topology.patchHeight,
    })
    setMode('canvas')
  }, [])

  const onCanonicalProtocolMismatch = useCallback((): void => {
    clearProtectedWorldState()
    setCanonicalError('This canvas does not support the required protocol version.')
    setMode('canonical-unavailable')
  }, [clearProtectedWorldState])

  const onSocketAuthLoss = useCallback((reason: AuthLossReason, error?: unknown): void => {
    clearProtectedWorldState()
    auth.handleAuthLoss(reason, error)
  }, [auth, clearProtectedWorldState])

  const onQuiltPatchState = useCallback((payload: QuiltScopedStatePayload): void => {
    quiltCursorsRef.current[payload.canonicalRoomId] = payload.cursor
    if (payload.payloadMode === 'fine') {
      setQuiltCache((previous) => mergeQuiltPatchSnapshot(previous, {
        patchId: payload.patchId,
        roomId: payload.canonicalRoomId,
        chunkIds: payload.chunkIds,
        tiles: payload.tiles,
        cursor: payload.cursor,
      }))
    }
    setSequencedState((previous) => ({ ...previous, lastOpSeq: Math.max(previous.lastOpSeq, payload.cursor.opSeq), revision: Math.max(previous.revision, payload.cursor.revision) }))
  }, [])

  const onQuiltPatchEvent = useCallback((payload: QuiltPatchEventPayload): void => {
    const currentCursor = quiltCursorsRef.current[payload.canonicalRoomId]
    if (currentCursor && payload.revision <= currentCursor.revision) return
    quiltCursorsRef.current[payload.canonicalRoomId] = {
      patchId: payload.patchId,
      opSeq: payload.opSeq,
      revision: payload.revision,
      eventId: payload.eventId,
    }

    const operation = payload.operation
    if ('tile' in operation) {
      setQuiltCache((previous) => applyQuiltPatchPlacement(previous, payload.patchId, {
        ...operation.tile,
        placedBy: operation.placedBy,
      }, quiltCursorsRef.current[payload.canonicalRoomId]))
      setSequencedState((previous) => ({ ...previous, lastOpSeq: Math.max(previous.lastOpSeq, payload.opSeq), revision: Math.max(previous.revision, payload.revision) }))
      return
    }

    setQuiltCache((previous) => applyQuiltPatchRemoval(previous, payload.patchId, operation.tileId, quiltCursorsRef.current[payload.canonicalRoomId]))
    setSequencedState((previous) => ({ ...previous, lastOpSeq: Math.max(previous.lastOpSeq, payload.opSeq), revision: Math.max(previous.revision, payload.revision) }))
  }, [])

  const onQuiltPatchResyncRequired = useCallback((payload: QuiltPatchResyncRequiredPayload): void => {
    quiltCursorsRef.current[payload.canonicalRoomId] = payload.cursor
    setQuiltSubscriptionEpoch((previous) => previous + 1)
  }, [])

  const onClientJoined = useCallback((payload: ClientJoinedPayload): void => {
    setCollaborators((prev) => updateCollaborator(prev, payload.client.clientId, {
      present: true,
      pointer: payload.client.pointer,
      lastSeenAt: Date.now(),
    }))
  }, [])

  const onClientLeft = useCallback((payload: ClientLeftPayload): void => {
    setCollaborators((prev) => updateCollaborator(prev, payload.clientId, {
      present: false,
      pointer: undefined,
      selectionTileId: undefined,
      lastSeenAt: Date.now(),
    }))
  }, [])

  const activeCollaborators = useMemo(
    () => Object.values(collaborators).filter((collaborator) => collaborator.present),
    [collaborators],
  )

  const remoteCursors = useMemo(
    () => activeCollaborators
      .filter((collaborator) => collaborator.clientId !== clientId && collaborator.pointer !== undefined)
      .map((collaborator) => ({
        clientId: collaborator.clientId,
        position: collaborator.pointer as { x: number; y: number },
      })),
    [activeCollaborators, clientId],
  )

  const remoteSelections = useMemo(
    () => activeCollaborators
      .filter((collaborator) => collaborator.clientId !== clientId && collaborator.selectionTileId !== undefined)
      .map((collaborator) => ({
        clientId: collaborator.clientId,
        tileId: collaborator.selectionTileId as string,
      })),
    [activeCollaborators, clientId],
  )

  useEffect(() => {
    if (!isQuiltV2) return
    setQuiltCache((previous) => {
      const activePatchIds = new Set<string>()
      for (const patch of Object.values(previous.patches)) {
        if (activeChunkIds.some((chunkId) => patch.chunkIds.includes(chunkId))) activePatchIds.add(patch.patchId)
      }
      return evictQuiltCache(previous, activePatchIds, QUILT_CACHE_PATCH_BUDGET)
    })
  }, [activeChunkIds, isQuiltV2])

  const emitPointerMove = useCallback((position: { x: number; y: number }): void => {
    void position
  }, [])

  const emitSelectionUpdate = useCallback((tileId?: string): void => {
    void tileId
  }, [])

  const socketRef = useSocketConnection(
    auth.apiOrigin,
    canonicalDescriptor,
    clientId,
    socketActionRef,
    onClientJoined,
    onClientLeft,
    onQuiltProtocol,
    onQuiltPatchState,
    onQuiltPatchEvent,
    onQuiltPatchResyncRequired,
    auth.acquireAccessToken,
    onSocketAuthLoss,
    true,
    onCanonicalProtocolMismatch,
    setConnectionEpoch,
  )

  const connectionState = useConnectionStatus(socketRef)

  useEffect(() => {
    if (!quiltProtocol?.canaryTelemetryEnabled || !quiltProtocol.topology) return

    const intervalId = window.setInterval(() => {
      const socket = socketActionRef.current
      if (!socket?.connected) return
      socket.emit('quilt_client_runtime_metrics', {
        sampleId: crypto.randomUUID(),
        entryAttemptId: canonicalDescriptor?.entryAttemptId ?? '',
        canonicalGeneration: canonicalDescriptor?.generation ?? 0,
        quiltId: quiltProtocol.topology!.quiltId,
        retainedPatchCount: Object.keys(quiltCache.patches).length,
        retainedTileCount: visibleTiles.length,
        ...sceneMetricsRef.current,
      })
    }, 10_000)

    return () => window.clearInterval(intervalId)
  }, [canonicalDescriptor?.entryAttemptId, canonicalDescriptor?.generation, quiltCache.patches, quiltProtocol, visibleTiles.length])

  const onViewportChanged = useCallback((payload: {
    center: { x: number; y: number }
    viewport: ViewportBounds
    zoom: number
  }): void => {
    const previous = lastChunkViewportRef.current

    if (previous) {
      const shouldRecompute = shouldRecomputeVisibleChunks(
        previous.center,
        payload.center,
        CHUNK_WORLD_SIZE,
        CHUNK_MOVEMENT_HYSTERESIS_RATIO,
        previous.zoom,
        payload.zoom,
        CHUNK_ZOOM_HYSTERESIS,
      )

      if (!shouldRecompute) {
        return
      }
    }

    lastChunkViewportRef.current = payload

    const topologyMode = quiltProtocol?.selectedProtocolVersion === 2 && quiltProtocol.topology?.topology === 'toroidal'
      ? {
          mode: 'toroidal' as const,
          chunkColumns: Math.max(1, Math.ceil(
            quiltProtocol.topology.patchColumns * quiltProtocol.topology.patchWidth / CHUNK_WORLD_SIZE,
          )),
          chunkRows: Math.max(1, Math.ceil(
            quiltProtocol.topology.patchRows * quiltProtocol.topology.patchHeight / CHUNK_WORLD_SIZE,
          )),
          quiltWidth: quiltProtocol.topology.patchColumns * quiltProtocol.topology.patchWidth,
          quiltHeight: quiltProtocol.topology.patchRows * quiltProtocol.topology.patchHeight,
        }
      : { mode: 'unbounded' as const }
    const nextChunkIds = applyChunkSubscriptionBudgets(
      viewportToChunkIds(payload.viewport, CHUNK_WORLD_SIZE, CHUNK_PREFETCH_RING, topologyMode),
      CHUNK_SOFT_SUBSCRIPTION_LIMIT,
      CHUNK_HARD_SUBSCRIPTION_LIMIT,
    )

    setActiveChunkIds(nextChunkIds)
  }, [quiltProtocol])

  useEffect(() => {
    const socket = socketActionRef.current
    const topology = quiltProtocol?.topology
    if (!socket || !topology || quiltProtocol.selectedProtocolVersion !== 2) return

    const grouped = new Map<string, { row: number; column: number; chunks: ChunkId[] }>()
    for (const chunkId of activeChunkIds) {
      const [rawColumn, rawRow] = chunkId.split(':')
      const chunkColumn = Number(rawColumn)
      const chunkRow = Number(rawRow)
      const column = Math.floor((chunkColumn * CHUNK_WORLD_SIZE) / topology.patchWidth)
      const row = Math.floor((chunkRow * CHUNK_WORLD_SIZE) / topology.patchHeight)
      const canonicalColumn = ((column % topology.patchColumns) + topology.patchColumns) % topology.patchColumns
      const canonicalRow = ((row % topology.patchRows) + topology.patchRows) % topology.patchRows
      const key = `${canonicalRow}:${canonicalColumn}`
      const entry = grouped.get(key) ?? { row: canonicalRow, column: canonicalColumn, chunks: [] }
      entry.chunks.push(chunkId)
      grouped.set(key, entry)
    }

    const kind = zoomTier === 'aggregate' ? 'aggregate' as const : 'fine' as const
    const rooms = Array.from(grouped.values()).map((entry) => ({
      requestId: `${kind}:${entry.row}:${entry.column}`,
      kind,
      row: entry.row,
      column: entry.column,
      chunkIds: entry.chunks,
    }))

    socket.emit('subscribe_quilt_area', {
      quiltId: topology.quiltId,
      rooms,
      cursors: selectQuiltCursors(quiltCache),
    }, (ack) => {
      quiltCursorsRef.current = { ...quiltCursorsRef.current, ...ack.acceptedCursors }
    })
  }, [activeChunkIds, connectionEpoch, quiltCache, quiltProtocol, quiltSubscriptionEpoch, zoomTier])

  useEffect(() => {
    if (pointerEmitThrottleRef.current.timeoutId !== null) {
      window.clearTimeout(pointerEmitThrottleRef.current.timeoutId)
    }
    pointerEmitThrottleRef.current = { lastSentAt: 0, pendingPosition: undefined, timeoutId: null }

    if (selectionEmitThrottleRef.current.timeoutId !== null) {
      window.clearTimeout(selectionEmitThrottleRef.current.timeoutId)
    }
    selectionEmitThrottleRef.current = { lastSentAt: 0, lastTileId: undefined, pendingTileId: undefined, timeoutId: null }
  }, [sessionId])

  useEffect(() => {
    const cleanupId = window.setInterval(() => {
      setCollaborators((prev) => evictStaleCollaboratorSignals(prev, Date.now()))
    }, COLLABORATOR_CLEANUP_INTERVAL_MS)

    return () => window.clearInterval(cleanupId)
  }, [])

  const handleUndo = useCallback((): void => {
    const lastSettled = [...visibleTiles].reverse().find((tile) => isServerTileId(tile.id) && tile.placedBy === clientId)
    if (!lastSettled) return

    const socket = socketRef.current
    if (!socket) return

    const quiltUndo = quiltCache.undo[lastSettled.id]
    if (isQuiltV2) {
      if (!quiltProtocol?.mutationEnabled || !quiltUndo) return
      setQuiltCache((previous) => setQuiltUndoMetadata(previous, quiltUndo))
      const patchIds = findTilePatchIds(quiltCache, lastSettled.id)
      const revisions = expectedPatchRevisions(quiltCache, patchIds)
      if (!quiltProtocol.topology || patchIds.length === 0 || Object.keys(revisions).length !== patchIds.length) return
      const payload: QuiltRemoveTileRequest = {
        quiltId: quiltProtocol.topology.quiltId,
        operationId: crypto.randomUUID(),
        expectedPatchRevisions: revisions,
        tileId: lastSettled.id,
      }
      socket.emit('quilt_remove_tile', payload, (ack: QuiltRemoveTileAck) => {
        if (ack.status === 'rejected') return
        setQuiltCache((previous) => clearQuiltUndoMetadata(
          reconcileQuiltMutationRevisions(
            patchIds.reduce((next, patchId) => applyQuiltPatchRemoval(next, patchId, lastSettled.id, {
              patchId,
              opSeq: ack.patchRevisions[patchId],
              revision: ack.patchRevisions[patchId],
              eventId: ack.eventIds[patchId],
            }), previous),
            ack.patchRevisions,
            ack.eventIds,
          ),
          lastSettled.id,
        ))
      })
      return
    }
  }, [clientId, isQuiltV2, quiltCache, quiltProtocol, socketRef, visibleTiles])

  useEffect(() => {
    if (mode !== 'canvas') {
      return
    }

    let last = performance.now()
    let raf = 0

    const tick = (now: number): void => {
      const dt = (now - last) / 1000
      last = now
      setGhost((prev) => stepGhost(prev, dt))
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'r') {
        dispatchActiveTileUi({ type: 'rotate-quarter', direction: event.shiftKey ? -1 : 1 })
      }

      if (event.key === ']') {
        dispatchActiveTileUi({ type: 'rotate-fine', delta: Math.PI / 12 })
      }

      if (event.key === '[') {
        dispatchActiveTileUi({ type: 'rotate-fine', delta: -Math.PI / 12 })
      }

      if (event.key.toLowerCase() === 'f') {
        dispatchActiveTileUi({ type: 'toggle-mirror' })
      }

      if (event.key.toLowerCase() === 'z') {
        handleUndo()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleUndo])

  const resolveGhostFromPointer = useCallback(
    (pointer: { x: number; y: number }) =>
      updateGhostTarget(
        pointer,
        activeTile,
        visibleTiles,
        isQuiltV2 && ownedPatchBounds ? { mode: 'bounded', bounds: ownedPatchBounds } : worldBounds,
        placementGuide,
        quiltProtocol?.topology,
      ),
    [activeTile, isQuiltV2, ownedPatchBounds, placementGuide, quiltProtocol?.topology, visibleTiles, worldBounds],
  )

  useEffect(() => {
    const pointer = lastPointerWorldRef.current
    if (!pointer) {
      return
    }

    const updated = resolveGhostFromPointer(pointer)
    setGhost((prev) => ({
      ...prev,
      target: updated.target,
      confidence: updated.confidence,
      valid: updated.valid,
      magnetStrength: updated.magnetStrength,
      rejection: updated.rejection,
      debugReason: updated.debugReason,
      guideSlotId: updated.guideSlotId,
    }))
  }, [resolveGhostFromPointer])

  useEffect(() => {
    if (placementGuide.enabled) {
      return
    }

    setGhost((prev) => ({
      ...prev,
      target: {
        ...prev.target,
        rotation: activeTile.rotation,
        mirrored: activeTile.mirrored,
      },
      guideSlotId: undefined,
    }))
  }, [activeTile.mirrored, activeTile.rotation, placementGuide.enabled])

  const placeFromState = useCallback((tileState: ActiveTile, ghostState: typeof ghost): void => {
    const result = tryPlaceTile(tileState, ghostState, visibleTiles)
    if (!result.placed) {
      triggerInvalidPulse()
      return
    }

    const socket = socketRef.current
    if (!socket) return

    const tileId = createServerTileId()
    const tempTile = { ...result.placed, id: tileId, placedBy: clientId }
    const quiltPatchId = isQuiltV2
      ? findCachedPatchId(quiltCache, tempTile.transform.position)
      : undefined

    if (isQuiltV2) {
      if (!quiltProtocol?.mutationEnabled || !quiltProtocol.topology || !quiltPatchId || !isServerTileId(tileId)) {
        triggerInvalidPulse()
        return
      }
      const patchIds = findAffectedCachedPatchIds(quiltCache, tempTile, quiltProtocol.topology)
      if (!patchIds) {
        triggerInvalidPulse()
        return
      }
      const revisions = expectedPatchRevisions(quiltCache, patchIds)
      if (Object.keys(revisions).length !== patchIds.length) {
        triggerInvalidPulse()
        return
      }
      const operationId = crypto.randomUUID()
      setQuiltCache((previous) => setQuiltOptimisticTile(previous, patchIds, tempTile, operationId))
      const payload: QuiltPlaceTileRequest = {
        quiltId: quiltProtocol.topology.quiltId,
        operationId,
        expectedPatchRevisions: revisions,
        tile: {
          tileId,
          shape: tempTile.shape,
          color: tempTile.color,
          material: tempTile.material,
          transform: tempTile.transform,
        },
      }
      socket.emit('quilt_place_tile', payload, (ack: QuiltPlaceTileAck) => {
        setQuiltCache((previous) => {
          const cleared = clearQuiltOptimisticTile(previous, tileId)
          if (ack.status === 'rejected') return cleared
          const applied = patchIds.reduce((next, patchId) => applyQuiltPatchPlacement(next, patchId, {
            ...ack.tile,
            placedBy: clientId,
          }, {
            patchId,
            opSeq: ack.patchRevisions[patchId],
            revision: ack.patchRevisions[patchId],
            eventId: ack.eventIds[patchId],
          }), cleared)
          return setQuiltUndoMetadata(
            reconcileQuiltMutationRevisions(applied, ack.patchRevisions, ack.eventIds),
            { tileId: ack.tile.id, patchId: patchIds[0], operation: 'place', revision: Math.max(...Object.values(ack.patchRevisions)) },
          )
        })
        if (ack.status === 'rejected') triggerInvalidPulse()
        else emitSelectionUpdate(ack.tile.id)
      })
      return
    }
    triggerInvalidPulse()
  }, [clientId, emitSelectionUpdate, isQuiltV2, quiltCache, quiltProtocol, socketRef, triggerInvalidPulse, visibleTiles])

  const updatePointer = useCallback((x: number, y: number): void => {
    const pointer = vec2(x, y)
    lastPointerWorldRef.current = pointer
    emitPointerMove(pointer)
    const updated = resolveGhostFromPointer(pointer)
    emitSelectionUpdate(findHoveredTileId(x, y, visibleTiles))
    setGhostVisible(true)
    setGhost((prev) => {
      const nextGhost = {
        ...prev,
        target: updated.target,
        confidence: updated.confidence,
        valid: updated.valid,
        magnetStrength: updated.magnetStrength,
        rejection: updated.rejection,
        debugReason: updated.debugReason,
        guideSlotId: updated.guideSlotId,
        current: ghostVisible ? prev.current : updated.target,
      }
      ghostRef.current = nextGhost
      return nextGhost
    })
  }, [emitPointerMove, emitSelectionUpdate, ghostVisible, resolveGhostFromPointer, visibleTiles])

  const attemptPlace = useCallback((): void => {
    placeFromState(activeTile, ghost)
  }, [activeTile, ghost, placeFromState])

  useEffect(() => registerCanvasTestApi({
    getState: () => ({
      clientId,
      sessionId,
      mode,
      connectionStatus: connectionState.status,
      revision: sequencedState.revision,
      resyncEvents: clientTelemetryRef.current.resyncEvents,
      collaboratorIds: activeCollaborators.map((collaborator) => collaborator.clientId),
      activeTile,
      cameraPan,
      grid: {
        enabled: gridOverlayEnabled,
        patternId: selectedGridPatternId,
      },
      tiles: visibleTiles.map(toCanvasTestTileSnapshot),
      metrics: {
        retainedPatchCount: Object.keys(quiltCache.patches).length,
        retainedTileCount: visibleTiles.length,
        cursorCount: Object.keys(selectQuiltCursors(quiltCache)).length,
        optimisticCount: Object.keys(quiltCache.optimistic).length,
        undoCount: Object.keys(quiltCache.undo).length,
        snapshotBytes: new TextEncoder().encode(JSON.stringify(quiltCache.patches)).byteLength,
        ...sceneMetricsRef.current,
      },
    }),
    joinSession: () => {},
    setActiveTile: (patch) => {
      dispatchActiveTileUi({ type: 'patch-active-tile', patch })
    },
    movePointer: (position) => {
      updatePointer(position.x, position.y)
    },
    setCameraPan: (position) => {
      setCameraPan(position)
    },
    setGridEnabled: (enabled) => {
      setGridOverlayEnabled(enabled)
    },
    placeTileAt: (position) => {
      const pointer = vec2(position.x, position.y)
      const tileSequenceState = sequencedStateRef.current
      const updated = resolveGhostFromPointer(pointer)
      const currentGhost = ghostRef.current
      const nextGhost = {
        ...currentGhost,
        target: updated.target,
        confidence: updated.confidence,
        valid: updated.valid,
        magnetStrength: updated.magnetStrength,
        rejection: updated.rejection,
        debugReason: updated.debugReason,
        guideSlotId: updated.guideSlotId,
        current: ghostVisibleRef.current ? currentGhost.current : updated.target,
      }

      lastPointerWorldRef.current = pointer
      emitPointerMove(pointer)
      emitSelectionUpdate(findHoveredTileId(position.x, position.y, tileSequenceState.tiles))
      ghostVisibleRef.current = true
      ghostRef.current = nextGhost
      setGhostVisible(true)
      setGhost(nextGhost)
      placeFromState(activeTileRef.current, nextGhost)
    },
    placeTileAtWithAck: async (input) => {
      const pointer = vec2(input.position.x, input.position.y)
      const tileSequenceState = sequencedStateRef.current
      const updated = resolveGhostFromPointer(pointer)
      const currentGhost = ghostRef.current
      const nextGhost = {
        ...currentGhost,
        target: updated.target,
        confidence: updated.confidence,
        valid: updated.valid,
        magnetStrength: updated.magnetStrength,
        rejection: updated.rejection,
        debugReason: updated.debugReason,
        guideSlotId: updated.guideSlotId,
        current: ghostVisibleRef.current ? currentGhost.current : updated.target,
      }

      lastPointerWorldRef.current = pointer
      emitPointerMove(pointer)
      emitSelectionUpdate(findHoveredTileId(input.position.x, input.position.y, tileSequenceState.tiles))
      ghostVisibleRef.current = true
      ghostRef.current = nextGhost
      setGhostVisible(true)
      setGhost(nextGhost)

      const result = tryPlaceTile(activeTileRef.current, nextGhost, tileSequenceState.tiles)
      if (!result.placed) {
        triggerInvalidPulse()
        return {
          placed: null,
          rejected: true,
          reason: 'PLACEMENT_REJECTED' as const,
        }
      }

      const tempTile = { ...result.placed, placedBy: clientId }
      setSequencedState((prev) => ({
        ...prev,
        tiles: [...prev.tiles, tempTile],
      }))

      const socket = socketRef.current
      if (!socket) {
        return {
          placed: null,
          rejected: true,
          reason: 'PLACEMENT_REJECTED' as const,
        }
      }

      if (isQuiltV2) {
        const topology = quiltProtocol?.topology
        const tileId = createServerTileId()
        const quiltTile = { ...result.placed, id: tileId, placedBy: clientId }
        const patchIds = topology ? findAffectedCachedPatchIds(quiltCache, quiltTile, topology) : null
        if (!quiltProtocol?.mutationEnabled || !topology || !patchIds || patchIds.length === 0) {
          triggerInvalidPulse()
          return { placed: null, rejected: true, reason: 'PLACEMENT_REJECTED' as const }
        }
        const revisions = expectedPatchRevisions(quiltCache, patchIds)
        if (Object.keys(revisions).length !== patchIds.length) {
          triggerInvalidPulse()
          return { placed: null, rejected: true, reason: 'PLACEMENT_REJECTED' as const }
        }
        if (input.expectedRevisionOverride !== undefined) {
          for (const patchId of patchIds) revisions[patchId] = input.expectedRevisionOverride
        }

        setQuiltCache((previous) => setQuiltOptimisticTile(previous, patchIds, quiltTile, crypto.randomUUID()))
        const ack = await new Promise<QuiltPlaceTileAck>((resolve) => {
          socket.emit('quilt_place_tile', {
            quiltId: topology.quiltId,
            operationId: crypto.randomUUID(),
            expectedPatchRevisions: revisions,
            tile: {
              tileId,
              shape: quiltTile.shape,
              color: quiltTile.color,
              material: quiltTile.material,
              transform: quiltTile.transform,
            },
          }, resolve)
        })

        setQuiltCache((previous) => {
          const cleared = clearQuiltOptimisticTile(previous, tileId)
          if (ack.status === 'rejected') return cleared
          return patchIds.reduce((next, patchId) => applyQuiltPatchPlacement(next, patchId, {
            ...ack.tile,
            placedBy: clientId,
          }, {
            patchId,
            opSeq: ack.patchRevisions[patchId],
            revision: ack.patchRevisions[patchId],
            eventId: ack.eventIds[patchId],
          }), cleared)
        })

        if (ack.status === 'rejected') {
          if (ack.code === 'STALE_REVISION') {
            clientTelemetryRef.current.resyncEvents += 1
            setQuiltSubscriptionEpoch((previous) => previous + 1)
          }
          triggerInvalidPulse()
          return {
            placed: null,
            rejected: true,
            reason: ack.code === 'STALE_REVISION' ? 'STALE_REVISION' as const : 'PLACEMENT_REJECTED' as const,
          }
        }
        return {
          placed: ack.tile,
          rejected: false,
          opSeq: Math.max(...Object.values(ack.patchRevisions)),
          newRevision: Math.max(...Object.values(ack.patchRevisions)),
        }
      }

      triggerInvalidPulse()
      return { placed: null, rejected: true, reason: 'PLACEMENT_REJECTED' as const }
    },
  }), [
    activeCollaborators,
    activeTile,
    attemptPlace,
    clientId,
    cameraPan,
    connectionState.status,
    emitPointerMove,
    emitSelectionUpdate,
    gridOverlayEnabled,
    isQuiltV2,
    mode,
    placeFromState,
    resolveGhostFromPointer,
    sequencedState.revision,
    quiltCache,
    quiltProtocol,
    selectedGridPatternId,
    visibleTiles,
    sessionId,
    socketRef,
    triggerInvalidPulse,
    updatePointer,
  ])

  const content = mode === 'canonical-loading' ? (
    <main className="auth-shell" aria-live="polite">Loading the canonical canvas...</main>
  ) : mode === 'canonical-unavailable' ? (
    <main className="auth-shell" role="alert">
      <section className="auth-panel">
        <h1>Canvas unavailable</h1>
        <p>{canonicalError ?? 'The canonical canvas is temporarily unavailable.'}</p>
      </section>
    </main>
  ) : (
    <main className={invalidPulse ? 'app-shell invalid-pulse' : 'app-shell'}>
      <div className="backdrop-gradient" />
      <AppHeader
        connectionState={connectionState.status}
        collaboratorCount={activeCollaborators.length}
        canUndo={mutationControlsEnabled && visibleTiles.some((tile) => isServerTileId(tile.id) && tile.placedBy === clientId)}
        onUndo={handleUndo}
        profileName={auth.principal?.profile.displayName ?? auth.principal?.profile.email}
        onLogout={() => void auth.logout()}
      />
      <div className="canvas-workspace">
        <section className="canvas-shell">
          <div className="status-strip" data-state={ghost.confidence}>
            <StatusIndicator connectionState={connectionState} />
            <span>{ghost.confidence.replace('-', ' ')}</span>
            <span>{visibleTiles.length} placed</span>
          </div>
          {activeCollaborators.length > 0 && (
            <div className="collaborator-roster" aria-label="Active collaborators">
              {activeCollaborators.map((collaborator) => (
                <span key={collaborator.clientId} className="collaborator-chip">
                  {formatCollaboratorLabel(collaborator.clientId, clientId)}
                </span>
              ))}
            </div>
          )}
          {canonicalDescriptor && (
            <section className="canonical-navigation" aria-label="Canonical patch navigation">
              <div className="canonical-navigation-heading">
                <div>
                  <h2>Canonical Quilt</h2>
                  <p>
                    {focusedCanonicalPatch
                      ? `Patch ${focusedCanonicalPatch.row}, ${focusedCanonicalPatch.column}`
                      : 'Choose a patch to focus'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => focusCanonicalPatch({
                    quiltId: canonicalDescriptor.quiltId,
                    patchId: canonicalDescriptor.initialPatch.id,
                    row: canonicalDescriptor.initialPatch.row,
                    column: canonicalDescriptor.initialPatch.column,
                    centerX: canonicalDescriptor.originX + (canonicalDescriptor.initialPatch.column + 0.5) * canonicalDescriptor.patchWidth,
                    centerY: canonicalDescriptor.originY + (canonicalDescriptor.initialPatch.row + 0.5) * canonicalDescriptor.patchHeight,
                  })}
                >
                  Root
                </button>
              </div>
            </section>
          )}
          <GridOverlayControls
            enabled={gridOverlayEnabled}
            patterns={constructibleGridPatterns}
            selectedPatternId={selectedGridPatternId}
            activeShape={activeTile.shape}
            announcement={gridOverlayAnnouncement}
            onEnabledChange={(enabled) => {
              setGridOverlayEnabled(enabled)
              setGridOverlayAnnouncement(
                enabled && selectedGridPattern
                  ? `${selectedGridPattern.label} grid enabled.`
                  : '',
              )
            }}
            onPatternChange={(patternId) => {
              const pattern = constructibleGridPatterns.find((entry) => entry.id === patternId)
              setSelectedGridPatternId(patternId)
              setGridOverlayAnnouncement(pattern ? `Grid pattern changed to ${pattern.label}.` : '')
            }}
          />
          <CanvasErrorBoundary>
            <Suspense fallback={<CanvasLoadingFallback />}>
              <MosaicScene
                tiles={visibleTiles}
                clientId={clientId}
                activeShape={activeTile.shape}
                ghost={{
                  transform: ghost.current,
                  confidence: ghost.confidence,
                  color: activeTile.color,
                  material: activeTile.material,
                  visible: ghostVisible,
                }}
                onPointerMove={updatePointer}
                onPointerDown={updatePointer}
                onPointerUp={mutationControlsEnabled ? attemptPlace : () => undefined}
                onRotateDrag={(deltaX) => dispatchActiveTileUi({ type: 'rotate-fine', delta: deltaX * (Math.PI / 200) })}
                remoteCursors={remoteCursors}
                remoteSelections={remoteSelections}
                gridOverlay={gridOverlayEnabled && selectedGridPattern
                  ? {
                      pattern: selectedGridPattern,
                      activeSlotId: ghost.guideSlotId,
                      bounds: ownedPatchBounds,
                    }
                  : undefined}
                worldBounds={worldBounds}
                topology={isQuiltV2 && quiltProtocol.topology?.topology === 'toroidal' ? quiltProtocol.topology : undefined}
                onSceneMetrics={(metrics) => {
                  sceneMetricsRef.current = metrics
                }}
                cameraPan={cameraPan}
                cameraPolicy={cameraPolicy}
                onCameraPan={(deltaX, deltaY) => {
                  setCameraPan((prev) => ({
                    x: prev.x - deltaX * cameraPolicy.panSensitivity,
                    y: prev.y + deltaY * cameraPolicy.panSensitivity,
                  }))
                }}
                onViewportChanged={onViewportChanged}
                onZoomTierChanged={(zoom) => {
                  const previousTier = zoomTierRef.current
                  const nextTier = resolveZoomTier(previousTier, zoom)
                  if (nextTier === previousTier) {
                    return
                  }

                  zoomTierRef.current = nextTier
                  setZoomTier(nextTier)
                  clientTelemetryRef.current.tierTransitions += 1
                  console.info('chunk_zoom_tier_transition', {
                    from: previousTier,
                    to: nextTier,
                    zoom,
                    totalTransitions: clientTelemetryRef.current.tierTransitions,
                  })
                }}
              />
            </Suspense>
          </CanvasErrorBoundary>
          {canvasDebug && ghostVisible && (
            <div className="debug-overlay">
              <div className="debug-row">
                <span className="debug-label">state</span>
                <span className={`debug-value debug-state-${ghost.confidence}`}>{ghost.confidence}</span>
              </div>
              <div className="debug-row">
                <span className="debug-label">reason</span>
                <span className="debug-value">{ghost.debugReason}</span>
              </div>
              <div className="debug-row">
                <span className="debug-label">pos</span>
                <span className="debug-value">
                  {ghost.target.position.x.toFixed(2)}, {ghost.target.position.y.toFixed(2)}
                </span>
              </div>
              <div className="debug-row">
                <span className="debug-label">tiles</span>
                <span className="debug-value">{visibleTiles.length}</span>
              </div>
            </div>
          )}
        </section>
        {mutationControlsEnabled && (
          <TilePalette
            activeTile={activeTile}
            paletteName={paletteName}
            onPaletteName={handlePaletteChange}
            paletteOpen={paletteOpen}
            onTogglePaletteOpen={() => dispatchActiveTileUi({ type: 'toggle-palette-open' })}
            onShape={(shape) => dispatchActiveTileUi({ type: 'set-shape', shape })}
            onMaterial={(material) => dispatchActiveTileUi({ type: 'set-material', material })}
            onColor={(color) => dispatchActiveTileUi({ type: 'set-color', color })}
            paletteFallbackAnnouncement={paletteFallbackAnnouncement}
          />
        )}
      </div>
    </main>
  )

  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={300}>{content}</TooltipProvider>
  )
}

function App() {
  const auth = useAuthSession()

  if (auth.status === 'loading') {
    return <main className="auth-shell">Loading your secure workspace...</main>
  }

  if (auth.status !== 'authenticated' || !auth.principal) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <h1>Mosaic Atelier</h1>
          <p>{auth.error ?? 'Sign in to view your canvases.'}</p>
          {auth.testIdentity && (
            <div className="test-identity-control">
              <label htmlFor="test-identity">Local test user</label>
              <div className="test-identity-presets" aria-label="Local test user presets">
                {['dev-alice', 'dev-bob'].map((subject) => (
                  <button
                    key={subject}
                    type="button"
                    className={auth.testIdentity?.subject === subject ? 'active' : undefined}
                    onClick={() => auth.testIdentity?.setSubject(subject)}
                  >
                    {subject === 'dev-alice' ? 'Alice' : 'Bob'}
                  </button>
                ))}
              </div>
              <input
                id="test-identity"
                value={auth.testIdentity.subject}
                onChange={(event) => auth.testIdentity?.setSubject(event.target.value)}
                autoComplete="off"
              />
            </div>
          )}
          <button
            type="button"
            className="active"
            onClick={() => {
              clearCanonicalPatchLink()
              void auth.login()
            }}
          >
            Sign in
          </button>
        </section>
      </main>
    )
  }

  return <ProtectedApp />
}

export default App
