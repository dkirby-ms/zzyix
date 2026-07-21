import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyChunkSubscriptionBudgets,
  shouldRecomputeVisibleChunks,
  vec2,
  viewportToChunkIds,
  type ChunkId,
  type ViewportBounds,
} from './domain/math2d'
import { getTileDefinition, normalizeAngle, quantizeRotation, transformPolygon } from './domain/tileGeometry'
import type { TileShape } from './domain/tileGeometry'
import {
  applySequencedSnapshot,
  createInitialGhost,
  createInitialSequencedTilesState,
  createServerTileId,
  isServerTileId,
  reconcileOptimisticPlacementAck,
  reconcileSequencedTilePlaced,
  reconcileSequencedTileRemoved,
  stepGhost,
  tryPlaceTile,
  updateGhostTarget,
} from './interaction/controller'
import type { ActiveTile, SequencedTilesState } from './interaction/controller'
import { ensureClientId } from './network/session'
import {
  createSession,
  getStoredSessionId,
  listSessions,
  setStoredSessionId,
  type CreateSessionOptions,
  type SessionSummary,
} from './network/session'
import { resolveServerUrl } from './network/serverUrl'
import { useSocketConnection } from './network/useSocketConnection'
import { DEFAULT_BOUNDED_WORLD_BOUNDS, RUNTIME_CHUNK_WORLD_SIZE } from '../../server/src/contracts'
import type {
  BoundsPolicy,
  CanvasSizePreset,
  ClientJoinedPayload,
  ClientLeftPayload,
  PlaceTileAck,
  PlaceTilePayload,
  PointerUpdatePayload,
  SelectionUpdatePayload,
  ResyncRequiredPayload,
  SessionSnapshotPayload,
  TilePlacedPayload,
  TileRemovedPayload,
  ChunkResyncRequiredPayload,
  ChunkSnapshotPayload,
  ChunkTilePlacedPayload,
  ChunkTileRemovedPayload,
  ChunkPayloadMode,
  RealtimeCapabilities,
} from '../../server/src/contracts'
import { MosaicScene } from './render/MosaicScene'
import { ControlsPanel } from './ui/ControlsPanel'
import { LobbyScreen } from './ui/LobbyScreen'
import { palettes } from './ui/palettes'
import type { PaletteName } from './ui/palettes'
import {
  COLLABORATION_EMIT_INTERVAL_MS,
  COLLABORATOR_CLEANUP_INTERVAL_MS,
  evictStaleCollaboratorSignals,
  formatCollaboratorLabel,
  mergeCollaboratorsFromSnapshot,
  updateCollaborator,
  type RemoteCollaboratorMap,
} from './domain/collaboratorUtils'
import './App.css'

const CHUNK_WORLD_SIZE = RUNTIME_CHUNK_WORLD_SIZE
const CHUNK_PREFETCH_RING = 1
const CHUNK_SOFT_SUBSCRIPTION_LIMIT = 64
const CHUNK_HARD_SUBSCRIPTION_LIMIT = 128
const CHUNK_MOVEMENT_HYSTERESIS_RATIO = 0.25
const CHUNK_ZOOM_HYSTERESIS = 0.5
const AGGREGATE_TIER_ENTER_ZOOM = 45
const AGGREGATE_TIER_EXIT_ZOOM = 47

type ZoomTier = 'fine' | 'aggregate'

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

const shouldReplaceChunkTilesForSnapshot = (payloadMode: ChunkPayloadMode): boolean => payloadMode === 'fine'

const DEFAULT_WORLD_BOUNDS = DEFAULT_BOUNDED_WORLD_BOUNDS

const resolveWorldBounds = (canvasPolicy: BoundsPolicy | undefined, sessionPolicy: BoundsPolicy | undefined) => {
  const policy = canvasPolicy ?? sessionPolicy

  if (policy?.mode === 'bounded') {
    return policy.bounds
  }

  return DEFAULT_WORLD_BOUNDS
}

function App() {
  const [sequencedState, setSequencedState] = useState<SequencedTilesState>(
    createInitialSequencedTilesState(),
  )
  const [shape, setShape] = useState<TileShape>('square')
  const [material, setMaterial] = useState<'ceramic' | 'glass' | 'stone'>('ceramic')
  const [paletteName, setPaletteName] = useState<PaletteName>('terracotta')
  const [color, setColor] = useState<string>(palettes.terracotta[0])
  const [rotation, setRotation] = useState(0)
  const [mirrored, setMirrored] = useState(false)
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
  const [mode, setMode] = useState<'lobby' | 'canvas'>('lobby')
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [lobbyLoading, setLobbyLoading] = useState(false)
  const [lobbyError, setLobbyError] = useState<string | null>(null)
  const [creatingSession, setCreatingSession] = useState(false)
  const [selectedCanvasPreset, setSelectedCanvasPreset] = useState<CanvasSizePreset>('expanded')
  const [joiningSessionId, setJoiningSessionId] = useState<string | null>(null)
  const [previousSessionId, setPreviousSessionId] = useState<string | null>(null)
  const [collaborators, setCollaborators] = useState<RemoteCollaboratorMap>({})
  const [activeChunkIds, setActiveChunkIds] = useState<ChunkId[]>([])
  const [zoomTier, setZoomTier] = useState<ZoomTier>('fine')
  const [realtimeCapabilities, setRealtimeCapabilities] = useState<RealtimeCapabilities | null>(null)
  const [worldBounds, setWorldBounds] = useState(DEFAULT_WORLD_BOUNDS)
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
  const clientId = useMemo(() => ensureClientId(), [])
  const serverUrl = useMemo(() => resolveServerUrl(), [])

  const activeTile: ActiveTile = useMemo(
    () => ({
      shape,
      color,
      material,
      rotation,
      mirrored,
    }),
    [shape, color, material, rotation, mirrored],
  )

  const loadSessions = useCallback(async (): Promise<void> => {
    setLobbyLoading(true)
    setLobbyError(null)

    try {
      const listedSessions = await listSessions()
      setSessions(listedSessions)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load canvases'
      setLobbyError(message)
    } finally {
      setLobbyLoading(false)
    }
  }, [])

  useEffect(() => {
    setSessionId(null)
    setMode('lobby')
    setPreviousSessionId(getStoredSessionId())
    void loadSessions()
  }, [loadSessions])

  const enterCanvas = useCallback((nextSessionId: string): void => {
    setStoredSessionId(nextSessionId)
    setPreviousSessionId(nextSessionId)
    setSessionId(nextSessionId)
    setMode('canvas')
  }, [])

  const handleJoinSession = useCallback((nextSessionId: string): void => {
    setJoiningSessionId(nextSessionId)
    try {
      enterCanvas(nextSessionId)
    } finally {
      setJoiningSessionId(null)
    }
  }, [enterCanvas])

  const handleCreateSession = useCallback(async (): Promise<void> => {
    setCreatingSession(true)
    setLobbyError(null)

    try {
      const createOptions: CreateSessionOptions = {
        canvasPreset: selectedCanvasPreset,
      }
      const nextSessionId = await createSession(createOptions)
      enterCanvas(nextSessionId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create canvas'
      setLobbyError(message)
    } finally {
      setCreatingSession(false)
    }
  }, [enterCanvas, selectedCanvasPreset])

  const triggerInvalidPulse = useCallback((): void => {
    setInvalidPulse(true)
    window.setTimeout(() => setInvalidPulse(false), 180)
  }, [])

  const requestSnapshot = useCallback((): void => {
    const socket = socketActionRef.current
    if (!socket) return

    socket.emit('request_snapshot')
  }, [])

  const onSnapshot = useCallback((payload: SessionSnapshotPayload): void => {
    setRealtimeCapabilities(payload.realtimeCapabilities ?? null)
    setWorldBounds(resolveWorldBounds(payload.canvasConfig?.boundsPolicy, payload.session.boundsPolicy))
    setSequencedState(
      applySequencedSnapshot({
        tiles: payload.session.tiles,
        lastOpSeq: payload.lastOpSeq,
        revision: payload.revision,
      }),
    )
    setCollaborators((prev) => mergeCollaboratorsFromSnapshot(prev, payload.clients))
  }, [])

  const onTilePlaced = useCallback((payload: TilePlacedPayload): void => {
    setSequencedState((prev) => {
      const next = reconcileSequencedTilePlaced(prev, {
        tile: { ...payload.tile, placedBy: payload.placedBy },
        opSeq: payload.opSeq,
        revision: payload.revision,
      })

      if (next.requiresSnapshot) {
        requestSnapshot()
      }

      return next
    })
  }, [requestSnapshot])

  const onTileRemoved = useCallback((payload: TileRemovedPayload): void => {
    setSequencedState((prev) => {
      const next = reconcileSequencedTileRemoved(prev, {
        tileId: payload.tileId,
        opSeq: payload.opSeq,
        revision: payload.revision,
      })

      if (next.requiresSnapshot) {
        requestSnapshot()
      }

      return next
    })
  }, [requestSnapshot])

  const onResyncRequired = useCallback((payload: ResyncRequiredPayload): void => {
    console.warn('resync_required received:', { reason: payload.reason, currentOpSeq: payload.currentOpSeq })
    requestSnapshot()
  }, [requestSnapshot])

  const onChunkSnapshot = useCallback((payload: ChunkSnapshotPayload): void => {
    setSequencedState((prev) => {
      const incomingChunkIds = new Set(payload.chunks.map((chunk) => chunk.chunkId))
      const replaceChunkTiles = shouldReplaceChunkTilesForSnapshot(payload.payloadMode)
      const keptTiles = replaceChunkTiles
        ? prev.tiles.filter((tile) =>
          !incomingChunkIds.has(worldToChunkId(tile.transform.position.x, tile.transform.position.y, CHUNK_WORLD_SIZE)))
        : prev.tiles
      const incomingTiles = payload.chunks.flatMap((chunk) => chunk.tiles)
      const mergedTiles = [...keptTiles, ...incomingTiles]

      return {
        tiles: mergedTiles,
        lastOpSeq: Math.max(prev.lastOpSeq, payload.serverOpSeq),
        revision: Math.max(prev.revision, payload.serverRevision),
        requiresSnapshot: false,
      }
    })
  }, [])

  const onChunkTilePlaced = useCallback((payload: ChunkTilePlacedPayload): void => {
    setSequencedState((prev) => {
      const next = reconcileSequencedTilePlaced(prev, {
        tile: { ...payload.tile, placedBy: payload.placedBy },
        opSeq: payload.opSeq,
        revision: payload.revision,
      })

      if (next.requiresSnapshot) {
        requestSnapshot()
      }

      return next
    })
  }, [requestSnapshot])

  const onChunkTileRemoved = useCallback((payload: ChunkTileRemovedPayload): void => {
    setSequencedState((prev) => {
      const next = reconcileSequencedTileRemoved(prev, {
        tileId: payload.tileId,
        opSeq: payload.opSeq,
        revision: payload.revision,
      })

      if (next.requiresSnapshot) {
        requestSnapshot()
      }

      return next
    })
  }, [requestSnapshot])

  const onChunkResyncRequired = useCallback((payload: ChunkResyncRequiredPayload): void => {
    clientTelemetryRef.current.resyncEvents += 1
    console.info('chunk_resync_required_telemetry', {
      chunkId: payload.chunkId,
      reason: payload.reason,
      payloadMode: payload.payloadMode,
      currentOpSeq: payload.currentOpSeq,
      currentRevision: payload.currentRevision,
      totalResyncEvents: clientTelemetryRef.current.resyncEvents,
    })

    const socket = socketActionRef.current
    if (!socket || !sessionId) {
      requestSnapshot()
      return
    }

    socket.emit('request_chunk_snapshot', {
      canvasId: sessionId,
      chunks: [payload.chunkId],
      payloadMode: payload.payloadMode,
    })
  }, [requestSnapshot, sessionId])

  const onPointerUpdate = useCallback((payload: PointerUpdatePayload): void => {
    setCollaborators((prev) => updateCollaborator(prev, payload.clientId, {
      present: true,
      pointer: payload.position,
      lastSeenAt: Date.now(),
    }))
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

  const onSelectionUpdate = useCallback((payload: SelectionUpdatePayload): void => {
    setCollaborators((prev) => updateCollaborator(prev, payload.clientId, {
      present: true,
      selectionTileId: payload.tileId,
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

  const emitPointerMove = useCallback((position: { x: number; y: number }): void => {
    const socket = socketActionRef.current
    if (!socket || !sessionId) {
      return
    }

    const throttleState = pointerEmitThrottleRef.current
    const now = Math.max(Date.now(), throttleState.lastSentAt)
    const elapsed = now - throttleState.lastSentAt

    const flushPointerMove = (nextPosition: { x: number; y: number }): void => {
      socket.emit('pointer_move', { position: nextPosition })
      throttleState.lastSentAt = Math.max(Date.now(), throttleState.lastSentAt)
      throttleState.pendingPosition = undefined
    }

    if (elapsed >= COLLABORATION_EMIT_INTERVAL_MS) {
      if (throttleState.timeoutId !== null) {
        window.clearTimeout(throttleState.timeoutId)
        throttleState.timeoutId = null
      }
      flushPointerMove(position)
      return
    }

    throttleState.pendingPosition = position

    if (throttleState.timeoutId !== null) {
      return
    }

    throttleState.timeoutId = window.setTimeout(() => {
      throttleState.timeoutId = null
      const pendingPosition = throttleState.pendingPosition
      if (!pendingPosition) {
        return
      }
      flushPointerMove(pendingPosition)
    }, Math.max(0, COLLABORATION_EMIT_INTERVAL_MS - elapsed))
  }, [sessionId])

  const emitSelectionUpdate = useCallback((tileId?: string): void => {
    const socket = socketActionRef.current
    if (!socket || !sessionId) {
      return
    }

    const throttleState = selectionEmitThrottleRef.current
    const now = Math.max(Date.now(), throttleState.lastSentAt)
    const elapsed = now - throttleState.lastSentAt

    const flushSelectionUpdate = (nextTileId?: string): void => {
      if (throttleState.lastTileId === nextTileId) {
        throttleState.pendingTileId = undefined
        return
      }

      socket.emit('selection_update', {
        canvasId: sessionId,
        clientId,
        tileId: nextTileId,
        updatedAt: Date.now(),
      })

      throttleState.lastSentAt = Math.max(Date.now(), throttleState.lastSentAt)
      throttleState.lastTileId = nextTileId
      throttleState.pendingTileId = undefined
    }

    if (elapsed >= COLLABORATION_EMIT_INTERVAL_MS) {
      if (throttleState.timeoutId !== null) {
        window.clearTimeout(throttleState.timeoutId)
        throttleState.timeoutId = null
      }
      flushSelectionUpdate(tileId)
      return
    }

    throttleState.pendingTileId = tileId
    if (throttleState.timeoutId !== null) {
      return
    }

    throttleState.timeoutId = window.setTimeout(() => {
      throttleState.timeoutId = null
      flushSelectionUpdate(throttleState.pendingTileId)
    }, Math.max(0, COLLABORATION_EMIT_INTERVAL_MS - elapsed))
  }, [clientId, sessionId])

  const socketRef = useSocketConnection(
    serverUrl,
    sessionId,
    clientId,
    onSnapshot,
    onTilePlaced,
    onTileRemoved,
    onResyncRequired,
    socketActionRef,
    onPointerUpdate,
    onClientJoined,
    onClientLeft,
    onSelectionUpdate,
    onChunkSnapshot,
    onChunkTilePlaced,
    onChunkTileRemoved,
    onChunkResyncRequired,
    realtimeCapabilities?.chunkStreamingEnabled ?? false,
  )

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

    const nextChunkIds = applyChunkSubscriptionBudgets(
      viewportToChunkIds(payload.viewport, CHUNK_WORLD_SIZE, CHUNK_PREFETCH_RING),
      CHUNK_SOFT_SUBSCRIPTION_LIMIT,
      CHUNK_HARD_SUBSCRIPTION_LIMIT,
    )

    setActiveChunkIds(nextChunkIds)
  }, [])

  useEffect(() => {
    const socket = socketActionRef.current
    if (!socket || !sessionId) {
      return
    }

    if (!realtimeCapabilities || !realtimeCapabilities.chunkStreamingEnabled) {
      if (subscribedChunkIdsRef.current.size > 0) {
        socket.emit('unsubscribe_chunks', {
          canvasId: sessionId,
          chunks: Array.from(subscribedChunkIdsRef.current),
        })
        subscribedChunkIdsRef.current = new Set()
        setActiveChunkIds([])
      }
      return
    }

    const payloadMode: ChunkPayloadMode = zoomTier === 'aggregate' ? 'aggregate' : 'fine'

    const previous = subscribedChunkIdsRef.current
    const next = new Set(activeChunkIds)
    const subscribe: ChunkId[] = []
    const unsubscribe: ChunkId[] = []

    for (const chunkId of next) {
      if (!previous.has(chunkId)) {
        subscribe.push(chunkId)
      }
    }

    for (const chunkId of previous) {
      if (!next.has(chunkId)) {
        unsubscribe.push(chunkId)
      }
    }

    if (unsubscribe.length > 0) {
      socket.emit('unsubscribe_chunks', {
        canvasId: sessionId,
        chunks: unsubscribe,
      })
      clientTelemetryRef.current.unsubscribeEvents += unsubscribe.length
    }

    if (subscribe.length > 0) {
      socket.emit('subscribe_chunks', {
        canvasId: sessionId,
        chunks: subscribe,
        payloadMode,
      })
      clientTelemetryRef.current.subscribeEvents += subscribe.length
    }

    if (subscribe.length > 0 || unsubscribe.length > 0) {
      console.info('chunk_subscription_churn', {
        zoomTier,
        payloadMode,
        subscribeCount: subscribe.length,
        unsubscribeCount: unsubscribe.length,
        activeCount: next.size,
        totalSubscribeEvents: clientTelemetryRef.current.subscribeEvents,
        totalUnsubscribeEvents: clientTelemetryRef.current.unsubscribeEvents,
      })
    }

    subscribedChunkIdsRef.current = next
  }, [activeChunkIds, sessionId, zoomTier, realtimeCapabilities])

  useEffect(() => {
    const subscribedChunkIds = subscribedChunkIdsRef
    const viewportRef = lastChunkViewportRef
    const socketRef = socketActionRef

    return () => {
      if (!sessionId || subscribedChunkIds.current.size === 0) {
        return
      }

      const socket = socketRef.current
      if (!socket) {
        return
      }

      socket.emit('unsubscribe_chunks', {
        canvasId: sessionId,
        chunks: Array.from(subscribedChunkIds.current),
      })
      subscribedChunkIds.current = new Set()
      setActiveChunkIds([])
      viewportRef.current = null
    }
  }, [sessionId])

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

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'r') {
        const direction = event.shiftKey ? -1 : 1
        setRotation((prev) => quantizeRotation(prev + direction * (Math.PI / 2)))
      }

      if (event.key === ']') {
        setRotation((prev) => normalizeAngle(prev + Math.PI / 12))
      }

      if (event.key === '[') {
        setRotation((prev) => normalizeAngle(prev - Math.PI / 12))
      }

      if (event.key.toLowerCase() === 'f') {
        setMirrored((prev) => !prev)
      }

      if (event.key.toLowerCase() === 'z') {
        const socket = socketRef.current
        if (!socket) return

        setSequencedState((prev) => {
          const lastSettled = [...prev.tiles]
            .reverse()
            .find((tile) => isServerTileId(tile.id) && tile.placedBy === clientId)
          if (!lastSettled) {
            return prev
          }

          socket.emit('remove_tile', { tileId: lastSettled.id, expectedRevision: prev.revision }, (ack) => {
            if (!ack.removed) {
              requestSnapshot()
              return
            }

            setSequencedState((current) => ({
              ...reconcileSequencedTileRemoved(current, {
                tileId: lastSettled.id,
                opSeq: ack.opSeq,
                revision: ack.newRevision,
              }),
              revision: ack.newRevision,
            }))
          })

          return prev
        })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clientId, requestSnapshot, socketRef])

  useEffect(() => {
    setGhost((prev) => ({
      ...prev,
      target: {
        ...prev.target,
        rotation,
        mirrored,
      },
    }))
  }, [rotation, mirrored])

  const updatePointer = (x: number, y: number): void => {
    emitPointerMove({ x, y })
    const updated = updateGhostTarget(vec2(x, y), activeTile, sequencedState.tiles, worldBounds)
    emitSelectionUpdate(findHoveredTileId(x, y, sequencedState.tiles))
    setGhostVisible(true)
    setGhost((prev) => ({
      ...prev,
      target: updated.target,
      confidence: updated.confidence,
      valid: updated.valid,
      magnetStrength: updated.magnetStrength,
      rejection: updated.rejection,
      debugReason: updated.debugReason,
      current: ghostVisible ? prev.current : updated.target,
    }))
  }

  const attemptPlace = (): void => {
    const result = tryPlaceTile(activeTile, ghost, sequencedState.tiles)
    if (!result.placed) {
      triggerInvalidPulse()
      return
    }

    const tempTile = { ...result.placed, placedBy: clientId }

    setSequencedState((prev) => ({
      ...prev,
      tiles: [...prev.tiles, tempTile],
    }))

    const socket = socketRef.current
    if (!socket) return

    const payload: PlaceTilePayload = {
      tileId: createServerTileId(),
      shape: tempTile.shape,
      color: tempTile.color,
      material: tempTile.material,
      transform: tempTile.transform,
      expectedRevision: sequencedState.revision,
    }

    socket.emit('place_tile', payload, (ack: PlaceTileAck) => {
      if (ack.rejected) {
        setSequencedState((prev) => reconcileOptimisticPlacementAck(prev, tempTile, ack))
        triggerInvalidPulse()
        return
      }

      emitSelectionUpdate(ack.placed.id)
      setSequencedState((prev) => reconcileOptimisticPlacementAck(prev, tempTile, ack))
    })
  }

  const handleUndo = (): void => {
    const lastSettled = [...sequencedState.tiles].reverse().find((tile) => isServerTileId(tile.id) && tile.placedBy === clientId)
    if (!lastSettled) return

    const socket = socketRef.current
    if (!socket) return

    socket.emit('remove_tile', { tileId: lastSettled.id, expectedRevision: sequencedState.revision }, (ack) => {
      if (!ack.removed) {
        requestSnapshot()
        return
      }

      setSequencedState((prev) => ({
        ...reconcileSequencedTileRemoved(prev, {
          tileId: lastSettled.id,
          opSeq: ack.opSeq,
          revision: ack.newRevision,
        }),
        revision: ack.newRevision,
      }))
    })
  }

  if (mode === 'lobby') {
    return (
      <main className="lobby-shell">
        <div className="backdrop-gradient" />
        <LobbyScreen
          sessions={sessions}
          loading={lobbyLoading}
          error={lobbyError}
          previousSessionId={previousSessionId}
          creating={creatingSession}
          joiningSessionId={joiningSessionId}
          onRefresh={() => void loadSessions()}
          selectedCanvasPreset={selectedCanvasPreset}
          onCanvasPresetChange={setSelectedCanvasPreset}
          onCreate={() => void handleCreateSession()}
          onJoin={handleJoinSession}
        />
      </main>
    )
  }

  return (
    <main className={invalidPulse ? 'app-shell invalid-pulse' : 'app-shell'}>
      <div className="backdrop-gradient" />
      <ControlsPanel
        shape={shape}
        onShape={setShape}
        material={material}
        onMaterial={setMaterial}
        paletteName={paletteName}
        onPaletteName={(name) => {
          setPaletteName(name)
          setColor(palettes[name][0])
        }}
        color={color}
        onColor={setColor}
        rotation={rotation}
        onRotateCw={() => setRotation((prev) => quantizeRotation(prev + Math.PI / 2))}
        onRotateCcw={() => setRotation((prev) => quantizeRotation(prev - Math.PI / 2))}
        onRotateFine={() => setRotation((prev) => normalizeAngle(prev + Math.PI / 12))}
        onRotateFineCcw={() => setRotation((prev) => normalizeAngle(prev - Math.PI / 12))}
        onMirror={() => setMirrored((prev) => !prev)}
        canUndo={sequencedState.tiles.some((tile) => isServerTileId(tile.id) && tile.placedBy === clientId)}
        onUndo={handleUndo}
        clearDisabled
        onClear={() => {}}
      />

      <section className="canvas-shell">
        <div className="status-strip" data-state={ghost.confidence}>
          <span>{ghost.confidence.replace('-', ' ')}</span>
          <span>{sequencedState.tiles.length} placed</span>
          <span>{activeCollaborators.length} active</span>
          <span>{zoomTier} zoom</span>
          <span>
            bounds {worldBounds.minX.toFixed(1)}..{worldBounds.maxX.toFixed(1)} / {worldBounds.minY.toFixed(1)}..
            {worldBounds.maxY.toFixed(1)}
          </span>
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

        <MosaicScene
          tiles={sequencedState.tiles}
          activeShape={shape}
          ghost={{
            transform: ghost.current,
            confidence: ghost.confidence,
            color,
            material,
            visible: ghostVisible,
          }}
          onPointerMove={updatePointer}
          onPointerDown={updatePointer}
          onPointerUp={attemptPlace}
          onRotateDrag={(deltaX) =>
            setRotation((prev) => normalizeAngle(prev + deltaX * (Math.PI / 200)))
          }
          remoteCursors={remoteCursors}
          remoteSelections={remoteSelections}
          worldBounds={worldBounds}
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

        {ghostVisible && (
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
              <span className="debug-value">{sequencedState.tiles.length}</span>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
