import type { TileInstance } from '../domain/placementSolver'
import type { ActiveTile } from '../interaction/controller'
import type { ConnectionStatus } from '../network/useConnectionStatus'

export const CANVAS_TEST_API_KEY = '__ZZYIX_E2E_CANVAS__'

export type CanvasTestMode = 'lobby' | 'canvas'

export type CanvasTestTileSnapshot = {
  id: string
  shape: TileInstance['shape']
  color: string
  material: TileInstance['material']
  position: {
    x: number
    y: number
  }
  rotation: number
  mirrored: boolean
  placedBy?: string
}

export type CanvasTestStateSnapshot = {
  clientId: string
  sessionId: string | null
  mode: CanvasTestMode
  connectionStatus: ConnectionStatus
  collaboratorIds: string[]
  activeTile: ActiveTile
  tiles: CanvasTestTileSnapshot[]
}

export type CanvasTestApi = {
  getState: () => CanvasTestStateSnapshot
  joinSession: (sessionId: string) => void
  setActiveTile: (patch: Partial<ActiveTile>) => void
  movePointer: (position: { x: number; y: number }) => void
  placeTileAt: (position: { x: number; y: number }) => void
}

declare global {
  interface Window {
    [CANVAS_TEST_API_KEY]?: CanvasTestApi
  }

  interface ImportMetaEnv {
    readonly VITE_E2E_TEST_MODE?: string
  }
}

const parseBooleanFlag = (value: string | undefined): boolean => {
  if (!value) {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export const isCanvasTestApiEnabled = (): boolean => parseBooleanFlag(import.meta.env.VITE_E2E_TEST_MODE)

export const toCanvasTestTileSnapshot = (tile: TileInstance): CanvasTestTileSnapshot => ({
  id: tile.id,
  shape: tile.shape,
  color: tile.color,
  material: tile.material,
  position: {
    x: tile.transform.position.x,
    y: tile.transform.position.y,
  },
  rotation: tile.transform.rotation,
  mirrored: tile.transform.mirrored ?? false,
  placedBy: tile.placedBy,
})

export const registerCanvasTestApi = (api: CanvasTestApi): (() => void) => {
  if (!isCanvasTestApiEnabled() || typeof window === 'undefined') {
    return () => {}
  }

  window[CANVAS_TEST_API_KEY] = api

  return () => {
    if (window[CANVAS_TEST_API_KEY] === api) {
      delete window[CANVAS_TEST_API_KEY]
    }
  }
}