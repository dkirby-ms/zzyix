import type { QuiltMutationRejectCode, QuiltPatchRevisionMap, QuiltPlaceTileAck, QuiltPlaceTileRequest } from '../../../server/src/contracts'
import { derivePlacementBounds, type MosaicBounds } from './placementSolver'
import type { MaterialVariant, TileShape, Transform2D } from './tileGeometry'

export const MOSAIC_MANIFEST_SCHEMA_VERSION = 2
export const MOSAIC_IMPORT_MAX_IN_FLIGHT = 4
export const MOSAIC_IMPORT_STALE_REVISION_RETRIES = 2

export type MosaicManifestPlacement = {
  id: string
  source: { candidateId: string; rank: number; normalizedAnchor: { x: number; y: number } }
  tile: {
    shape: TileShape
    material: MaterialVariant
    color: string
    rotation: number
    mirrored?: boolean
  }
}

export type MosaicBoundPlacement = {
  id: string
  source: MosaicManifestPlacement['source']
  tile: MosaicManifestPlacement['tile'] & { position: { x: number; y: number } }
  footprint: MosaicBounds
}

export type MosaicManifest = {
  schemaVersion: number
  source: { imageId: string; sourceSha256: string; dimensions: { width: number; height: number } }
  coordinateSpace: 'source-local-normalized-x-y'
  geometry: { shape: TileShape; material: MaterialVariant; rotation: number; mirrored: boolean }
  budget: { placementBudget: number; accepted: number }
  policy: { ordering: string; conflict: string; outOfBounds: string }
  provenance: { manifestSha256: string; requiredDeploymentFields: Record<string, string> }
  placements: MosaicManifestPlacement[]
}

export type MosaicDeploymentContext = {
  targetRect: MosaicBounds
  sourceToWorld: { origin: { x: number; y: number }; scale: { x: number; y: number } }
}

export type MosaicImportRequest = {
  manifest: unknown
  deployment: MosaicDeploymentContext
}

export type MosaicBoundManifest = MosaicManifest & {
  deployment: MosaicDeploymentContext & { quiltId: string }
  placements: MosaicBoundPlacement[]
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
  | 'ownership'
  | 'color'
  | 'policy'

export type MosaicPreflightRejection = {
  reason: MosaicPreflightReason
  placementId?: string
  candidateId?: string
  message: string
}

export type MosaicPreflightResult = {
  ready: boolean
  manifest?: MosaicBoundManifest
  manifestHash?: string
  accepted: MosaicBoundPlacement[]
  rejected: MosaicPreflightRejection[]
  warnings: string[]
  counts: { accepted: number; rejected: number; warnings: number }
}

export type MosaicPreflightContext = {
  expectedSourceImageId: string
  expectedSourceDimensions: { width: number; height: number }
  quiltId: string
  deployment: MosaicDeploymentContext
  topology?: {
    quiltId: string
    topology: 'bounded' | 'toroidal'
    patchRows: number
    patchColumns: number
    patchWidth: number
    patchHeight: number
  }
  worldBounds?: MosaicBounds
  patches?: readonly MosaicImportPatchState[]
  policy?: MosaicManifest['policy']
  supportedColors?: readonly string[]
  maxPayloadBytes?: number
}

export type MosaicImportPatchState = {
  patchId: string
  row: number
  column: number
  revision?: number
  owned: boolean
}

const SHAPES = new Set<TileShape>(['square', 'triangle', 'rectangle', 'l-shape', 'large-square', 'circle', 'right-triangle', 'large-right-triangle'])
const MATERIALS = new Set<MaterialVariant>(['ceramic', 'glass', 'stone'])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isPositiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0
const hasString = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const isTileShape = (value: unknown): value is TileShape => typeof value === 'string' && SHAPES.has(value as TileShape)
const isMaterial = (value: unknown): value is MaterialVariant => typeof value === 'string' && MATERIALS.has(value as MaterialVariant)
const isSupportedColor = (value: unknown, supportedColors?: readonly string[]): value is string =>
  hasString(value) && (supportedColors ? supportedColors.includes(value) : /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value))

export const parseMosaicImportRequest = (input: unknown): MosaicImportRequest | undefined => {
  if (!isRecord(input) || !('manifest' in input) || !isRecord(input.deployment) || !isRecord(input.deployment.targetRect) || !isRecord(input.deployment.sourceToWorld) || !isRecord(input.deployment.sourceToWorld.origin) || !isRecord(input.deployment.sourceToWorld.scale)) return undefined
  return { manifest: input.manifest, deployment: input.deployment as MosaicDeploymentContext }
}

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
  if (!isRecord(input.source) || !isRecord(input.geometry) || !isRecord(input.budget) || !isRecord(input.policy) || !isRecord(input.provenance) || !Array.isArray(input.placements)) {
    return preflightFailure('malformed', 'Manifest is missing a required section')
  }
  if (!isRecord(input.source.dimensions) || input.coordinateSpace !== 'source-local-normalized-x-y' || !hasString(input.source.imageId) || !hasString(input.source.sourceSha256) || !hasString(input.provenance.manifestSha256)) {
    return preflightFailure('malformed', 'Manifest contains an incomplete required section')
  }
  if (!input.placements.every((placement) => isRecord(placement) && isRecord(placement.source) && isRecord(placement.source.normalizedAnchor) && isRecord(placement.tile))) {
    return preflightFailure('malformed', 'Manifest placements must include source-local normalized anchors and tile attributes')
  }
  return { ready: false, manifest: input as unknown as MosaicBoundManifest, accepted: [], rejected: [], warnings: [], counts: { accepted: 0, rejected: 0, warnings: 0 } }
}

const preflightFailure = (reason: MosaicPreflightReason, message: string): MosaicPreflightResult => ({
  ready: false,
  accepted: [],
  rejected: [{ reason, message }],
  warnings: [],
  counts: { accepted: 0, rejected: 1, warnings: 0 },
})

const reject = (rejected: MosaicPreflightRejection[], reason: MosaicPreflightReason, message: string, placement?: MosaicBoundPlacement): void => {
  rejected.push({ reason, message, ...(placement ? { placementId: placement.id, candidateId: placement.source.candidateId } : {}) })
}

const rejectPlacement = (rejected: MosaicPreflightRejection[], reason: MosaicPreflightReason, message: string, placement: MosaicManifestPlacement): void => {
  rejected.push({ reason, message, placementId: placement.id, candidateId: placement.source.candidateId })
}

const isPlacementFinite = (placement: MosaicBoundPlacement): boolean => [
  placement.source.normalizedAnchor.x,
  placement.source.normalizedAnchor.y,
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
  if (!hasString(context.quiltId)) reject(rejected, 'target', 'Active canonical quilt identity is unavailable')
  if (!hasString(manifest.provenance.manifestSha256)) reject(rejected, 'provenance', 'Manifest provenance hash is missing')
  if (!isPositiveInteger(manifest.budget.placementBudget) || manifest.budget.accepted !== manifest.placements.length || manifest.placements.length > manifest.budget.placementBudget) reject(rejected, 'budget', 'Manifest placement budget is inconsistent')
  if (context.maxPayloadBytes !== undefined && new TextEncoder().encode(JSON.stringify(raw)).byteLength > context.maxPayloadBytes) reject(rejected, 'budget', 'Manifest exceeds the client payload budget')
  if (!sameDeploymentTransform(context.deployment)) reject(rejected, 'target', 'Deployment target rectangle and source-to-world transform are required')
  if (!hasValidTopology(context.topology, context.quiltId)) reject(rejected, 'topology', 'Live quilt topology is unavailable or invalid')
  if (!containsBounds(context.worldBounds, context.deployment.targetRect)) reject(rejected, 'target', 'Deployment target rectangle is outside the canonical world bounds')
  if (context.policy && !samePolicy(manifest.policy, context.policy)) reject(rejected, 'policy', 'Manifest policy does not match the configured import policy')

  const ids = new Set<string>()
  const candidates = new Set<string>()
  let previousRank = 0
  const boundPlacements: MosaicBoundPlacement[] = []
  manifest.placements.forEach((placement) => {
    if (!hasString(placement.id) || ids.has(placement.id)) rejectPlacement(rejected, 'duplicate-id', 'Placement IDs must be unique', placement)
    ids.add(placement.id)
    if (!hasString(placement.source.candidateId) || candidates.has(placement.source.candidateId)) rejectPlacement(rejected, 'duplicate-candidate', 'Source candidate IDs must be unique', placement)
    candidates.add(placement.source.candidateId)
    if (!isTileShape(placement.tile.shape) || !isMaterial(placement.tile.material)) {
      rejectPlacement(rejected, 'unsupported', 'Placement uses an unsupported tile attribute', placement)
      return
    }
    if (!isSupportedColor(placement.tile.color, context.supportedColors)) {
      rejectPlacement(rejected, 'color', 'Placement color is not supported by the import contract', placement)
      return
    }
    const bound = bindPlacement(placement, context.deployment)
    boundPlacements.push(bound)
    if (!isPlacementFinite(bound)) reject(rejected, 'non-finite', 'Placement transform and footprint must be finite', bound)
    if (placement.source.normalizedAnchor.x < 0 || placement.source.normalizedAnchor.x > 1 || placement.source.normalizedAnchor.y < 0 || placement.source.normalizedAnchor.y > 1) reject(rejected, 'source', 'Placement source-local coordinates must be normalized to the unit rectangle', bound)
    const transform: Transform2D = { position: bound.tile.position, rotation: bound.tile.rotation, mirrored: bound.tile.mirrored }
    const derived = derivePlacementBounds(bound.tile.shape, transform)
    if (JSON.stringify(derived) !== JSON.stringify(bound.footprint)
      || bound.footprint.minX < context.deployment.targetRect.minX
      || bound.footprint.maxX > context.deployment.targetRect.maxX
      || bound.footprint.minY < context.deployment.targetRect.minY
      || bound.footprint.maxY > context.deployment.targetRect.maxY) {
      reject(rejected, 'footprint', 'Deployment transform places a tile outside its target rectangle or produces an invalid footprint', bound)
    }
    if (placement.source.rank <= previousRank) reject(rejected, 'ordering', 'Placements must be ordered by increasing source rank', bound)
    previousRank = placement.source.rank
    const affectedPatches = findAffectedPatches(bound.footprint, context.topology, context.patches)
    if (!affectedPatches) {
      reject(rejected, 'cursor', 'Current patch cursors are unavailable for every affected placement patch', bound)
    } else if (affectedPatches.some((patch) => !patch.owned)) {
      reject(rejected, 'ownership', 'Import deployment includes a patch not owned by the current user', bound)
    }
  })

  const hash = await hashMosaicManifest(raw)
  if (hash !== manifest.provenance.manifestSha256) reject(rejected, 'provenance', 'Manifest provenance hash does not match its content')
  const accepted = rejected.length === 0 ? boundPlacements : []
  const boundManifest: MosaicBoundManifest = { ...manifest, deployment: { ...context.deployment, quiltId: context.quiltId }, placements: boundPlacements }
  return { ready: rejected.length === 0, manifest: accepted.length > 0 ? boundManifest : undefined, manifestHash: hash, accepted, rejected, warnings, counts: { accepted: accepted.length, rejected: rejected.length, warnings: warnings.length } }
}

const sameDeploymentTransform = (deployment: MosaicDeploymentContext): boolean => {
  const values = [deployment.targetRect.minX, deployment.targetRect.maxX, deployment.targetRect.minY, deployment.targetRect.maxY, deployment.sourceToWorld.origin.x, deployment.sourceToWorld.origin.y, deployment.sourceToWorld.scale.x, deployment.sourceToWorld.scale.y]
  return values.every(isFiniteNumber) && deployment.targetRect.maxX > deployment.targetRect.minX && deployment.targetRect.maxY > deployment.targetRect.minY && deployment.sourceToWorld.scale.x > 0 && deployment.sourceToWorld.scale.y > 0
}

const hasValidTopology = (topology: MosaicPreflightContext['topology'], quiltId: string): topology is NonNullable<MosaicPreflightContext['topology']> =>
  topology !== undefined
  && topology.quiltId === quiltId
  && (topology.topology === 'bounded' || topology.topology === 'toroidal')
  && [topology.patchRows, topology.patchColumns].every(isPositiveInteger)
  && [topology.patchWidth, topology.patchHeight].every((value) => isFiniteNumber(value) && value > 0)

const containsBounds = (worldBounds: MosaicBounds | undefined, targetRect: MosaicBounds): boolean =>
  worldBounds !== undefined
  && targetRect.minX >= worldBounds.minX
  && targetRect.maxX <= worldBounds.maxX
  && targetRect.minY >= worldBounds.minY
  && targetRect.maxY <= worldBounds.maxY

const samePolicy = (actual: MosaicManifest['policy'], expected: MosaicManifest['policy']): boolean =>
  actual.ordering === expected.ordering
  && actual.conflict === expected.conflict
  && actual.outOfBounds === expected.outOfBounds

const findAffectedPatches = (
  footprint: MosaicBounds,
  topology: MosaicPreflightContext['topology'],
  patches: readonly MosaicImportPatchState[] | undefined,
): MosaicImportPatchState[] | undefined => {
  if (!topology || !patches) return undefined
  const maxX = Math.max(footprint.minX, footprint.maxX - Number.EPSILON)
  const maxY = Math.max(footprint.minY, footprint.maxY - Number.EPSILON)
  const matches: MosaicImportPatchState[] = []
  for (let row = Math.floor(footprint.minY / topology.patchHeight); row <= Math.floor(maxY / topology.patchHeight); row += 1) {
    for (let column = Math.floor(footprint.minX / topology.patchWidth); column <= Math.floor(maxX / topology.patchWidth); column += 1) {
      const patch = patches.find((entry) => entry.row === row && entry.column === column)
      if (!patch || !isFiniteNumber(patch.revision)) return undefined
      matches.push(patch)
    }
  }
  return matches
}

const bindPlacement = (placement: MosaicManifestPlacement, deployment: MosaicDeploymentContext): MosaicBoundPlacement => {
  const position = {
    x: deployment.targetRect.minX + deployment.sourceToWorld.origin.x + placement.source.normalizedAnchor.x * deployment.sourceToWorld.scale.x,
    y: deployment.targetRect.minY + deployment.sourceToWorld.origin.y + placement.source.normalizedAnchor.y * deployment.sourceToWorld.scale.y,
  }
  const tile = { ...placement.tile, position }
  return { ...placement, tile, footprint: derivePlacementBounds(tile.shape, tile) }
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
  placements: readonly MosaicBoundPlacement[]
  getExpectedPatchRevisions: (placement: MosaicBoundPlacement) => QuiltPatchRevisionMap | undefined
  buildRequest: (placement: MosaicBoundPlacement, operationId: string, revisions: QuiltPatchRevisionMap) => QuiltPlaceTileRequest
  submit: (request: QuiltPlaceTileRequest, ack: (response: QuiltPlaceTileAck) => void) => void
  onAccepted: (placement: MosaicBoundPlacement, ack: Extract<QuiltPlaceTileAck, { status: 'accepted' }>) => void
  onRejected?: (placement: MosaicBoundPlacement, operationId: string, ack: Extract<QuiltPlaceTileAck, { status: 'rejected' }>) => void
  isConnected: () => boolean
  canResume: () => boolean
  createOperationId?: () => string
  maxInFlight?: number
  staleRevisionRetries?: number
  onStaleRevision?: (placement: MosaicBoundPlacement, operationId: string) => void
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
          options.onStaleRevision?.(placement, operationId)
        } else {
          options.onRejected?.(placement, operationId, ack)
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

const placementForIndex = (placements: readonly MosaicBoundPlacement[], index: number): MosaicBoundPlacement => {
  const placement = placements[index]
  if (!placement) throw new Error(`Missing manifest placement at index ${index}`)
  return placement
}