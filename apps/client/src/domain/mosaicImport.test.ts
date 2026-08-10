import { describe, expect, it } from 'vitest'
import {
  createMosaicImportQueue,
  hashMosaicManifest,
  preflightMosaicManifest,
  type MosaicManifest,
} from './mosaicImport'

const topology = { patchRows: 32, patchColumns: 32, patchWidth: 31.2, patchHeight: 20.4, originX: 0, originY: 0 }

const makeManifest = (count = 2): MosaicManifest => ({
  schemaVersion: 1,
  source: { imageId: 'alexander', sourceSha256: 'source-hash', dimensions: { width: 1077, height: 1616 } },
  target: {
  quiltId: 'quilt-a', patchId: 'patch-a', targetRect: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
  sourceToWorld: { origin: { x: 0, y: 0 }, scale: { x: 10, y: 10 } }, topology: { ...topology }, coordinateSpace: 'canonical-world-x-y',
  },
  geometry: { shape: 'square', material: 'ceramic', rotation: 0, mirrored: false },
  budget: { placementBudget: count, accepted: count },
  policy: { ordering: 'score-descending-then-candidate-id-ascending', conflict: 'skip-and-record', outOfBounds: 'skip-and-record' },
  provenance: { manifestSha256: '', requiredTargetFields: {} },
  placements: Array.from({ length: count }, (_, index) => ({
    id: `tile-${index + 1}`,
    source: { candidateId: `candidate-${index + 1}`, rank: index + 1 },
    tile: { position: { x: 1.5 + index * 1.1, y: 1.5 }, shape: 'square' as const, material: 'ceramic' as const, color: '#696a53', rotation: 0, mirrored: false },
    footprint: { minX: 1.06 + index * 1.1, maxX: 1.94 + index * 1.1, minY: 1.06, maxY: 1.94 },
  })),
})

const context = {
  expectedSourceImageId: 'alexander', expectedSourceDimensions: { width: 1077, height: 1616 },
  expectedTopology: topology, quiltId: 'quilt-a', patchId: 'patch-a', patchRevision: 0,
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
  })

  it.each([
    ['schema', (manifest: MosaicManifest) => { manifest.schemaVersion = 99 }],
    ['source', (manifest: MosaicManifest) => { manifest.source.imageId = 'other' }],
    ['target', (manifest: MosaicManifest) => { manifest.target.patchId = 'other' }],
    ['topology', (manifest: MosaicManifest) => { manifest.target.topology.patchRows = 31 }],
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

  it('rejects duplicate IDs, non-finite transforms, and mismatched footprints', async () => {
    const manifest = await hashedManifest()
    manifest.placements[1].id = manifest.placements[0].id
    manifest.placements[1].tile.position.x = Number.NaN
    const result = await preflightMosaicManifest(manifest, context)
    expect(result.rejected.map((entry) => entry.reason)).toEqual(expect.arrayContaining(['duplicate-id', 'non-finite', 'footprint', 'provenance']))
  })

  it('requires the current target cursor', async () => {
    const manifest = await hashedManifest()
    const result = await preflightMosaicManifest(manifest, { ...context, patchRevision: undefined })
    expect(result.rejected.map((entry) => entry.reason)).toContain('cursor')
  })
})

describe('mosaic import queue', () => {
  it('keeps at most four requests in flight and completes from ACKs', () => {
    const requests: Array<{ id: string; ack: (response: any) => void }> = []
    const accepted: string[] = []
    const queue = createMosaicImportQueue({
      manifestHash: 'hash-a', placements: makeManifest(6).placements,
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
      manifestHash: 'hash-a', placements: makeManifest(1).placements,
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

  it('pauses on disconnect and resumes after cursor validation', () => {
    let connected = false
    const queue = createMosaicImportQueue({
      manifestHash: 'hash-a', placements: makeManifest(1).placements, getExpectedPatchRevisions: () => ({ 'patch-a': 0 }),
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