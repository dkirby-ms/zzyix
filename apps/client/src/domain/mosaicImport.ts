import type { QuiltMutationRejectCode, QuiltPatchRevisionMap, QuiltPlaceTileAck, QuiltPlaceTileRequest } from '../../../server/src/contracts'
import { derivePlacementBounds, type MosaicBounds } from './placementSolver'
import type { MaterialVariant, TileShape, Transform2D } from './tileGeometry'

export const MOSAIC_MANIFEST_SCHEMA_VERSION = 1
export const MOSAIC_IMPORT_MAX_IN_FLIGHT = 4
export const MOSAIC_IMPORT_STALE_REVISION_RETRIES = 2

export type MosaicManifestPlacement = {
  id: string
  source: { candidateId: string; rank: number }
  tile: {
    position: { x: number; y: number }
    shape: TileShape
    material: MaterialVariant
    color: string
    rotation: number
    mirrored?: boolean
  }
  footprint: MosaicBounds
}

export type MosaicManifest = {
  schemaVersion: number
  source: { imageId: string; sourceSha256: string; dimensions: { width: number; height: number } }
  target: {
    quiltId: string
    patchId: string
    targetRect: MosaicBounds
    sourceToWorld: { origin: { x: number; y: number }; scale: { x: number; y: number } }
    topology: {
      patchRows: number
      patchColumns: number
      patchWidth: number
      patchHeight: number
      originX: number
      originY: number
    }
    coordinateSpace: string
  }
  geometry: { shape: TileShape; material: MaterialVariant; rotation: number; mirrored: boolean }
  budget: { placementBudget: number; accepted: number }
  policy: { ordering: string; conflict: string; outOfBounds: string }
  provenance: { manifestSha256: string; requiredTargetFields: Record<string, string> }
  placements: MosaicManifestPlacement[]
}

export type MosaicPreflightReason =
  | 'malformed'
  | 'schema'
  | 'provenance'
  | 'source'
  | 'topology'
  | 'target'
  | 'unsupported'
  | 'non-finite'
  | 'duplicate-id'
  | 'duplicate-candidate'
  | 'footprint'
  | 'ordering'
  | 'budget'
  | 'cursor'

export type MosaicPreflightRejection = {
  reason: MosaicPreflightReason
  placementId?: string
  candidateId?: string
  message: string
}

export type MosaicPreflightResult = {
  ready: boolean
  manifest?: MosaicManifest
  manifestHash?: string
  accepted: MosaicManifestPlacement[]
  rejected: MosaicPreflightRejection[]
  warnings: string[]
  counts: { accepted: number; rejected: number; warnings: number }
}

export type MosaicPreflightContext = {
  expectedSourceImageId: string
  expectedSourceDimensions: { width: number; height: number }
  expectedTopology: { patchRows: number; patchColumns: number; patchWidth: number; patchHeight: number; originX: number; originY: number }
  quiltId: string
  patchId: string
  patchRevision?: number
  maxPayloadBytes?: number
}

const SHAPES = new Set<TileShape>(['square', 'triangle', 'rectangle', 'l-shape', 'large-square', 'circle', 'right-triangle', 'large-right-triangle'])
const MATERIALS = new Set<MaterialVariant>(['ceramic', 'glass', 'stone'])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isPositiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0
const hasString = (value: unknown): value is string => typeof value === 'string' && value.length > 0

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

const manifestHashInput = (manifest: Record<string, unknown>): string => {
  const copy = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>
  const provenance = copy.provenance
  if (isRecord(provenance)) {
    delete provenance.manifestSha256
    delete provenance.manifestBytes
  }
  return stableStringify(copy)
}

const toHex = (bytes: ArrayBuffer): string => Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('')

export const hashMosaicManifest = async (manifest: Record<string, unknown>): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(manifestHashInput(manifest)))
  return toHex(digest)
}

export const parseMosaicManifest = (input: unknown): MosaicPreflightResult => {
  if (!isRecord(input)) return preflightFailure('malformed', 'Manifest must be a JSON object')
  if (input.schemaVersion !== MOSAIC_MANIFEST_SCHEMA_VERSION) return preflightFailure('schema', 'Unsupported manifest schema version')
  if (!isRecord(input.source) || !isRecord(input.target) || !isRecord(input.geometry) || !isRecord(input.budget) || !isRecord(input.policy) || !isRecord(input.provenance) || !Array.isArray(input.placements)) {
    return preflightFailure('malformed', 'Manifest is missing a required section')
  }
  if (!isRecord(input.source.dimensions) || !isRecord(input.target.targetRect) || !isRecord(input.target.sourceToWorld) || !isRecord(input.target.sourceToWorld.origin) || !isRecord(input.target.sourceToWorld.scale) || !isRecord(input.target.topology) || !hasString(input.source.imageId) || !hasString(input.source.sourceSha256) || !hasString(input.target.quiltId) || !hasString(input.target.patchId) || !hasString(input.target.coordinateSpace) || !hasString(input.provenance.manifestSha256)) {
    return preflightFailure('malformed', 'Manifest contains an incomplete required section')
  }
  return { ready: false, manifest: input as unknown as MosaicManifest, accepted: [], rejected: [], warnings: [], counts: { accepted: 0, rejected: 0, warnings: 0 } }
}

const preflightFailure = (reason: MosaicPreflightReason, message: string): MosaicPreflightResult => ({
  ready: false,
  accepted: [],
  rejected: [{ reason, message }],
  warnings: [],
  counts: { accepted: 0, rejected: 1, warnings: 0 },
})

const reject = (rejected: MosaicPreflightRejection[], reason: MosaicPreflightReason, message: string, placement?: MosaicManifestPlacement): void => {
  rejected.push({ reason, message, ...(placement ? { placementId: placement.id, candidateId: placement.source.candidateId } : {}) })
}

const TOPOLOGY_KEYS = ['patchRows', 'patchColumns', 'patchWidth', 'patchHeight', 'originX', 'originY'] as const
const sameTopology = (left: MosaicManifest['target']['topology'], right: MosaicPreflightContext['expectedTopology']): boolean =>
  TOPOLOGY_KEYS.every((key) => left[key] === right[key])

const isPlacementFinite = (placement: MosaicManifestPlacement): boolean => [
  placement.tile.position.x,
  placement.tile.position.y,
  placement.tile.rotation,
  placement.footprint.minX,
  placement.footprint.maxX,
  placement.footprint.minY,
  placement.footprint.maxY,
].every(isFiniteNumber)

export const preflightMosaicManifest = async (input: unknown, context: MosaicPreflightContext): Promise<MosaicPreflightResult> => {
  const parsed = parseMosaicManifest(input)
  if (!parsed.manifest) return parsed
  const manifest = parsed.manifest
  const rejected: MosaicPreflightRejection[] = []
  const warnings: string[] = []
  const raw = input as Record<string, unknown>

  if (!hasString(manifest.source.imageId) || manifest.source.imageId !== context.expectedSourceImageId || manifest.source.dimensions.width !== context.expectedSourceDimensions.width || manifest.source.dimensions.height !== context.expectedSourceDimensions.height) reject(rejected, 'source', 'Manifest source identity or dimensions do not match the import contract')
  if (manifest.target.quiltId !== context.quiltId || manifest.target.patchId !== context.patchId || manifest.target.coordinateSpace !== 'canonical-world-x-y') reject(rejected, 'target', 'Manifest target does not match the selected canonical quilt and patch')
  if (!sameTopology(manifest.target.topology, context.expectedTopology)) reject(rejected, 'topology', 'Manifest topology does not match the connected quilt')
  if (!hasString(manifest.provenance.manifestSha256)) reject(rejected, 'provenance', 'Manifest provenance hash is missing')
  if (context.patchRevision === undefined) reject(rejected, 'cursor', 'Current target patch cursor is unavailable')
  if (!isPositiveInteger(manifest.budget.placementBudget) || manifest.budget.accepted !== manifest.placements.length || manifest.placements.length > manifest.budget.placementBudget) reject(rejected, 'budget', 'Manifest placement budget is inconsistent')
  if (context.maxPayloadBytes !== undefined && new TextEncoder().encode(JSON.stringify(raw)).byteLength > context.maxPayloadBytes) reject(rejected, 'budget', 'Manifest exceeds the client payload budget')
  if (!sameTargetTransform(manifest)) reject(rejected, 'target', 'Manifest target transform is invalid')

  const ids = new Set<string>()
  const candidates = new Set<string>()
  let previousRank = 0
  manifest.placements.forEach((placement) => {
    if (!hasString(placement.id) || ids.has(placement.id)) reject(rejected, 'duplicate-id', 'Placement IDs must be unique', placement)
    ids.add(placement.id)
    if (!hasString(placement.source.candidateId) || candidates.has(placement.source.candidateId)) reject(rejected, 'duplicate-candidate', 'Source candidate IDs must be unique', placement)
    candidates.add(placement.source.candidateId)
    if (!isPlacementFinite(placement)) reject(rejected, 'non-finite', 'Placement transform and footprint must be finite', placement)
    if (!SHAPES.has(placement.tile.shape) || !MATERIALS.has(placement.tile.material)) reject(rejected, 'unsupported', 'Placement uses an unsupported tile attribute', placement)
    const transform: Transform2D = { position: placement.tile.position, rotation: placement.tile.rotation, mirrored: placement.tile.mirrored }
    const derived = derivePlacementBounds(placement.tile.shape, transform)
    if (JSON.stringify(derived) !== JSON.stringify(placement.footprint)
      || placement.footprint.minX < manifest.target.targetRect.minX
      || placement.footprint.maxX > manifest.target.targetRect.maxX
      || placement.footprint.minY < manifest.target.targetRect.minY
      || placement.footprint.maxY > manifest.target.targetRect.maxY) {
      reject(rejected, 'footprint', 'Placement footprint does not match the supported tile geometry or target bounds', placement)
    }
    if (placement.source.rank <= previousRank) reject(rejected, 'ordering', 'Placements must be ordered by increasing source rank', placement)
    previousRank = placement.source.rank
  })

  const hash = await hashMosaicManifest(raw)
  if (hash !== manifest.provenance.manifestSha256) reject(rejected, 'provenance', 'Manifest provenance hash does not match its content')
  const accepted = rejected.length === 0 ? [...manifest.placements] : []
  return { ready: rejected.length === 0, manifest: accepted.length > 0 ? manifest : undefined, manifestHash: hash, accepted, rejected, warnings, counts: { accepted: accepted.length, rejected: rejected.length, warnings: warnings.length } }
}

const sameTargetTransform = (manifest: MosaicManifest): boolean => {
  const values = [manifest.target.targetRect.minX, manifest.target.targetRect.maxX, manifest.target.targetRect.minY, manifest.target.targetRect.maxY, manifest.target.sourceToWorld.origin.x, manifest.target.sourceToWorld.origin.y, manifest.target.sourceToWorld.scale.x, manifest.target.sourceToWorld.scale.y]
  return values.every(isFiniteNumber) && manifest.target.targetRect.maxX > manifest.target.targetRect.minX && manifest.target.targetRect.maxY > manifest.target.targetRect.minY && manifest.target.sourceToWorld.scale.x > 0 && manifest.target.sourceToWorld.scale.y > 0
}

export type MosaicImportOutcome =
  | { placementId: string; operationId: string; status: 'accepted'; idempotent: boolean }
  | { placementId: string; operationId: string; status: 'collision' | 'bounds' | 'authorization' | 'throttle' | 'resource' | 'malformed' | 'stale_revision' | 'cancelled'; code?: string; message?: string }

export type MosaicImportQueueState = {
  manifestHash: string
  status: 'idle' | 'running' | 'paused' | 'cancelled' | 'complete'
  nextIndex: number
  inFlight: number
  outcomes: MosaicImportOutcome[]
}

type QueueOptions = {
  manifestHash: string
  placements: readonly MosaicManifestPlacement[]
  getExpectedPatchRevisions: (placement: MosaicManifestPlacement) => QuiltPatchRevisionMap | undefined
  buildRequest: (placement: MosaicManifestPlacement, operationId: string, revisions: QuiltPatchRevisionMap) => QuiltPlaceTileRequest
  submit: (request: QuiltPlaceTileRequest, ack: (response: QuiltPlaceTileAck) => void) => void
  onAccepted: (placement: MosaicManifestPlacement, ack: Extract<QuiltPlaceTileAck, { status: 'accepted' }>) => void
  isConnected: () => boolean
  canResume: () => boolean
  createOperationId?: () => string
  maxInFlight?: number
  staleRevisionRetries?: number
  onStaleRevision?: () => void
  onState?: (state: MosaicImportQueueState) => void
}

type MosaicRejectedOutcomeStatus = Exclude<Extract<MosaicImportOutcome['status'], string>, 'accepted'>
const REJECTED_OUTCOME_STATUS: Record<QuiltMutationRejectCode, MosaicRejectedOutcomeStatus> = {
  COLLISION: 'collision',
  INVALID_FOOTPRINT: 'bounds',
  UNAUTHORIZED: 'authorization',
  AUTHENTICATION_REQUIRED: 'authorization',
  THROTTLED: 'throttle',
  RESOURCE_UNAVAILABLE: 'resource',
  STALE_REVISION: 'stale_revision',
  MUTATION_DISABLED: 'resource',
}
const outcomeStatus = (code: QuiltMutationRejectCode): MosaicRejectedOutcomeStatus => REJECTED_OUTCOME_STATUS[code]

export const createMosaicImportQueue = (options: QueueOptions) => {
  const createOperationId = options.createOperationId ?? (() => crypto.randomUUID())
  const maxInFlight = Math.min(MOSAIC_IMPORT_MAX_IN_FLIGHT, options.maxInFlight ?? MOSAIC_IMPORT_MAX_IN_FLIGHT)
  const retryLimit = options.staleRevisionRetries ?? MOSAIC_IMPORT_STALE_REVISION_RETRIES
  const retries = new Map<number, number>()
  const state: MosaicImportQueueState = { manifestHash: options.manifestHash, status: 'idle', nextIndex: 0, inFlight: 0, outcomes: [] }
  const publish = (): void => options.onState?.({ ...state, outcomes: [...state.outcomes] })
  const pump = (): void => {
    if (state.status !== 'running' || !options.isConnected()) return
    while (state.inFlight < maxInFlight && state.nextIndex < options.placements.length) {
      const index = state.nextIndex
      const revisions = options.getExpectedPatchRevisions(placementForIndex(options.placements, index))
      if (!revisions) { state.status = 'paused'; publish(); return }
      state.nextIndex += 1
      state.inFlight += 1
      const operationId = createOperationId()
      const placement = placementForIndex(options.placements, index)
      options.submit(options.buildRequest(placement, operationId, revisions), (ack) => {
        state.inFlight -= 1
        if (ack.status === 'accepted') {
          options.onAccepted(placement, ack)
          state.outcomes.push({ placementId: placement.id, operationId, status: 'accepted', idempotent: ack.idempotent })
        } else if (ack.code === 'STALE_REVISION' && (retries.get(index) ?? 0) < retryLimit) {
          retries.set(index, (retries.get(index) ?? 0) + 1)
          state.nextIndex = Math.min(state.nextIndex, index)
          state.status = 'paused'
          options.onStaleRevision?.()
        } else {
          state.outcomes.push({ placementId: placement.id, operationId, status: outcomeStatus(ack.code), code: ack.code, message: ack.message })
        }
        if (state.status === 'running' && state.nextIndex >= options.placements.length && state.inFlight === 0) state.status = 'complete'
        publish()
        pump()
      })
    }
    publish()
  }
  return {
    getState: (): MosaicImportQueueState => ({ ...state, outcomes: [...state.outcomes] }),
    start: (): boolean => { if (!options.isConnected() || !options.canResume()) return false; state.status = 'running'; pump(); return true },
    resume: (manifestHash: string): boolean => { if (manifestHash !== state.manifestHash || !options.isConnected() || !options.canResume()) return false; state.status = 'running'; pump(); return true },
    pause: (): void => { if (state.status === 'running') state.status = 'paused'; publish() },
    cancel: (): void => { if (state.status === 'complete') return; state.status = 'cancelled'; publish() },
  }
}

const placementForIndex = (placements: readonly MosaicManifestPlacement[], index: number): MosaicManifestPlacement => {
  const placement = placements[index]
  if (!placement) throw new Error(`Missing manifest placement at index ${index}`)
  return placement
}