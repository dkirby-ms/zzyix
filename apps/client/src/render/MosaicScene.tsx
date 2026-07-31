import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useMemo, useRef, useEffect, useState } from 'react'
import {
  ExtrudeGeometry,
  Group,
  MathUtils,
  MOUSE,
  OrthographicCamera,
  PlaneGeometry,
  Shape,
  Vector2,
} from 'three'
import { easeOutCubic, shortestAngleDelta } from '../domain/math2d'
import { getTileDefinition } from '../domain/tileGeometry'
import { GridOverlay } from './GridOverlay'
import { useCraftMaterial, useRemoteSelectionMaterial } from './materials'
import type { ThreeEvent } from '@react-three/fiber'
import type { GridPattern } from '../domain/gridPatterns'
import type { MosaicBounds, TileInstance } from '../domain/placementSolver'
import type { ConfidenceState, TileShape, Transform2D } from '../domain/tileGeometry'
import { getCollaboratorColor } from '../ui/palettes'
import { deriveOrthographicViewport, enumerateVisibleTileImages, nearestPeriodicPoint, resolveDisplayHitPoint } from './periodicImages'
import type { QuiltTopology } from '../../../server/src/domain/quiltTopology'
import type { TopologyRect } from '../../../server/src/domain/quiltTopology'

const geometryCache = new Map<TileShape, ExtrudeGeometry>()

type Ghost = {
  transform: Transform2D
  confidence: ConfidenceState
  color: string
  material: 'ceramic' | 'glass' | 'stone'
  visible: boolean
}

type RemoteCursor = {
  clientId: string
  position: { x: number; y: number }
}

type RemoteSelection = {
  clientId: string
  tileId: string
}

type MosaicSceneProps = {
  tiles: TileInstance[]
  clientId: string
  activeShape: TileShape
  ghost: Ghost
  remoteCursors: RemoteCursor[]
  remoteSelections: RemoteSelection[]
  gridOverlay?: {
    pattern: GridPattern
    activeSlotId?: string
    bounds?: MosaicBounds
  }
  worldBounds?: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
  topology?: QuiltTopology
  onPointerMove: (x: number, y: number) => void
  onPointerDown: (x: number, y: number) => void
  onPointerUp: () => void
  onRotateDrag: (deltaX: number) => void
  onCameraPan: (deltaX: number, deltaY: number) => void
  cameraPan: { x: number; y: number }
  cameraPolicy?: {
    minZoom: number
    maxZoom: number
    panSensitivity: number
  }
  onViewportChanged?: (payload: {
    center: { x: number; y: number }
    viewport: { minX: number; maxX: number; minY: number; maxY: number }
    zoom: number
  }) => void
  onZoomTierChanged?: (zoom: number) => void
  onSceneMetrics?: (metrics: { sceneObjectCount: number; drawCalls: number; frameTimeMs: number }) => void
}

const DEFAULT_CAMERA_POLICY = {
  minZoom: 20,
  maxZoom: 140,
  panSensitivity: 0.02,
}

const DEFAULT_WORLD_BOUNDS = {
  minX: -5.2,
  maxX: 5.2,
  minY: -3.4,
  maxY: 3.4,
}

const confidenceColor = (base: string, confidence: ConfidenceState): string => {
  if (confidence === 'valid') return base
  if (confidence === 'near-valid') return '#e4bf67'
  return '#b05f60'
}

const createExtrudeGeometry = (shape: TileShape): ExtrudeGeometry => {
  const cached = geometryCache.get(shape)
  if (cached) return cached

  const outline = getTileDefinition(shape).outline
  const path = new Shape(outline.map((point) => new Vector2(point.x, point.y)))
  const geometry = new ExtrudeGeometry(path, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.036,
    bevelSize: 0.024,
    bevelSegments: 3,
    curveSegments: 6,
  })

  geometryCache.set(shape, geometry)
  return geometry
}

const TileMesh = ({ tile, clientId }: { tile: TileInstance; clientId: string }) => {
  const groupRef = useRef<Group>(null)
  const animationDone = useRef(false)
  const material = useCraftMaterial(tile.color, tile.material)
  const ownerColor = tile.placedBy && tile.placedBy !== clientId
    ? getCollaboratorColor(tile.placedBy)
    : undefined

  const geometry = useMemo(() => createExtrudeGeometry(tile.shape), [tile.shape])

  useFrame(() => {
    const group = groupRef.current
    if (!group || animationDone.current) return

    const elapsed = (Date.now() - tile.createdAt) / 1000
    const duration = 0.34
    const t = MathUtils.clamp(elapsed / duration, 0, 1)
    const eased = easeOutCubic(t)
    const from = tile.settleFrom ?? tile.transform

    const x = MathUtils.lerp(from.position.x, tile.transform.position.x, eased)
    const y = MathUtils.lerp(from.position.y, tile.transform.position.y, eased)
    group.position.set(x, y, 0)

    const rotationDelta = shortestAngleDelta(from.rotation, tile.transform.rotation)
    const wobble = (1 - eased) * 0.1 * Math.sin(eased * Math.PI * 6)
    group.rotation.set(0, 0, from.rotation + rotationDelta * eased + wobble)

    const pulse = 1 + (1 - eased) * 0.08 * Math.sin(eased * Math.PI * 4)
    const mirror = tile.transform.mirrored ? -1 : 1
    group.scale.set(mirror * pulse, pulse, 1 + (1 - eased) * 0.1)

    if (t >= 1) {
      animationDone.current = true
      group.position.set(tile.transform.position.x, tile.transform.position.y, 0)
      group.rotation.set(0, 0, tile.transform.rotation)
      group.scale.set(mirror, 1, 1)
    }
  })

  return (
    <group ref={groupRef}>
      <mesh castShadow receiveShadow geometry={geometry} material={material} />
      {ownerColor && (
        <mesh geometry={geometry} scale={[1.035, 1.035, 1.035]} data-owner-boundary={tile.placedBy}>
          <meshBasicMaterial color={ownerColor} wireframe transparent opacity={0.72} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

const GhostMesh = ({ ghost, shape }: { ghost: Ghost; shape: TileShape }) => {
  const color = confidenceColor(ghost.color, ghost.confidence)
  const material = useCraftMaterial(color, ghost.material, true)
  const geometry = useMemo(() => createExtrudeGeometry(shape), [shape])

  if (!ghost.visible) return null

  return (
    <group
      position={[ghost.transform.position.x, ghost.transform.position.y, 0.02]}
      rotation={[0, 0, ghost.transform.rotation]}
      scale={[ghost.transform.mirrored ? -1 : 1, 1, 1]}
    >
      <mesh geometry={geometry} material={material} />
    </group>
  )
}

const RemoteCursorMesh = ({ cursor }: { cursor: RemoteCursor }) => {
  const color = getCollaboratorColor(cursor.clientId)

  return (
    <group position={[cursor.position.x, cursor.position.y, 0.24]}>
      <mesh position={[0, 0, 0.08]}>
        <sphereGeometry args={[0.075, 14, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.36} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.11, 0.16, 24]} />
        <meshStandardMaterial color={color} transparent opacity={0.72} />
      </mesh>
    </group>
  )
}

const RemoteSelectionHalo = ({ tile, clientId }: { tile: TileInstance; clientId: string }) => {
  const color = getCollaboratorColor(clientId)
  const material = useRemoteSelectionMaterial(color)
  const geometry = useMemo(() => createExtrudeGeometry(tile.shape), [tile.shape])

  return (
    <group
      position={[tile.transform.position.x, tile.transform.position.y, 0.3]}
      rotation={[0, 0, tile.transform.rotation]}
      scale={[tile.transform.mirrored ? -1 : 1, 1, 1.02]}
    >
      <mesh geometry={geometry} material={material} />
      <mesh geometry={geometry} scale={[1.06, 1.06, 1.06]}>
        <meshBasicMaterial color={color} wireframe transparent opacity={0.88} depthWrite={false} />
      </mesh>
    </group>
  )
}

const InteractionPlane = ({
  onPointerMove,
  onPointerDown,
  onPointerUp,
  onRotateDrag,
  onCameraPan,
  worldBounds,
  topology,
}: Pick<MosaicSceneProps, 'onPointerMove' | 'onPointerDown' | 'onPointerUp' | 'onRotateDrag' | 'onCameraPan' | 'worldBounds' | 'topology'>) => {
  const { camera, size } = useThree()
  const meshRef = useRef<any>(null)
  const isRightMouseDown = useRef(false)
  const lastMiddlePos = useRef<{ x: number; y: number } | null>(null)
  const skipNextMove = useRef(false)

  const handleMove = (event: ThreeEvent<PointerEvent>): void => {
    if ((event.buttons & 2) !== 0) {
      // Right mouse button: rotate using movement delta
      const movement = (event.nativeEvent as PointerEvent).movementX || 0
      if (movement !== 0) {
        onRotateDrag(movement)
      }
      event.stopPropagation()
      return
    }
    if ((event.buttons & 4) !== 0) {
      if (lastMiddlePos.current !== null) {
        const deltaX = event.clientX - lastMiddlePos.current.x
        const deltaY = event.clientY - lastMiddlePos.current.y
        onCameraPan(deltaX, deltaY)
      }
      lastMiddlePos.current = { x: event.clientX, y: event.clientY }
      ;(event as any).nativeEvent?.preventDefault()
      event.stopPropagation()
      return
    }
    // Skip the first move after rotating
    if (skipNextMove.current) {
      skipNextMove.current = false
      return
    }
    lastMiddlePos.current = null
    const point = resolveDisplayHitPoint(event.point, topology)
    onPointerMove(point.x, point.y)
  }

  const handleDown = (event: ThreeEvent<PointerEvent>): void => {
    if (event.button === 2) {
      isRightMouseDown.current = true
      skipNextMove.current = false
      meshRef.current?.setPointerCapture?.(event.pointerId)
      event.stopPropagation()
      return
    }
    if (event.button === 1) {
      lastMiddlePos.current = { x: event.clientX, y: event.clientY }
      ;(event as any).nativeEvent?.preventDefault()
      event.stopPropagation()
      return
    }
    const point = resolveDisplayHitPoint(event.point, topology)
    onPointerDown(point.x, point.y)
  }

  const handleUp = (event: ThreeEvent<PointerEvent>): void => {
    if (event.button === 2) {
      isRightMouseDown.current = false
      skipNextMove.current = true
      meshRef.current?.releasePointerCapture?.(event.pointerId)
      event.stopPropagation()
      return
    }
    if (event.button === 1) {
      lastMiddlePos.current = null
      ;(event as any).nativeEvent?.preventDefault()
      event.stopPropagation()
      return
    }
    lastMiddlePos.current = null
    onPointerUp()
  }

  const bounds = worldBounds ?? DEFAULT_WORLD_BOUNDS
  const orthographic = camera as OrthographicCamera
  const width = topology ? size.width / orthographic.zoom + 6 : (bounds.maxX - bounds.minX) + 6
  const height = topology ? size.height / orthographic.zoom + 6 : (bounds.maxY - bounds.minY) + 6
  const centerX = topology ? orthographic.position.x : (bounds.minX + bounds.maxX) / 2
  const centerY = topology ? orthographic.position.y : (bounds.minY + bounds.maxY) / 2

  return (
    <mesh
      ref={meshRef}
      data-testid="interaction-plane"
      position={[centerX, centerY, -0.02]}
      onPointerMove={handleMove}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      receiveShadow={false}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

const CanvasBounds = ({ worldBounds }: { worldBounds?: MosaicSceneProps['worldBounds'] }) => {
  const bounds = worldBounds ?? DEFAULT_WORLD_BOUNDS
  const width = (bounds.maxX - bounds.minX) + 0.2
  const height = (bounds.maxY - bounds.minY) + 0.2
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  const geometry = useMemo(() => new PlaneGeometry(width, height), [width, height])

  return (
    <mesh geometry={geometry} position={[centerX, centerY, -0.12]} receiveShadow>
      <meshStandardMaterial color="#f6f1e7" roughness={0.9} metalness={0.05} />
    </mesh>
  )
}

const ViewportReporter = ({
  onViewportChanged,
  onZoomTierChanged,
  onCameraViewportChanged,
}: {
  onViewportChanged?: MosaicSceneProps['onViewportChanged']
  onZoomTierChanged?: MosaicSceneProps['onZoomTierChanged']
  onCameraViewportChanged: (viewport: TopologyRect) => void
}) => {
  const { camera, size } = useThree()
  const previousRef = useRef<string | null>(null)

  useFrame(() => {
    const orthographic = camera as OrthographicCamera
    const zoom = orthographic.zoom
    const centerX = orthographic.position.x
    const centerY = orthographic.position.y
    const viewport = deriveOrthographicViewport({ x: centerX, y: centerY }, zoom, size)

    const signature = `${centerX.toFixed(3)}:${centerY.toFixed(3)}:${zoom.toFixed(3)}:${size.width}:${size.height}`
    if (previousRef.current === signature) {
      return
    }

    previousRef.current = signature
    onCameraViewportChanged(viewport)
    if (onZoomTierChanged) {
      onZoomTierChanged(zoom)
    }
    onViewportChanged?.({
      center: { x: centerX, y: centerY },
      viewport,
      zoom,
    })
  })

  return null
}

const CameraPositionController = ({ position }: { position: { x: number; y: number } }) => {
  const { camera } = useThree()

  useEffect(() => {
    camera.position.x = position.x
    camera.position.y = position.y
  }, [camera, position.x, position.y])

  return null
}

const SceneContents = ({
  tiles,
  clientId,
  activeShape,
  ghost,
  remoteCursors,
  remoteSelections,
  gridOverlay,
  worldBounds,
  onPointerMove,
  onPointerDown,
  onPointerUp,
  onRotateDrag,
  onCameraPan,
  cameraPan,
  cameraPolicy,
  onViewportChanged,
  onZoomTierChanged,
  topology,
  onSceneMetrics,
}: MosaicSceneProps) => {
  const { gl, scene } = useThree()
  const previousFrameAt = useRef<number | undefined>(undefined)
  const controlsRef = useRef(null)
  const [cameraViewport, setCameraViewport] = useState<TopologyRect | null>(null)
  const tilesById = useMemo(() => {
    const index = new Map<string, TileInstance>()
    for (const tile of tiles) {
      index.set(tile.id, tile)
    }
    return index
  }, [tiles])
  const tileImages = useMemo(
    () => topology && cameraViewport ? enumerateVisibleTileImages(tiles, cameraViewport, topology, 2) : topology ? [] : tiles.map((tile) => ({
      key: tile.id, canonicalId: tile.id, tile, position: tile.transform.position, image: { x: 0, y: 0 },
    })),
    [cameraViewport, tiles, topology],
  )
  useFrame(() => {
    if (!onSceneMetrics) return
    const now = performance.now()
    const frameTimeMs = previousFrameAt.current === undefined ? 0 : now - previousFrameAt.current
    previousFrameAt.current = now
    onSceneMetrics({ sceneObjectCount: scene.children.length, drawCalls: gl.info.render.calls, frameTimeMs })
  })

  return (
    <>
      <ViewportReporter
        onViewportChanged={onViewportChanged}
        onZoomTierChanged={onZoomTierChanged}
        onCameraViewportChanged={setCameraViewport}
      />
      <ambientLight intensity={0.58} color="#fff5e8" />
      <directionalLight
        castShadow
        intensity={1.2}
        color="#ffe1bf"
        position={[5, -5, 8]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight intensity={0.38} color="#c8e1ff" position={[-4, 4, 6]} />

      <group position={[0, 0, 0]}>
        <CanvasBounds worldBounds={worldBounds} />
        {gridOverlay && (
          <GridOverlay
            pattern={gridOverlay.pattern}
            activeShape={activeShape}
            tiles={tiles}
            bounds={gridOverlay.bounds ?? (topology ? { mode: 'unbounded' } : worldBounds ?? DEFAULT_WORLD_BOUNDS)}
            activeSlotId={gridOverlay.activeSlotId}
            topology={topology}
          />
        )}
        {tileImages.map((image) => (
          <group key={image.key} position={[image.position.x - image.tile.transform.position.x, image.position.y - image.tile.transform.position.y, 0]} data-canonical-id={image.canonicalId}>
            <TileMesh tile={image.tile} clientId={clientId} />
          </group>
        ))}
        {remoteSelections.map((selection) => {
          const selectedTile = tilesById.get(selection.tileId)
          if (!selectedTile) {
            return null
          }

          return (
            <RemoteSelectionHalo
              key={`${selection.clientId}-${selection.tileId}`}
              tile={topology ? { ...selectedTile, transform: { ...selectedTile.transform, position: nearestPeriodicPoint(selectedTile.transform.position, cameraPan, topology) } } : selectedTile}
              clientId={selection.clientId}
            />
          )
        })}
      </group>

      <GhostMesh ghost={topology ? {
        ...ghost,
        transform: { ...ghost.transform, position: nearestPeriodicPoint(ghost.transform.position, cameraPan, topology) },
      } : ghost} shape={activeShape} />
      {remoteCursors.map((cursor) => (
        <RemoteCursorMesh key={cursor.clientId} cursor={topology ? {
          ...cursor,
          position: nearestPeriodicPoint(cursor.position, cameraPan, topology),
        } : cursor} />
      ))}

      <InteractionPlane
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onRotateDrag={onRotateDrag}
        onCameraPan={onCameraPan}
        worldBounds={worldBounds}
        topology={topology}
      />

      <mesh
        position={[
          ((worldBounds ?? DEFAULT_WORLD_BOUNDS).minX + (worldBounds ?? DEFAULT_WORLD_BOUNDS).maxX) / 2,
          ((worldBounds ?? DEFAULT_WORLD_BOUNDS).minY + (worldBounds ?? DEFAULT_WORLD_BOUNDS).maxY) / 2,
          -0.8,
        ]}
      >
        <planeGeometry
          args={[
            ((worldBounds ?? DEFAULT_WORLD_BOUNDS).maxX - (worldBounds ?? DEFAULT_WORLD_BOUNDS).minX) + 20,
            ((worldBounds ?? DEFAULT_WORLD_BOUNDS).maxY - (worldBounds ?? DEFAULT_WORLD_BOUNDS).minY) + 20,
          ]}
        />
        <meshStandardMaterial color="#d5cfbf" roughness={1} metalness={0} />
      </mesh>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableRotate={false}
        enablePan={false}
        enableZoom={true}
        // Keep zoom on wheel only; drag interactions are handled by the interaction plane.
        mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN }}
        minZoom={cameraPolicy?.minZoom ?? DEFAULT_CAMERA_POLICY.minZoom}
        maxZoom={cameraPolicy?.maxZoom ?? DEFAULT_CAMERA_POLICY.maxZoom}
        minPolarAngle={Math.PI / 2}
        maxPolarAngle={Math.PI / 2}
        target={[cameraPan.x, cameraPan.y, 0]}
      />
      <CameraPositionController position={cameraPan} />
    </>
  )
}

export const MosaicScene = ({
  tiles,
  clientId,
  activeShape,
  ghost,
  remoteCursors,
  remoteSelections,
  gridOverlay,
  worldBounds,
  onPointerMove,
  onPointerDown,
  onPointerUp,
  onRotateDrag,
  onCameraPan,
  cameraPan,
  cameraPolicy,
  onViewportChanged,
  onZoomTierChanged,
  topology,
  onSceneMetrics,
}: MosaicSceneProps) => {
  const resolvedBounds = worldBounds ?? DEFAULT_WORLD_BOUNDS
  const width = resolvedBounds.maxX - resolvedBounds.minX
  const height = resolvedBounds.maxY - resolvedBounds.minY
  const centerX = (resolvedBounds.minX + resolvedBounds.maxX) / 2
  const centerY = (resolvedBounds.minY + resolvedBounds.maxY) / 2
  const maxDimension = Math.max(width, height)
  const initialZoom = topology
    ? Math.min(cameraPolicy?.maxZoom ?? DEFAULT_CAMERA_POLICY.maxZoom, 58)
    : Math.max(
        cameraPolicy?.minZoom ?? DEFAULT_CAMERA_POLICY.minZoom,
        Math.min(cameraPolicy?.maxZoom ?? DEFAULT_CAMERA_POLICY.maxZoom, 58 * (10.4 / Math.max(10.4, maxDimension))),
      )
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1) {
        // Prevent browser autoscroll and use a standard pan cursor while middle-dragging.
        e.preventDefault()
        container.style.cursor = 'grabbing'
      }
      if (e.button === 2) {
        container.style.cursor = 'ew-resize'
      }
    }

    const handleMouseUp = () => {
      container.style.cursor = 'auto'
    }

    const handleMouseLeave = () => {
      container.style.cursor = 'auto'
    }

    container.addEventListener('contextmenu', handleContextMenu)
    container.addEventListener('mousedown', handleMouseDown)
    container.addEventListener('mouseleave', handleMouseLeave)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      container.removeEventListener('contextmenu', handleContextMenu)
      container.removeEventListener('mousedown', handleMouseDown)
      container.removeEventListener('mouseleave', handleMouseLeave)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
        <Canvas
          shadows="percentage"
          camera={{
            position: [centerX, centerY, 8],
            zoom: initialZoom,
            near: 0.1,
            far: 100,
          }}
          orthographic
          dpr={[1, 1.8]}
          onContextMenu={(e) => e.preventDefault()}
        >
          <color attach="background" args={['#e8e3d7']} />
          <fog attach="fog" args={['#e8e3d7', 10, 24]} />
          <SceneContents
            tiles={tiles}
            clientId={clientId}
            activeShape={activeShape}
            worldBounds={resolvedBounds}
            onRotateDrag={onRotateDrag}
            onCameraPan={onCameraPan}
            cameraPan={cameraPan}
            cameraPolicy={cameraPolicy}
            ghost={ghost}
            remoteCursors={remoteCursors}
            remoteSelections={remoteSelections}
            gridOverlay={gridOverlay}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onViewportChanged={onViewportChanged}
            onZoomTierChanged={onZoomTierChanged}
            topology={topology}
            onSceneMetrics={onSceneMetrics}
          />
        </Canvas>
      </div>
    </>
  )
}
