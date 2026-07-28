import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BufferGeometry, Float32BufferAttribute, OrthographicCamera } from 'three'
import { buildGridOverlaySegments } from './gridOverlayGeometry'
import type { WorldViewport } from '../domain/gridPatterns'
import type {
  BuildGridOverlaySegmentsInput,
  GridOverlayVisualState,
} from './gridOverlayGeometry'

type GridOverlayProps = Omit<BuildGridOverlaySegmentsInput, 'viewport'>

const createLineGeometry = (positions: number[]): BufferGeometry => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

const GridLineBatch = ({
  positions,
  state,
}: {
  positions: number[]
  state: GridOverlayVisualState
}) => {
  const geometry = useMemo(() => createLineGeometry(positions), [positions])
  const style = {
    structural: { color: '#756e63', opacity: 0.18 },
    placeable: { color: '#456a5a', opacity: 0.55 },
    blocked: { color: '#7c574f', opacity: 0.3 },
    active: { color: '#1e5662', opacity: 0.95 },
  }[state]

  useEffect(() => () => geometry.dispose(), [geometry])

  if (positions.length === 0) {
    return null
  }

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={style.color}
        transparent
        opacity={style.opacity}
        depthWrite={false}
      />
    </lineSegments>
  )
}

const useVisibleWorldViewport = (fallback: WorldViewport): WorldViewport => {
  const { camera, size } = useThree()
  const [viewport, setViewport] = useState(fallback)
  const signatureRef = useRef('')

  useFrame(() => {
    const orthographic = camera as OrthographicCamera
    const halfWidth = size.width / (2 * orthographic.zoom)
    const halfHeight = size.height / (2 * orthographic.zoom)
    const nextViewport = {
      minX: orthographic.position.x - halfWidth,
      maxX: orthographic.position.x + halfWidth,
      minY: orthographic.position.y - halfHeight,
      maxY: orthographic.position.y + halfHeight,
    }
    const signature = [
      nextViewport.minX,
      nextViewport.maxX,
      nextViewport.minY,
      nextViewport.maxY,
    ].map((value) => value.toFixed(3)).join(':')

    if (signature === signatureRef.current) {
      return
    }

    signatureRef.current = signature
    setViewport(nextViewport)
  })

  return viewport
}

export const GridOverlay = ({
  pattern,
  activeShape,
  tiles,
  bounds,
  activeSlotId,
  topology,
}: GridOverlayProps) => {
  const viewportFallback = 'mode' in bounds
    ? bounds.mode === 'bounded'
      ? bounds.bounds
      : { minX: -5, maxX: 5, minY: -5, maxY: 5 }
    : bounds
  const viewport = useVisibleWorldViewport(viewportFallback)
  const groups = useMemo(
    () => buildGridOverlaySegments({
      pattern,
      viewport,
      activeShape,
      tiles,
      bounds,
      activeSlotId,
      topology,
    }),
    [activeShape, activeSlotId, bounds, pattern, tiles, topology, viewport],
  )

  return (
    <group position={[0, 0, -0.07]}>
      <GridLineBatch positions={groups.structural} state="structural" />
      <GridLineBatch positions={groups.blocked} state="blocked" />
      <GridLineBatch positions={groups.placeable} state="placeable" />
      <GridLineBatch positions={groups.active} state="active" />
    </group>
  )
}
