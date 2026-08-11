import { describe, expect, it } from 'vitest'
import {
  createMosaicImportQueue,
  hashMosaicManifest,
  preflightMosaicManifest,
  type MosaicBoundPlacement,
  type MosaicManifest,
} from './mosaicImport'

const makeManifest = (count = 2): MosaicManifest => ({
  schemaVersion: 2,
  source: { imageId: 'source-image', sourceSha256: 'source-hash', dimensions: { width: 1077, height: 1616 } },
  coordinateSpace: 'source-local-normalized-x-y',
  geometry: { shape: 'square', material: 'ceramic', rotation: 0, mirrored: false },
  budget: { placementBudget: count, accepted: count },
  policy: { ordering: 'score-descending-then-candidate-id-ascending', conflict: 'skip-and-record', outOfBounds: 'skip-and-record' },
  provenance: { manifestSha256: '', requiredDeploymentFields: {} },
  placements: Array.from({ length: count }, (_, index) => ({
    id: `tile-${index + 1}`,
    source: { candidateId: `candidate-${index + 1}`, rank: index + 1, normalizedAnchor: { x: 0.15 + index * 0.11, y: 0.15 } },
    tile: { shape: 'square' as const, material: 'ceramic' as const, color: '#696a53', rotation: 0, mirrored: false },
  })),
})

const context = {
  expectedSourceImageId: 'source-image', expectedSourceDimensions: { width: 1077, height: 1616 },
  quiltId: 'quilt-a', deployment: { targetRect: { minX: 0, maxX: 10, minY: 0, maxY: 10 }, sourceToWorld: { origin: { x: 0, y: 0 }, scale: { x: 10, y: 10 } } },
  topology: { quiltId: 'quilt-a', topology: 'bounded' as const, patchRows: 1, patchColumns: 1, patchWidth: 10, patchHeight: 10 },
  worldBounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
  patches: [{ patchId: 'patch-a', row: 0, column: 0, revision: 0, owned: true }],
  policy: { ordering: 'score-descending-then-candidate-id-ascending', conflict: 'skip-and-record', outOfBounds: 'skip-and-record' },
  supportedColors: ['#696a53'],
}

const hashedManifest = async (): Promise<MosaicManifest> => {
  const manifest = makeManifest()
  manifest.provenance.manifestSha256 = await hashMosaicManifest(manifest as unknown as Record<string, unknown>)
  return manifest
}

describe('mosaic import preflight', () => {
  it('accepts a valid self-hashed manifest without repairing it', async () => {
    const manifest = await hashedManifest()
    const result = await preflightMosaicManifest(manifest, context)
    expect(result.ready).toBe(true)
    expect(result.accepted.map((placement) => placement.id)).toEqual(['tile-1', 'tile-2'])
    expect(result.manifest?.deployment.quiltId).toBe('quilt-a')
    expect(result.accepted[0].tile.position).toEqual({ x: 1.5, y: 1.5 })
  })

  it.each([
    ['schema', (manifest: MosaicManifest) => { manifest.schemaVersion = 99 }],
    ['source', (manifest: MosaicManifest) => { manifest.source.imageId = 'other' }],
    ['budget', (manifest: MosaicManifest) => { manifest.budget.placementBudget = 1 }],
    ['provenance', (manifest: MosaicManifest) => { manifest.provenance.manifestSha256 = 'wrong' }],
  ])('rejects %s before import', async (reason, mutate) => {
    const manifest = await hashedManifest()
    mutate(manifest)
    if (reason !== 'provenance') manifest.provenance.manifestSha256 = await hashMosaicManifest(manifest as unknown as Record<string, unknown>)
    const result = await preflightMosaicManifest(manifest, context)
    expect(result.ready).toBe(false)
    expect(result.rejected.map((entry) => entry.reason)).toContain(reason)
  })

  it('rejects duplicate IDs and non-finite normalized coordinates', async () => {
    const manifest = await hashedManifest()
    manifest.placements[1].id = manifest.placements[0].id
    manifest.placements[1].source.normalizedAnchor.x = Number.NaN
    const result = await preflightMosaicManifest(manifest, context)
    expect(result.rejected.map((entry) => entry.reason)).toEqual(expect.arrayContaining(['duplicate-id', 'non-finite', 'provenance']))
  })

  it('requires an explicit valid deployment rectangle and transform', async () => {
    const manifest = await hashedManifest()
    const result = await preflightMosaicManifest(manifest, { ...context, deployment: { ...context.deployment, sourceToWorld: { ...context.deployment.sourceToWorld, scale: { x: 0, y: 10 } } } })
    expect(result.rejected.map((entry) => entry.reason)).toContain('target')
  })

  it('rejects malformed or out-of-range source-local placement geometry', async () => {
    const malformed = await hashedManifest()
    delete (malformed.placements[0].source as Partial<typeof malformed.placements[0]['source']>).normalizedAnchor
    const malformedResult = await preflightMosaicManifest(malformed, context)
    expect(malformedResult.rejected.map((entry) => entry.reason)).toContain('malformed')

    const outOfRange = await hashedManifest()
    outOfRange.placements[0].source.normalizedAnchor.x = 1.1
    outOfRange.provenance.manifestSha256 = await hashMosaicManifest(outOfRange as unknown as Record<string, unknown>)
    const rangeResult = await preflightMosaicManifest(outOfRange, context)
    expect(rangeResult.rejected.map((entry) => entry.reason)).toContain('source')
  })

  it.each([
    ['topology', (manifest: MosaicManifest) => manifest, { ...context, topology: undefined }],
    ['target', (manifest: MosaicManifest) => manifest, { ...context, worldBounds: { minX: 0, maxX: 5, minY: 0, maxY: 10 } }],
    ['ownership', (manifest: MosaicManifest) => manifest, { ...context, patches: [{ patchId: 'patch-a', row: 0, column: 0, revision: 0, owned: false }] }],
    ['cursor', (manifest: MosaicManifest) => manifest, { ...context, patches: [{ patchId: 'patch-a', row: 0, column: 0, owned: true }] }],
    ['color', (manifest: MosaicManifest) => { manifest.placements[0].tile.color = '#ffffff' }, context],
    ['policy', (manifest: MosaicManifest) => { manifest.policy.conflict = 'replace' }, context],
  ] as const)('returns a structured %s rejection before mutation', async (reason, mutate, preflightContext) => {
    const manifest = await hashedManifest()
    mutate(manifest)
    manifest.provenance.manifestSha256 = await hashMosaicManifest(manifest as unknown as Record<string, unknown>)
    const result = await preflightMosaicManifest(manifest, preflightContext)
    expect(result.ready).toBe(false)
    expect(result.accepted).toEqual([])
    expect(result.rejected.map((entry) => entry.reason)).toContain(reason)
  })

  it('rejects an unsupported shape without throwing while deriving a footprint', async () => {
    const manifest = await hashedManifest()
    manifest.placements[0].tile.shape = 'hexagon' as MosaicManifest['placements'][number]['tile']['shape']
    manifest.provenance.manifestSha256 = await hashMosaicManifest(manifest as unknown as Record<string, unknown>)
    await expect(preflightMosaicManifest(manifest, context)).resolves.toMatchObject({ ready: false })
  })
})

describe('mosaic import queue', () => {
  it('keeps at most four requests in flight and completes from ACKs', () => {
    const requests: Array<{ id: string; ack: (response: any) => void }> = []
    const accepted: string[] = []
    const queue = createMosaicImportQueue({
      manifestHash: 'hash-a', placements: makeBoundPlacements(6),
      getExpectedPatchRevisions: () => ({ 'patch-a': 0 }),
      buildRequest: (placement, operationId, revisions) => ({ quiltId: 'quilt-a', operationId, expectedPatchRevisions: revisions, tile: { tileId: placement.id, shape: placement.tile.shape, color: placement.tile.color, material: placement.tile.material, transform: placement.tile } }),
      submit: (request, ack) => requests.push({ id: request.operationId, ack }),
      onAccepted: (placement) => accepted.push(placement.id), isConnected: () => true, canResume: () => true,
      createOperationId: (() => { let index = 0; return () => `operation-${++index}` })(),
    })
    expect(queue.start()).toBe(true)
    expect(requests).toHaveLength(4)
    requests.splice(0).forEach(({ ack, id }) => ack({ status: 'accepted', operationId: id, eventIds: { 'patch-a': id }, patchRevisions: { 'patch-a': 1 }, idempotent: false, tile: {} }))
    expect(requests).toHaveLength(2)
    requests.splice(0).forEach(({ ack, id }) => ack({ status: 'accepted', operationId: id, eventIds: { 'patch-a': id }, patchRevisions: { 'patch-a': 1 }, idempotent: false, tile: {} }))
    expect(accepted).toHaveLength(6)
    expect(queue.getState().status).toBe('complete')
    expect(new Set(queue.getState().outcomes.map((outcome) => outcome.operationId)).size).toBe(6)
  })

  it('pauses for stale revisions, retries twice, and resumes only for the manifest hash', () => {
    const requests: Array<{ ack: (response: any) => void; id: string }> = []
    const queue = createMosaicImportQueue({
      manifestHash: 'hash-a', placements: makeBoundPlacements(1),
      getExpectedPatchRevisions: () => ({ 'patch-a': 0 }),
      buildRequest: (placement, operationId, revisions) => ({ quiltId: 'quilt-a', operationId, expectedPatchRevisions: revisions, tile: { tileId: placement.id, shape: placement.tile.shape, color: placement.tile.color, material: placement.tile.material, transform: placement.tile } }),
      submit: (request, ack) => requests.push({ id: request.operationId, ack }), onAccepted: () => {}, isConnected: () => true, canResume: () => true,
      createOperationId: (() => { let index = 0; return () => `operation-${++index}` })(),
    })
    queue.start()
    requests.shift()!.ack({ status: 'rejected', operationId: 'operation-1', code: 'STALE_REVISION', message: 'stale', requestId: 'request-1' })
    expect(queue.getState().status).toBe('paused')
    expect(queue.resume('wrong')).toBe(false)
    expect(queue.resume('hash-a')).toBe(true)
    requests.shift()!.ack({ status: 'rejected', operationId: 'operation-2', code: 'STALE_REVISION', message: 'stale', requestId: 'request-2' })
    expect(queue.resume('hash-a')).toBe(true)
    requests.shift()!.ack({ status: 'rejected', operationId: 'operation-3', code: 'STALE_REVISION', message: 'stale', requestId: 'request-3' })
    expect(queue.getState().outcomes.at(-1)?.status).toBe('stale_revision')
  })

  it('reads the refreshed same-patch revision after stale recovery', () => {
    const requests: Array<{ request: { expectedPatchRevisions: Record<string, number> }; ack: (response: any) => void }> = []
    let revision = 0
    const queue = createMosaicImportQueue({
      manifestHash: 'hash-a', placements: makeBoundPlacements(2), maxInFlight: 1,
      getExpectedPatchRevisions: () => ({ 'patch-a': revision }),
      buildRequest: (placement, operationId, revisions) => ({ quiltId: 'quilt-a', operationId, expectedPatchRevisions: revisions, tile: { tileId: placement.id, shape: placement.tile.shape, color: placement.tile.color, material: placement.tile.material, transform: placement.tile } }),
      submit: (request, ack) => requests.push({ request, ack }), onAccepted: (_placement, ack) => { revision = ack.patchRevisions['patch-a'] },
      onStaleRevision: () => { revision = 1 }, isConnected: () => true, canResume: () => true,
    })
    queue.start()
    expect(requests[0].request.expectedPatchRevisions).toEqual({ 'patch-a': 0 })
    requests.shift()!.ack({ status: 'rejected', operationId: 'first', code: 'STALE_REVISION', message: 'stale', requestId: 'request-1' })
    expect(queue.resume('hash-a')).toBe(true)
    expect(requests[0].request.expectedPatchRevisions).toEqual({ 'patch-a': 1 })
    requests.shift()!.ack({ status: 'accepted', operationId: 'retry', eventIds: { 'patch-a': 'event-2' }, patchRevisions: { 'patch-a': 2 }, idempotent: false, tile: {} })
    expect(requests[0].request.expectedPatchRevisions).toEqual({ 'patch-a': 2 })
  })

  it('removes optimistic state through terminal rejection callbacks', () => {
    const rejected: string[] = []
    const requests: Array<{ ack: (response: any) => void }> = []
    const queue = createMosaicImportQueue({
      manifestHash: 'hash-a', placements: makeBoundPlacements(1), getExpectedPatchRevisions: () => ({ 'patch-a': 0 }),
      buildRequest: (placement, operationId, revisions) => ({ quiltId: 'quilt-a', operationId, expectedPatchRevisions: revisions, tile: { tileId: placement.id, shape: placement.tile.shape, color: placement.tile.color, material: placement.tile.material, transform: placement.tile } }),
      submit: (_request, ack) => requests.push({ ack }), onAccepted: () => {}, onRejected: (_placement, operationId) => rejected.push(operationId),
      isConnected: () => true, canResume: () => true, createOperationId: () => 'operation-1',
    })
    queue.start()
    requests.shift()!.ack({ status: 'rejected', operationId: 'operation-1', code: 'COLLISION', message: 'collision', requestId: 'request-1' })
    expect(rejected).toEqual(['operation-1'])
  })

  it('pauses on disconnect and resumes after cursor validation', () => {
    let connected = false
    const queue = createMosaicImportQueue({
      manifestHash: 'hash-a', placements: makeBoundPlacements(1), getExpectedPatchRevisions: () => ({ 'patch-a': 0 }),
      buildRequest: (placement, operationId, revisions) => ({ quiltId: 'quilt-a', operationId, expectedPatchRevisions: revisions, tile: { tileId: placement.id, shape: placement.tile.shape, color: placement.tile.color, material: placement.tile.material, transform: placement.tile } }),
      submit: () => {}, onAccepted: () => {}, isConnected: () => connected, canResume: () => true,
    })
    expect(queue.start()).toBe(false)
    connected = true
    expect(queue.resume('hash-a')).toBe(true)
    queue.cancel()
    expect(queue.resume('hash-a')).toBe(true)
  })
})

const makeBoundPlacements = (count: number): MosaicBoundPlacement[] => makeManifest(count).placements.map((placement) => ({
  ...placement,
  tile: { ...placement.tile, position: { x: 1.5, y: 1.5 } },
  footprint: { minX: 1.06, maxX: 1.94, minY: 1.06, maxY: 1.94 },
}))