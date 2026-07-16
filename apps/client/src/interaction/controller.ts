import { clamp, lerpVec, shortestAngleDelta } from '../domain/math2d'
import {
  defaultBounds,
  solveGuidedPlacement,
} from '../domain/placementSolver'
import type { Vec2 } from '../domain/math2d'
import type { TileInstance } from '../domain/placementSolver'
import type { ConfidenceState, TileShape, Transform2D } from '../domain/tileGeometry'

export type SequencedSnapshot = {
  tiles: TileInstance[]
  lastOpSeq: number
}

export type SequencedTilePlaced = {
  tile: TileInstance
  opSeq: number
}

export type SequencedTileRemoved = {
  tileId: string
  opSeq: number
}

export type SequencedTilesState = {
  tiles: TileInstance[]
  lastOpSeq: number
  requiresSnapshot: boolean
}

export type ActiveTile = {
  shape: TileShape
  color: string
  material: 'ceramic' | 'glass' | 'stone'
  rotation: number
  mirrored: boolean
}

export type GhostState = {
  current: Transform2D
  target: Transform2D
  confidence: ConfidenceState
  valid: boolean
  magnetStrength: number
  rejection: Vec2
  debugReason: string
}

export const createInitialGhost = (): GhostState => ({
  current: { position: { x: 0, y: 0 }, rotation: 0, mirrored: false },
  target: { position: { x: 0, y: 0 }, rotation: 0, mirrored: false },
  confidence: 'near-valid',
  valid: false,
  magnetStrength: 0,
  rejection: { x: 0, y: 0 },
  debugReason: 'no pointer yet',
})

export const createInitialSequencedTilesState = (): SequencedTilesState => ({
  tiles: [],
  lastOpSeq: 0,
  requiresSnapshot: false,
})

export const applySequencedSnapshot = (snapshot: SequencedSnapshot): SequencedTilesState => ({
  tiles: snapshot.tiles,
  lastOpSeq: snapshot.lastOpSeq,
  requiresSnapshot: false,
})

export const reconcileSequencedTilePlaced = (
  state: SequencedTilesState,
  payload: SequencedTilePlaced,
): SequencedTilesState => {
  if (payload.opSeq <= state.lastOpSeq) {
    return state
  }

  if (payload.opSeq !== state.lastOpSeq + 1) {
    return {
      ...state,
      requiresSnapshot: true,
    }
  }

  return {
    tiles: [...state.tiles.filter((tile) => tile.id !== payload.tile.id), payload.tile],
    lastOpSeq: payload.opSeq,
    requiresSnapshot: false,
  }
}

export const reconcileSequencedTileRemoved = (
  state: SequencedTilesState,
  payload: SequencedTileRemoved,
): SequencedTilesState => {
  if (payload.opSeq <= state.lastOpSeq) {
    return state
  }

  if (payload.opSeq !== state.lastOpSeq + 1) {
    return {
      ...state,
      requiresSnapshot: true,
    }
  }

  return {
    tiles: state.tiles.filter((tile) => tile.id !== payload.tileId),
    lastOpSeq: payload.opSeq,
    requiresSnapshot: false,
  }
}

export const updateGhostTarget = (
  pointer: Vec2,
  activeTile: ActiveTile,
  settled: TileInstance[],
): GhostState => {
  const solved = solveGuidedPlacement(
    pointer,
    activeTile.shape,
    activeTile.rotation,
    activeTile.mirrored,
    settled,
    defaultBounds,
  )

  return {
    current: {
      position: pointer,
      rotation: activeTile.rotation,
      mirrored: activeTile.mirrored,
    },
    target: solved.transform,
    confidence: solved.state,
    valid: solved.valid,
    magnetStrength: solved.magnetStrength,
    rejection: solved.correction,
    debugReason: solved.reason,
  }
}

export const stepGhost = (
  ghost: GhostState,
  deltaSeconds: number,
): GhostState => {
  const lerpFactor = clamp(1 - Math.exp(-deltaSeconds * 25), 0, 1)

  const rotationDelta = shortestAngleDelta(ghost.current.rotation, ghost.target.rotation)
  const nextRotation = ghost.current.rotation + rotationDelta * lerpFactor

  const resistedTarget = ghost.valid
    ? ghost.target.position
    : {
        x: ghost.target.position.x - ghost.rejection.x * 0.28,
        y: ghost.target.position.y - ghost.rejection.y * 0.28,
      }

  return {
    ...ghost,
    current: {
      position: lerpVec(ghost.current.position, resistedTarget, lerpFactor),
      rotation: nextRotation,
      mirrored: ghost.target.mirrored,
    },
  }
}

export const tryPlaceTile = (
  activeTile: ActiveTile,
  ghost: GhostState,
  _settled: TileInstance[],
): { placed?: TileInstance; rejected: boolean } => {
  if (!ghost.valid) {
    return { rejected: true }
  }

  const placed: TileInstance = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    shape: activeTile.shape,
    color: activeTile.color,
    material: activeTile.material,
    transform: ghost.target,
    settleFrom: {
      position: {
        x: ghost.current.position.x,
        y: ghost.current.position.y,
      },
      rotation: ghost.current.rotation + (Math.random() - 0.5) * 0.08,
      mirrored: ghost.current.mirrored,
    },
    createdAt: Date.now(),
  }

  return { placed, rejected: false }
}
