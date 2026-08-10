import { describe, expect, it } from 'vitest'
import { filterAlexanderManifestForDeployment, selectAlexanderOwnedPatch } from './alexanderPatchPlacement'

const descriptor = {
  quiltId: 'quilt-a',
  legacyCanvasId: 'canvas-a',
  topology: 'toroidal' as const,
  protocolVersion: 2 as const,
  patchRows: 5,
  patchColumns: 5,
  patchWidth: 10,
  patchHeight: 20,
  originX: 100,
  originY: 200,
  generation: 1,
  entryAttemptId: 'entry-a',
  initialPatch: { id: 'patch-initial', row: 0, column: 0 },
  assignedPatch: { id: 'patch-owned', row: 2, column: 3 },
}

describe('selectAlexanderOwnedPatch', () => {
  it('binds only the assigned patch using its exact world rectangle', () => {
    expect(selectAlexanderOwnedPatch(descriptor, { x: 135, y: 250 })).toEqual({
      targetRect: { minX: 130, maxX: 140, minY: 240, maxY: 260 },
      sourceToWorld: { origin: { x: 130, y: 240 }, scale: { x: 10, y: 20 } },
    })
    expect(selectAlexanderOwnedPatch(descriptor, { x: 140, y: 250 })).toBeUndefined()
    expect(selectAlexanderOwnedPatch(descriptor, { x: 125, y: 250 })).toBeUndefined()
  })

  it('accepts wrapped toroidal coordinates that map to the assigned patch', () => {
    const atlasWidth = descriptor.patchColumns * descriptor.patchWidth
    const atlasHeight = descriptor.patchRows * descriptor.patchHeight

    expect(selectAlexanderOwnedPatch(descriptor, {
      x: 135 + atlasWidth,
      y: 250 + atlasHeight,
    })).toEqual({
      targetRect: { minX: 130, maxX: 140, minY: 240, maxY: 260 },
      sourceToWorld: { origin: { x: 130, y: 240 }, scale: { x: 10, y: 20 } },
    })
  })
})

describe('filterAlexanderManifestForDeployment', () => {
  it('drops placements whose transformed footprint would exceed deployment bounds', () => {
    const filtered = filterAlexanderManifestForDeployment({
      schemaVersion: 2,
      source: {
        imageId: 'alexander-mosaic-primary',
        sourceSha256: 'source',
        dimensions: { width: 1077, height: 1616 },
      },
      coordinateSpace: 'source-local-normalized-x-y',
      geometry: { shape: 'square', material: 'ceramic', rotation: 0, mirrored: false },
      budget: { placementBudget: 3, accepted: 3 },
      policy: { ordering: 'score-descending-then-candidate-id-ascending', conflict: 'skip-and-record', outOfBounds: 'skip-and-record' },
      provenance: { manifestSha256: 'old-hash', requiredDeploymentFields: {} },
      placements: [
        {
          id: 'inside',
          source: { candidateId: 'c-1', rank: 1, normalizedAnchor: { x: 0.5, y: 0.5 } },
          tile: { shape: 'square', material: 'ceramic', color: '#abc', rotation: 0, mirrored: false },
        },
        {
          id: 'outside-right',
          source: { candidateId: 'c-2', rank: 2, normalizedAnchor: { x: 1, y: 0.5 } },
          tile: { shape: 'square', material: 'ceramic', color: '#def', rotation: 0, mirrored: false },
        },
      ],
    }, {
      targetRect: { minX: 130, maxX: 140, minY: 240, maxY: 260 },
      sourceToWorld: { origin: { x: 130, y: 240 }, scale: { x: 10, y: 20 } },
    })

    expect(filtered.placements).toHaveLength(1)
    expect(filtered.placements[0].id).toBe('inside')
    expect(filtered.budget).toEqual({ placementBudget: 1, accepted: 1 })
    expect(filtered.provenance.manifestSha256).toBe('')
  })
})