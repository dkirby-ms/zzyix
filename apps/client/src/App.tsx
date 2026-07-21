import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { vec2 } from './domain/math2d'
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
  type SessionSummary,
} from './network/session'
import { resolveServerUrl } from './network/serverUrl'
import { useSocketConnection } from './network/useSocketConnection'
import type {
  ClientJoinedPayload,
  ClientLeftPayload,
  ClientPresence,
  PlaceTileAck,
  PlaceTilePayload,
  PointerUpdatePayload,
  SelectionUpdatePayload,
  ResyncRequiredPayload,
  SessionSnapshotPayload,
  TilePlacedPayload,
  TileRemovedPayload,
} from '../../server/src/contracts'
import { MosaicScene } from './render/MosaicScene'
import { ControlsPanel } from './ui/ControlsPanel'
import { LobbyScreen } from './ui/LobbyScreen'
import { palettes } from './ui/palettes'
import type { PaletteName } from './ui/palettes'
import './App.css'

type RemoteCollaborator = {
  clientId: string
  present: boolean
  pointer?: { x: number; y: number }
  selectionTileId?: string
  lastSeenAt: number
}

type RemoteCollaboratorMap = Record<string, RemoteCollaborator>

const COLLABORATOR_SIGNAL_TTL_MS = 8_000
const COLLABORATOR_CLEANUP_INTERVAL_MS = 1_000
const COLLABORATION_EMIT_INTERVAL_MS = 40

const updateCollaborator = (
  collaborators: RemoteCollaboratorMap,
  clientId: string,
  patch: Partial<RemoteCollaborator>,
): RemoteCollaboratorMap => {
  const previous = collaborators[clientId]
  const hasPresent = Object.prototype.hasOwnProperty.call(patch, 'present')
  const hasPointer = Object.prototype.hasOwnProperty.call(patch, 'pointer')
  const hasSelection = Object.prototype.hasOwnProperty.call(patch, 'selectionTileId')
  const next: RemoteCollaborator = {
    clientId,
    present: hasPresent ? (patch.present as boolean) : previous?.present ?? false,
    pointer: hasPointer ? patch.pointer : previous?.pointer,
    selectionTileId: hasSelection ? patch.selectionTileId : previous?.selectionTileId,
    lastSeenAt: patch.lastSeenAt ?? previous?.lastSeenAt ?? Date.now(),
  }

  return {
    ...collaborators,
    [clientId]: next,
  }
}

export const mergeCollaboratorsFromSnapshot = (
  previous: RemoteCollaboratorMap,
  snapshotClients: ClientPresence[],
): RemoteCollaboratorMap => {
  const next: RemoteCollaboratorMap = {}
  const now = Date.now()
  const snapshotClientIds = new Set<string>()

  for (const client of snapshotClients) {
    snapshotClientIds.add(client.clientId)
    const existing = previous[client.clientId]
    next[client.clientId] = {
      clientId: client.clientId,
      present: true,
      pointer: client.pointer ?? existing?.pointer,
      selectionTileId: existing?.selectionTileId,
      lastSeenAt: now,
    }
  }

  for (const [remoteClientId, collaborator] of Object.entries(previous)) {
    if (snapshotClientIds.has(remoteClientId)) {
      continue
    }

    if (now - collaborator.lastSeenAt > COLLABORATOR_SIGNAL_TTL_MS && !collaborator.present) {
      continue
    }

    next[remoteClientId] = {
      ...collaborator,
      present: false,
    }
  }

  return next
}

export const evictStaleCollaboratorSignals = (
  previous: RemoteCollaboratorMap,
  now: number,
): RemoteCollaboratorMap => {
  let hasChanges = false
  const next: RemoteCollaboratorMap = {}

  for (const [clientId, collaborator] of Object.entries(previous)) {
    const age = now - collaborator.lastSeenAt

    if (age <= COLLABORATOR_SIGNAL_TTL_MS) {
      next[clientId] = collaborator
      continue
    }

    if (collaborator.present) {
      next[clientId] = {
        ...collaborator,
        present: false,
        pointer: undefined,
        selectionTileId: undefined,
      }
      if (
        collaborator.pointer !== undefined
        || collaborator.selectionTileId !== undefined
        || collaborator.present
      ) {
        hasChanges = true
      }
      continue
    }

    hasChanges = true
  }

  return hasChanges ? next : previous
}

const formatCollaboratorLabel = (remoteClientId: string, localClientId: string): string => {
  if (remoteClientId === localClientId) {
    return 'You'
  }

  return remoteClientId.slice(0, 8)
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
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [mode, setMode] = useState<'lobby' | 'canvas'>('lobby')
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [lobbyLoading, setLobbyLoading] = useState(false)
  const [lobbyError, setLobbyError] = useState<string | null>(null)
  const [creatingSession, setCreatingSession] = useState(false)
  const [joiningSessionId, setJoiningSessionId] = useState<string | null>(null)
  const [previousSessionId, setPreviousSessionId] = useState<string | null>(null)
  const [collaborators, setCollaborators] = useState<RemoteCollaboratorMap>({})
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
      const nextSessionId = await createSession()
      enterCanvas(nextSessionId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create canvas'
      setLobbyError(message)
    } finally {
      setCreatingSession(false)
    }
  }, [enterCanvas])

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
  )

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
    const updated = updateGhostTarget(vec2(x, y), activeTile, sequencedState.tiles)
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
          cameraPan={cameraPan}
          onCameraPan={(deltaX, deltaY) => {
            const sensitivity = 0.02
            setCameraPan((prev) => ({
              x: prev.x - deltaX * sensitivity,
              y: prev.y + deltaY * sensitivity,
            }))
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
