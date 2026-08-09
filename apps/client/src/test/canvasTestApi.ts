import type { TileInstance } from '../domain/placementSolver'
import type { ActiveTile } from '../interaction/controller'
import type { ConnectionStatus } from '../network/useConnectionStatus'
import type { PlaceTileAck } from '../../../server/src/contracts'

export const CANVAS_TEST_API_KEY = '__ZZYIX_E2E_CANVAS__'

export type CanvasTestMode = 'lobby' | 'canonical-loading' | 'canonical-unavailable' | 'canvas'

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

export type CanvasWitnessStudyEventType =
  | 'condition-shown'
  | 'unaided-notice'
  | 'detail-opened'
  | 'hide'
  | 'reset'
  | 'condition-completed'

export type CanvasWitnessStudyCondition = 'no-signal' | 'one-signal'

export type CanvasWitnessStudyRating = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type CanvasWitnessStudyUnaidedNotice = 'noticed' | 'not-noticed'

export type CanvasWitnessStudyAuthorship = 'artist' | 'fantome' | 'both' | 'unsure'

export type CanvasWitnessStudyConstruct =
  | 'intrigue'
  | 'discomfort'
  | 'invisibility'
  | 'confusion'
  | 'perceived-authorship'

export type CanvasWitnessStudyRatings = Readonly<{
  intrigue: CanvasWitnessStudyRating
  discomfort: CanvasWitnessStudyRating
  invisibility: CanvasWitnessStudyRating
  confusion: CanvasWitnessStudyRating
}>

export type CanvasWitnessStudyEvent = Readonly<{
  prototype: 'quiet-witness'
  type: CanvasWitnessStudyEventType
  condition: CanvasWitnessStudyCondition
  unaidedNotice?: CanvasWitnessStudyUnaidedNotice
  ratings?: CanvasWitnessStudyRatings
  perceivedAuthorship?: CanvasWitnessStudyAuthorship
  constructs?: readonly CanvasWitnessStudyConstruct[]
}>

export type CanvasWitnessTestState = Readonly<{
  gates: {
    prototypeFeatureEnabled: boolean
    consentedStudyEnabled: boolean
  }
  signalIds: readonly string[]
  visible: boolean
  detailOpen: boolean
  studyEvents: readonly CanvasWitnessStudyEvent[]
}>

export type CanvasTestStateSnapshot = {
  clientId: string
  ownershipIdentity: string
  sessionId: string | null
  mode: CanvasTestMode
  connectionStatus: ConnectionStatus
  revision: number
  resyncEvents: number
  collaboratorIds: string[]
  activeTile: ActiveTile
  cameraPan: { x: number; y: number }
  grid: {
    enabled: boolean
    patternId?: string
  }
  tiles: CanvasTestTileSnapshot[]
  metrics: {
    retainedPatchCount: number
    retainedTileCount: number
    cursorCount: number
    optimisticCount: number
    undoCount: number
    undoAvailable: boolean
    undoDepth: number
    snapshotBytes: number
    sceneObjectCount: number
    drawCalls: number
    frameTimeMs: number
  }
  witness: CanvasWitnessTestState
}

export type CanvasCanonicalStateSnapshot = Pick<CanvasTestStateSnapshot,
  'clientId' | 'ownershipIdentity' | 'sessionId' | 'mode' | 'connectionStatus' | 'revision'
  | 'resyncEvents' | 'collaboratorIds' | 'tiles' | 'metrics' | 'witness'
>

export type CanvasTestApi = {
  getState: () => CanvasTestStateSnapshot
  getCanonicalState: () => CanvasCanonicalStateSnapshot
  getWitnessState: () => CanvasWitnessTestState
  setWitnessFixtureGates: (gates: CanvasWitnessTestState['gates']) => void
  startCanonicalMutationObserver: () => void
  getCanonicalMutationTraffic: () => readonly string[]
  joinSession: (sessionId: string) => void
  setActiveTile: (patch: Partial<ActiveTile>) => void
  movePointer: (position: { x: number; y: number }) => void
  setCameraPan: (position: { x: number; y: number }) => void
  setGridEnabled: (enabled: boolean) => void
  placeTileAt: (position: { x: number; y: number }) => void
  placeTileAtWithAck: (input: {
    position: { x: number; y: number }
    includeExpectedRevision?: boolean
    expectedRevisionOverride?: number
  }) => Promise<PlaceTileAck>
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