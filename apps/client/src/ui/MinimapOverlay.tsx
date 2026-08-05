import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Maximize2, Minimize2, Minus, Plus } from 'lucide-react'
import type { TileShape } from '../domain/tileGeometry'

export type MinimapViewport = {
  center: { x: number; y: number }
  viewport: { minX: number; maxX: number; minY: number; maxY: number }
}

type MinimapTile = {
  id: string
  shape: TileShape
  color: string
  position: { x: number; y: number }
  rotation: number
  mirrored?: boolean
}

type MinimapOccupancyChunk = {
  chunkId: `${number}:${number}`
  tileCount: number
}

type MinimapOverlayProps = {
  worldBounds: { minX: number; maxX: number; minY: number; maxY: number }
  viewport: MinimapViewport | null
  tiles?: MinimapTile[]
  occupancy?: MinimapOccupancyChunk[]
  chunkWorldSize?: number
  onPanTo: (center: { x: number; y: number }) => void
  cameraZoom?: number
  zoomRange?: { min: number; max: number }
  onZoomTo?: (zoom: number) => void
  topology?: {
    patchRows: number
    patchColumns: number
    topology: 'bounded' | 'toroidal'
  }
}

const minimapShapePaths: Record<TileShape, string> = {
  square: 'M -0.44 -0.44 L 0.44 -0.44 L 0.44 0.44 L -0.44 0.44 Z',
  rectangle: 'M -0.58 -0.32 L 0.58 -0.32 L 0.58 0.32 L -0.58 0.32 Z',
  triangle: 'M 0 -0.56 L -0.56 0.52 L 0.56 0.52 Z',
  'l-shape': 'M -0.58 -0.58 L 0.58 -0.58 L 0.58 -0.14 L -0.14 -0.14 L -0.14 0.58 L -0.58 0.58 Z',
  'large-square': 'M -0.64 -0.64 L 0.64 -0.64 L 0.64 0.64 L -0.64 0.64 Z',
  circle: 'M 0 -0.56 A 0.56 0.56 0 1 1 0 0.56 A 0.56 0.56 0 1 1 0 -0.56 Z',
  'right-triangle': 'M -0.3 -0.3 L 0.64 -0.3 L -0.3 0.64 Z',
  'large-right-triangle': 'M -0.42 -0.42 L 0.82 -0.42 L -0.42 0.82 Z',
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const wrapToRange = (value: number, min: number, max: number): number => {
  const span = max - min
  if (!Number.isFinite(span) || span <= 0) {
    return value
  }

  const offset = (value - min) % span
  return offset < 0 ? min + offset + span : min + offset
}

const sanitizeViewport = (
  bounds: MinimapOverlayProps['worldBounds'],
  viewport: MinimapViewport,
  isToroidal: boolean,
): MinimapViewport => {
  if (!isToroidal) {
    return viewport
  }

  const viewportWidth = viewport.viewport.maxX - viewport.viewport.minX
  const viewportHeight = viewport.viewport.maxY - viewport.viewport.minY
  const centerX = wrapToRange(viewport.center.x, bounds.minX, bounds.maxX)
  const centerY = wrapToRange(viewport.center.y, bounds.minY, bounds.maxY)

  return {
    center: { x: centerX, y: centerY },
    viewport: {
      minX: centerX - viewportWidth / 2,
      maxX: centerX + viewportWidth / 2,
      minY: centerY - viewportHeight / 2,
      maxY: centerY + viewportHeight / 2,
    },
  }
}

export const MinimapOverlay = ({
  worldBounds,
  viewport,
  tiles,
  occupancy,
  chunkWorldSize,
  onPanTo,
  cameraZoom,
  zoomRange,
  onZoomTo,
  topology,
}: MinimapOverlayProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const [minimized, setMinimized] = useState(false)

  const width = worldBounds.maxX - worldBounds.minX
  const height = worldBounds.maxY - worldBounds.minY
  const disabled = width <= 0 || height <= 0
  const isToroidal = topology?.topology === 'toroidal'

  const normalizedViewport = useMemo(() => {
    if (!viewport) {
      return null
    }

    return sanitizeViewport(worldBounds, viewport, isToroidal)
  }, [isToroidal, viewport, worldBounds])

  const minimapTiles = useMemo(() => {
    if (!tiles || tiles.length === 0 || disabled) {
      return []
    }

    const maxTiles = 6_000
    const samplingStep = tiles.length > maxTiles ? Math.ceil(tiles.length / maxTiles) : 1
    const normalized: Array<{
      id: string
      shape: TileShape
      color: string
      x: number
      y: number
      rotation: number
      mirrored?: boolean
    }> = []

    for (let index = 0; index < tiles.length; index += samplingStep) {
      const tile = tiles[index]
      const x = isToroidal
        ? wrapToRange(tile.position.x, worldBounds.minX, worldBounds.maxX)
        : tile.position.x
      const y = isToroidal
        ? wrapToRange(tile.position.y, worldBounds.minY, worldBounds.maxY)
        : tile.position.y

      const normalizedX = clamp01((x - worldBounds.minX) / width)
      const normalizedY = clamp01((y - worldBounds.minY) / height)

      normalized.push({
        id: tile.id,
        shape: tile.shape,
        color: tile.color,
        x: normalizedX,
        y: normalizedY,
        rotation: tile.rotation,
        mirrored: tile.mirrored,
      })
    }

    return normalized
  }, [disabled, height, isToroidal, tiles, width, worldBounds.maxX, worldBounds.maxY, worldBounds.minX, worldBounds.minY])

  const occupancyCells = useMemo(() => {
    if (!occupancy || occupancy.length === 0 || !chunkWorldSize || chunkWorldSize <= 0 || disabled) {
      return []
    }

    const maxTileCount = Math.max(...occupancy.map((chunk) => chunk.tileCount), 1)
    return occupancy.flatMap((chunk) => {
      const [rawX, rawY] = chunk.chunkId.split(':')
      const worldX = Number(rawX) * chunkWorldSize
      const worldY = Number(rawY) * chunkWorldSize
      if (![worldX, worldY, chunk.tileCount].every(Number.isFinite) || chunk.tileCount <= 0) return []

      const left = clamp01((worldX - worldBounds.minX) / width) * 100
      const right = clamp01((worldX + chunkWorldSize - worldBounds.minX) / width) * 100
      const bottom = clamp01((worldY - worldBounds.minY) / height) * 100
      const top = clamp01((worldY + chunkWorldSize - worldBounds.minY) / height) * 100
      if (right <= left || top <= bottom) return []

      return [{
        id: chunk.chunkId,
        x: left,
        y: 100 - top,
        width: right - left,
        height: top - bottom,
        opacity: 0.22 + 0.58 * Math.sqrt(chunk.tileCount / maxTileCount),
        tileCount: chunk.tileCount,
      }]
    })
  }, [chunkWorldSize, disabled, height, occupancy, width, worldBounds.minX, worldBounds.minY])

  const viewportFrame = useMemo(() => {
    if (!normalizedViewport || disabled) {
      return null
    }

    const minX = clamp01((normalizedViewport.viewport.minX - worldBounds.minX) / width)
    const maxX = clamp01((normalizedViewport.viewport.maxX - worldBounds.minX) / width)
    const minY = clamp01((normalizedViewport.viewport.minY - worldBounds.minY) / height)
    const maxY = clamp01((normalizedViewport.viewport.maxY - worldBounds.minY) / height)

    return {
      left: minX * 100,
      width: Math.max((maxX - minX) * 100, 3),
      top: (1 - maxY) * 100,
      height: Math.max((maxY - minY) * 100, 3),
    }
  }, [disabled, height, normalizedViewport, width, worldBounds.minX, worldBounds.minY])

  const pointerToWorld = useCallback((event: PointerEvent | ReactPointerEvent): { x: number; y: number } | null => {
    const container = containerRef.current
    if (!container || disabled) {
      return null
    }

    const rect = container.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }

    const normalizedX = clamp01((event.clientX - rect.left) / rect.width)
    const normalizedY = clamp01((event.clientY - rect.top) / rect.height)
    return {
      x: worldBounds.minX + normalizedX * width,
      y: worldBounds.maxY - normalizedY * height,
    }
  }, [disabled, height, width, worldBounds.maxY, worldBounds.minX])

  const applyPanToPointer = useCallback((event: PointerEvent | ReactPointerEvent): void => {
    const worldPoint = pointerToWorld(event)
    if (!worldPoint) {
      return
    }

    const nextCenter = dragOffset
      ? { x: worldPoint.x - dragOffset.x, y: worldPoint.y - dragOffset.y }
      : worldPoint

    onPanTo({
      x: isToroidal ? wrapToRange(nextCenter.x, worldBounds.minX, worldBounds.maxX) : nextCenter.x,
      y: isToroidal ? wrapToRange(nextCenter.y, worldBounds.minY, worldBounds.maxY) : nextCenter.y,
    })
  }, [dragOffset, isToroidal, onPanTo, pointerToWorld, worldBounds.maxX, worldBounds.maxY, worldBounds.minX, worldBounds.minY])

  const handleTrackPointerDown = useCallback((event: ReactPointerEvent) => {
    event.preventDefault()
    setDragOffset(null)
    applyPanToPointer(event)
  }, [applyPanToPointer])

  const handleViewportPointerDown = useCallback((event: ReactPointerEvent) => {
    if (!normalizedViewport) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const worldPoint = pointerToWorld(event)
    if (!worldPoint) {
      return
    }

    setDragOffset({
      x: worldPoint.x - normalizedViewport.center.x,
      y: worldPoint.y - normalizedViewport.center.y,
    })
  }, [normalizedViewport, pointerToWorld])

  const zoomOutDisabled = cameraZoom === undefined || !zoomRange || !onZoomTo
  const zoomInDisabled = cameraZoom === undefined || !zoomRange || !onZoomTo

  const handleZoomOut = useCallback(() => {
    if (cameraZoom === undefined || !zoomRange || !onZoomTo) {
      return
    }

    onZoomTo(Math.max(zoomRange.min, cameraZoom * 0.85))
  }, [cameraZoom, onZoomTo, zoomRange])

  const handleZoomIn = useCallback(() => {
    if (cameraZoom === undefined || !zoomRange || !onZoomTo) {
      return
    }

    onZoomTo(Math.min(zoomRange.max, cameraZoom * 1.15))
  }, [cameraZoom, onZoomTo, zoomRange])

  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      if (dragOffset === null) {
        return
      }
      applyPanToPointer(event)
    }

    const onPointerUp = (): void => {
      setDragOffset(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [applyPanToPointer, dragOffset])

  return (
    <aside className={`minimap-overlay${minimized ? ' minimap-overlay--minimized' : ''}`} aria-label="World minimap">
      <div className="minimap-header">
        <h3>Minimap</h3>
        <div className="minimap-header-actions">
          {!minimized && <span>Drag viewport</span>}
          <button
            type="button"
            className="minimap-minimize-toggle"
            onClick={() => {
              setMinimized((previous) => !previous)
              setDragOffset(null)
            }}
            aria-label={minimized ? 'Expand minimap' : 'Minimize minimap'}
            aria-expanded={!minimized}
          >
            {minimized ? <Maximize2 aria-hidden="true" /> : <Minimize2 aria-hidden="true" />}
          </button>
        </div>
      </div>
      {!minimized && (
        <div
          ref={containerRef}
          className="minimap-track"
          role="application"
          aria-label="Drag or click to pan the canvas"
          onPointerDown={handleTrackPointerDown}
        >
          <div className="minimap-corner-controls" role="group" aria-label="Minimap zoom controls">
            <button type="button" onClick={handleZoomOut} disabled={zoomOutDisabled} aria-label="Zoom out"><Minus aria-hidden="true" /></button>
            <button type="button" onClick={handleZoomIn} disabled={zoomInDisabled} aria-label="Zoom in"><Plus aria-hidden="true" /></button>
          </div>
          <svg className="minimap-quilt-render" viewBox="0 0 100 100" aria-label="Whole quilt preview" preserveAspectRatio="none">
            {occupancyCells.map((cell) => (
              <rect
                key={cell.id}
                x={cell.x}
                y={cell.y}
                width={cell.width}
                height={cell.height}
                opacity={cell.opacity}
                data-tile-count={cell.tileCount}
                className="minimap-occupancy"
              />
            ))}
            {minimapTiles.map((tile) => {
              const x = tile.x * 100
              const y = (1 - tile.y) * 100
              const angle = (tile.rotation * 180) / Math.PI
              const mirror = tile.mirrored ? -1 : 1

              return (
                <path
                  key={tile.id}
                  d={minimapShapePaths[tile.shape]}
                  transform={`translate(${x} ${y}) rotate(${angle}) scale(${mirror} 1)`}
                  fill={tile.color}
                  className="minimap-tile"
                />
              )
            })}
          </svg>
          {viewportFrame && (
            <div
              className="minimap-viewport"
              style={{
                left: `${viewportFrame.left}%`,
                width: `${viewportFrame.width}%`,
                top: `${viewportFrame.top}%`,
                height: `${viewportFrame.height}%`,
              }}
              onPointerDown={handleViewportPointerDown}
              aria-label="Current viewport"
            />
          )}
        </div>
      )}
    </aside>
  )
}
