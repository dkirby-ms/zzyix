import { clamp, lerpVec, shortestAngleDelta } from '../domain/math2d'
import {
  defaultBounds,
  solveGuidedPlacement,
} from '../domain/placementSolver'
import type { Vec2 } from '../domain/math2d'
import type { MosaicBounds, TileInstance } from '../domain/placementSolver'
import type { ConfidenceState, TileShape, Transform2D } from '../domain/tileGeometry'

export type SequencedSnapshot = {
  tiles: TileInstance[]
  lastOpSeq: number
  revision: number
}

export type SequencedTilePlaced = {
  tile: TileInstance
  opSeq: number
  revision: number
}

export type SequencedTileRemoved = {
  tileId: string
  opSeq: number
  revision: number
}

export type SequencedTilesState = {
  tiles: TileInstance[]
  lastOpSeq: number
  revision: number        // authoritative canvas revision from server acks/snapshot
  requiresSnapshot: boolean
}

export type OptimisticPlacementAck =
  | { placed: null; rejected: true }
  | { placed: TileInstance; rejected: false; opSeq: number; newRevision: number }

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
  revision: 0,
  requiresSnapshot: false,
})

export const applySequencedSnapshot = (snapshot: SequencedSnapshot): SequencedTilesState => ({
  tiles: snapshot.tiles,
  lastOpSeq: snapshot.lastOpSeq,
  revision: snapshot.revision,
  requiresSnapshot: false,
})

export const reconcileOptimisticPlacementAck = (
  state: SequencedTilesState,
  tempTile: TileInstance,
  ack: OptimisticPlacementAck,
): SequencedTilesState => {
  const withoutTemp = state.tiles.filter((tile) => tile.id !== tempTile.id)

  if (ack.rejected) {
    return {
      ...state,
      tiles: withoutTemp,
    }
  }

  const alreadyPresent = withoutTemp.some((tile) => tile.id === ack.placed.id)

  if (alreadyPresent) {
    return {
      ...state,
      tiles: withoutTemp,
      lastOpSeq: Math.max(state.lastOpSeq, ack.opSeq),
      revision: ack.newRevision,
    }
  }

  return {
    ...state,
    tiles: [...withoutTemp, { ...ack.placed, settleFrom: tempTile.settleFrom, placedBy: tempTile.placedBy }],
    lastOpSeq: Math.max(state.lastOpSeq, ack.opSeq),
    revision: ack.newRevision,
  }
}

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
    revision: payload.revision,
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
    revision: payload.revision,
    requiresSnapshot: false,
  }
}

export const isServerTileId = (id: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)

export const createServerTileId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  const randomHex = (size: number): string =>
    Array.from({ length: size }, () => Math.floor(Math.random() * 16).toString(16)).join('')

  const variantNibble = (8 + Math.floor(Math.random() * 4)).toString(16)

  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${variantNibble}${randomHex(3)}-${randomHex(12)}`
}

export const updateGhostTarget = (
  pointer: Vec2,
  activeTile: ActiveTile,
  settled: TileInstance[],
  bounds: MosaicBounds = defaultBounds,
): GhostState => {
  const solved = solveGuidedPlacement(
    pointer,
    activeTile.shape,
    activeTile.rotation,
    activeTile.mirrored,
    settled,
    bounds,
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
