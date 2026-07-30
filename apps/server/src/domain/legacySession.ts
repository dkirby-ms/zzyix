import type { BoundsPolicy, TileInstance } from '../contracts.js'

export type LegacySession = {
  id: string
  tiles: TileInstance[]
  boundsPolicy?: BoundsPolicy
  createdAt: number
  updatedAt: number
}

export type LegacySessionCanvasConfig = {
  canvasSize: { width: number; height: number }
  boundsPolicy: BoundsPolicy
}