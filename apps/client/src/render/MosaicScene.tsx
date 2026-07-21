import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import {
  ExtrudeGeometry,
  Group,
  MathUtils,
  OrthographicCamera,
  PlaneGeometry,
  Shape,
  Vector2,
} from 'three'
import { easeOutCubic, shortestAngleDelta } from '../domain/math2d'
import { getTileDefinition } from '../domain/tileGeometry'
import { useCraftMaterial, useRemoteSelectionMaterial } from './materials'
import type { ThreeEvent } from '@react-three/fiber'
import type { TileInstance } from '../domain/placementSolver'
import type { ConfidenceState, TileShape, Transform2D } from '../domain/tileGeometry'
import { getCollaboratorColor } from '../ui/palettes'

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
  activeShape: TileShape
  ghost: Ghost
  remoteCursors: RemoteCursor[]
  remoteSelections: RemoteSelection[]
  worldBounds?: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
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

const TileMesh = ({ tile }: { tile: TileInstance }) => {
  const groupRef = useRef<Group>(null)
  const animationDone = useRef(false)
  const material = useCraftMaterial(tile.color, tile.material)

  const geometry = useMemo(() => createExtrudeGeometry(tile.shape), [tile.shape])

  useFrame(({ clock }) => {
    const group = groupRef.current
    if (!group || animationDone.current) return

    const elapsed = (clock.elapsedTime * 1000 - tile.createdAt) / 1000
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
}: Pick<MosaicSceneProps, 'onPointerMove' | 'onPointerDown' | 'onPointerUp' | 'onRotateDrag' | 'onCameraPan' | 'worldBounds'>) => {
  const lastRightX = useRef<number | null>(null)
  const lastMiddlePos = useRef<{ x: number; y: number } | null>(null)

  const handleMove = (event: ThreeEvent<PointerEvent>): void => {
    if ((event.buttons & 2) !== 0) {
      if (lastRightX.current !== null) {
        onRotateDrag(event.clientX - lastRightX.current)
      }
      lastRightX.current = event.clientX
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
    lastRightX.current = null
    lastMiddlePos.current = null
    onPointerMove(event.point.x, event.point.y)
  }

  const handleDown = (event: ThreeEvent<PointerEvent>): void => {
    if (event.button === 2) {
      lastRightX.current = event.clientX
      event.stopPropagation()
      return
    }
    if (event.button === 1) {
      lastMiddlePos.current = { x: event.clientX, y: event.clientY }
      ;(event as any).nativeEvent?.preventDefault()
      event.stopPropagation()
      return
    }
    onPointerDown(event.point.x, event.point.y)
  }

  const handleUp = (event: ThreeEvent<PointerEvent>): void => {
    if (event.button === 2) {
      lastRightX.current = null
      event.stopPropagation()
      return
    }
    if (event.button === 1) {
      lastMiddlePos.current = null
      ;(event as any).nativeEvent?.preventDefault()
      event.stopPropagation()
      return
    }
    lastRightX.current = null
    lastMiddlePos.current = null
    onPointerUp()
  }

  const bounds = worldBounds ?? DEFAULT_WORLD_BOUNDS
  const width = (bounds.maxX - bounds.minX) + 6
  const height = (bounds.maxY - bounds.minY) + 6
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2

  return (
    <mesh
      position={[centerX, centerY, -0.02]}
      onPointerMove={handleMove}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      receiveShadow={false}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial transparent opacity={0} />
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
}: {
  onViewportChanged?: MosaicSceneProps['onViewportChanged']
  onZoomTierChanged?: MosaicSceneProps['onZoomTierChanged']
}) => {
  const { camera, size } = useThree()
  const previousRef = useRef<string | null>(null)

  useFrame(() => {
    if (!onViewportChanged) {
      return
    }

    const orthographic = camera as OrthographicCamera
    const zoom = orthographic.zoom
    const halfWidth = size.width / (2 * zoom)
    const halfHeight = size.height / (2 * zoom)
    const centerX = orthographic.position.x
    const centerY = orthographic.position.y
    const viewport = {
      minX: centerX - halfWidth,
      maxX: centerX + halfWidth,
      minY: centerY - halfHeight,
      maxY: centerY + halfHeight,
    }

    const signature = `${centerX.toFixed(3)}:${centerY.toFixed(3)}:${zoom.toFixed(3)}:${size.width}:${size.height}`
    if (previousRef.current === signature) {
      return
    }

    previousRef.current = signature
    if (onZoomTierChanged) {
      onZoomTierChanged(zoom)
    }
    onViewportChanged({
      center: { x: centerX, y: centerY },
      viewport,
      zoom,
    })
  })

  return null
}

const SceneContents = ({
  tiles,
  activeShape,
  ghost,
  remoteCursors,
  remoteSelections,
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
}: MosaicSceneProps) => {
  const controlsRef = useRef(null)
  const tilesById = useMemo(() => {
    const index = new Map<string, TileInstance>()
    for (const tile of tiles) {
      index.set(tile.id, tile)
    }
    return index
  }, [tiles])

  return (
    <>
      <ViewportReporter onViewportChanged={onViewportChanged} onZoomTierChanged={onZoomTierChanged} />
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
        {tiles.map((tile) => (
          <TileMesh key={tile.id} tile={tile} />
        ))}
        {remoteSelections.map((selection) => {
          const selectedTile = tilesById.get(selection.tileId)
          if (!selectedTile) {
            return null
          }

          return (
            <RemoteSelectionHalo
              key={`${selection.clientId}-${selection.tileId}`}
              tile={selectedTile}
              clientId={selection.clientId}
            />
          )
        })}
      </group>

      <GhostMesh ghost={ghost} shape={activeShape} />
      {remoteCursors.map((cursor) => (
        <RemoteCursorMesh key={cursor.clientId} cursor={cursor} />
      ))}

      <InteractionPlane
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onRotateDrag={onRotateDrag}
        onCameraPan={onCameraPan}
        worldBounds={worldBounds}
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
        minZoom={cameraPolicy?.minZoom ?? DEFAULT_CAMERA_POLICY.minZoom}
        maxZoom={cameraPolicy?.maxZoom ?? DEFAULT_CAMERA_POLICY.maxZoom}
        minPolarAngle={Math.PI / 2}
        maxPolarAngle={Math.PI / 2}
        target={[cameraPan.x, cameraPan.y, 0]}
      />
    </>
  )
}

export const MosaicScene = ({
  tiles,
  activeShape,
  ghost,
  remoteCursors,
  remoteSelections,
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
}: MosaicSceneProps) => {
  const resolvedBounds = worldBounds ?? DEFAULT_WORLD_BOUNDS
  const width = resolvedBounds.maxX - resolvedBounds.minX
  const height = resolvedBounds.maxY - resolvedBounds.minY
  const centerX = (resolvedBounds.minX + resolvedBounds.maxX) / 2
  const centerY = (resolvedBounds.minY + resolvedBounds.maxY) / 2
  const maxDimension = Math.max(width, height)
  const initialZoom = Math.max(
    cameraPolicy?.minZoom ?? DEFAULT_CAMERA_POLICY.minZoom,
    Math.min(cameraPolicy?.maxZoom ?? DEFAULT_CAMERA_POLICY.maxZoom, 58 * (10.4 / Math.max(10.4, maxDimension))),
  )

  return (
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
        activeShape={activeShape}
        worldBounds={resolvedBounds}
        onRotateDrag={onRotateDrag}
        onCameraPan={onCameraPan}
        cameraPan={cameraPan}
        cameraPolicy={cameraPolicy}
        ghost={ghost}
        remoteCursors={remoteCursors}
        remoteSelections={remoteSelections}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onViewportChanged={onViewportChanged}
        onZoomTierChanged={onZoomTierChanged}
      />
    </Canvas>
  )
}
