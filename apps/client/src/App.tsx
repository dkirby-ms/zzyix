import { useCallback, useEffect, useMemo, useState } from 'react'
import { vec2 } from './domain/math2d'
import { normalizeAngle, quantizeRotation } from './domain/tileGeometry'
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
import { ensureClientId, ensureSession } from './network/session'
import { useSocketConnection } from './network/useSocketConnection'
import type {
  PlaceTileAck,
  PlaceTilePayload,
  SessionSnapshotPayload,
  TilePlacedPayload,
  TileRemovedPayload,
} from '../../server/src/contracts'
import { MosaicScene } from './render/MosaicScene'
import { ControlsPanel } from './ui/ControlsPanel'
import { palettes } from './ui/palettes'
import type { PaletteName } from './ui/palettes'
import './App.css'

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
  const clientId = useMemo(() => ensureClientId(), [])
  const serverUrl = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

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

  useEffect(() => {
    ensureSession()
      .then(setSessionId)
      .catch((error: unknown) => {
        console.error('Session bootstrap failed:', error)
      })
  }, [])

  const triggerInvalidPulse = useCallback((): void => {
    setInvalidPulse(true)
    window.setTimeout(() => setInvalidPulse(false), 180)
  }, [])

  const requestSnapshot = useCallback((): void => {
    const socket = socketRef.current
    if (!socket) return

    window.setTimeout(() => {
      socket.disconnect()
      socket.connect()
    }, 0)
  }, [])

  const onSnapshot = useCallback((payload: SessionSnapshotPayload): void => {
    setSequencedState(
      applySequencedSnapshot({
        tiles: payload.session.tiles,
        lastOpSeq: payload.lastOpSeq,
      }),
    )
  }, [])

  const onTilePlaced = useCallback((payload: TilePlacedPayload): void => {
    setSequencedState((prev) => {
      const next = reconcileSequencedTilePlaced(prev, {
        tile: payload.tile,
        opSeq: payload.opSeq,
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
      })

      if (next.requiresSnapshot) {
        requestSnapshot()
      }

      return next
    })
  }, [requestSnapshot])

  const socketRef = useSocketConnection(
    serverUrl,
    sessionId,
    clientId,
    onSnapshot,
    onTilePlaced,
    onTileRemoved,
  )

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
        const lastSettled = [...sequencedState.tiles].reverse().find((tile) => isServerTileId(tile.id))
        if (!lastSettled) return

        const socket = socketRef.current
        if (!socket) return

        socket.emit('remove_tile', { tileId: lastSettled.id }, (ack) => {
          if (!ack.removed) {
            requestSnapshot()
            return
          }

          setSequencedState((prev) =>
            reconcileSequencedTileRemoved(prev, {
              tileId: lastSettled.id,
              opSeq: ack.opSeq,
            }),
          )
        })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [requestSnapshot, sequencedState.tiles, socketRef])

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
    const updated = updateGhostTarget(vec2(x, y), activeTile, sequencedState.tiles)
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

    const tempTile = result.placed

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
    }

    socket.emit('place_tile', payload, (ack: PlaceTileAck) => {
      if (ack.rejected) {
        setSequencedState((prev) => reconcileOptimisticPlacementAck(prev, tempTile, ack))
        triggerInvalidPulse()
        return
      }

      setSequencedState((prev) => reconcileOptimisticPlacementAck(prev, tempTile, ack))
    })
  }

  const handleUndo = (): void => {
    const lastSettled = [...sequencedState.tiles].reverse().find((tile) => isServerTileId(tile.id))
    if (!lastSettled) return

    const socket = socketRef.current
    if (!socket) return

    socket.emit('remove_tile', { tileId: lastSettled.id }, (ack) => {
      if (!ack.removed) {
        requestSnapshot()
        return
      }

      setSequencedState((prev) =>
        reconcileSequencedTileRemoved(prev, {
          tileId: lastSettled.id,
          opSeq: ack.opSeq,
        }),
      )
    })
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
        canUndo={sequencedState.tiles.some((tile) => isServerTileId(tile.id))}
        onUndo={handleUndo}
        clearDisabled
        onClear={() => {}}
      />

      <section className="canvas-shell">
        <div className="status-strip" data-state={ghost.confidence}>
          <span>{ghost.confidence.replace('-', ' ')}</span>
          <span>{sequencedState.tiles.length} placed</span>
        </div>

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
