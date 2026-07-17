import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import {
  ExtrudeGeometry,
  Group,
  MathUtils,
  PlaneGeometry,
  Shape,
  Vector2,
} from 'three'
import { easeOutCubic, shortestAngleDelta } from '../domain/math2d'
import { defaultBounds } from '../domain/placementSolver'
import { getTileDefinition } from '../domain/tileGeometry'
import { useCraftMaterial } from './materials'
import type { ThreeEvent } from '@react-three/fiber'
import type { TileInstance } from '../domain/placementSolver'
import type { ConfidenceState, TileShape, Transform2D } from '../domain/tileGeometry'

const geometryCache = new Map<TileShape, ExtrudeGeometry>()

type Ghost = {
  transform: Transform2D
  confidence: ConfidenceState
  color: string
  material: 'ceramic' | 'glass' | 'stone'
  visible: boolean
}

type MosaicSceneProps = {
  tiles: TileInstance[]
  activeShape: TileShape
  ghost: Ghost
  onPointerMove: (x: number, y: number) => void
  onPointerDown: (x: number, y: number) => void
  onPointerUp: () => void
  onRotateDrag: (deltaX: number) => void
  onCameraPan: (deltaX: number, deltaY: number) => void
  cameraPan: { x: number; y: number }
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

const InteractionPlane = ({
  onPointerMove,
  onPointerDown,
  onPointerUp,
  onRotateDrag,
  onCameraPan,
}: Pick<MosaicSceneProps, 'onPointerMove' | 'onPointerDown' | 'onPointerUp' | 'onRotateDrag' | 'onCameraPan'>) => {
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

  return (
    <mesh
      position={[0, 0, -0.02]}
      onPointerMove={handleMove}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      receiveShadow={false}
    >
      <planeGeometry args={[20, 14]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  )
}

const CanvasBounds = () => {
  const geometry = useMemo(() => new PlaneGeometry(10.5, 7), [])
  return (
    <mesh geometry={geometry} position={[0, 0, -0.12]} receiveShadow>
      <meshStandardMaterial color="#f6f1e7" roughness={0.9} metalness={0.05} />
    </mesh>
  )
}

const SceneContents = ({
  tiles,
  activeShape,
  ghost,
  onPointerMove,
  onPointerDown,
  onPointerUp,
  onRotateDrag,
  onCameraPan,
  cameraPan,
}: MosaicSceneProps) => {
  const controlsRef = useRef(null)
  return (
    <>
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
        <CanvasBounds />
        {tiles.map((tile) => (
          <TileMesh key={tile.id} tile={tile} />
        ))}
      </group>

      <GhostMesh ghost={ghost} shape={activeShape} />

      <InteractionPlane
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onRotateDrag={onRotateDrag}
        onCameraPan={onCameraPan}
      />

      <mesh position={[0, 0, -0.8]}>
        <planeGeometry args={[26, 20]} />
        <meshStandardMaterial color="#d5cfbf" roughness={1} metalness={0} />
      </mesh>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableRotate={false}
        enablePan={false}
        enableZoom={true}
        minZoom={40}
        maxZoom={80}
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
  onPointerMove,
  onPointerDown,
  onPointerUp,
  onRotateDrag,
  onCameraPan,
  cameraPan,
}: MosaicSceneProps) => {
  return (
    <Canvas
      shadows="percentage"
      camera={{
        position: [0, 0, 8],
        zoom: 58,
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
        tiles={tiles.filter((tile) =>
          tile.transform.position.x > defaultBounds.minX - 1 &&
          tile.transform.position.x < defaultBounds.maxX + 1,
        )}
        activeShape={activeShape}
        onRotateDrag={onRotateDrag}
        onCameraPan={onCameraPan}
        cameraPan={cameraPan}
        ghost={ghost}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      />
    </Canvas>
  )
}
