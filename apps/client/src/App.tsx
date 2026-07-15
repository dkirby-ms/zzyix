import { useEffect, useMemo, useState } from 'react'
import { vec2 } from './domain/math2d'
import { normalizeAngle, quantizeRotation } from './domain/tileGeometry'
import type { TileShape } from './domain/tileGeometry'
import {
  createInitialGhost,
  stepGhost,
  tryPlaceTile,
  updateGhostTarget,
} from './interaction/controller'
import type { ActiveTile } from './interaction/controller'
import type { TileInstance } from './domain/placementSolver'
import { MosaicScene } from './render/MosaicScene'
import { ControlsPanel } from './ui/ControlsPanel'
import { palettes } from './ui/palettes'
import type { PaletteName } from './ui/palettes'
import './App.css'

function App() {
  const [tiles, setTiles] = useState<TileInstance[]>([])
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
        setTiles((prev) => prev.slice(0, -1))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
    const updated = updateGhostTarget(vec2(x, y), activeTile, tiles)
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
    const result = tryPlaceTile(activeTile, ghost, tiles)
    if (result.placed) {
      setTiles((prev) => [...prev, result.placed!])
      setInvalidPulse(false)
      return
    }

    setInvalidPulse(true)
    window.setTimeout(() => setInvalidPulse(false), 180)
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
        canUndo={tiles.length > 0}
        onUndo={() => setTiles((prev) => prev.slice(0, -1))}
        onClear={() => setTiles([])}
      />

      <section className="canvas-shell">
        <div className="status-strip" data-state={ghost.confidence}>
          <span>{ghost.confidence.replace('-', ' ')}</span>
          <span>{tiles.length} placed</span>
        </div>

        <MosaicScene
          tiles={tiles}
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
              <span className="debug-value">{tiles.length}</span>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
