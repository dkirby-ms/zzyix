import { describe, expect, it } from 'vitest'
import { QUILT_PROTOCOL_VERSION, SCHEMA_VERSION, type CanonicalWorldDescriptor } from './contracts.js'

describe('shared contract version', () => {
  it('identifies the protocol-v2 contract generation', () => {
    expect(SCHEMA_VERSION).toBe('2.0.0')
    expect(QUILT_PROTOCOL_VERSION).toBe(2)
  })
})

describe('canonical world descriptor', () => {
  it('serializes the stable compatibility and initial-patch fields', () => {
    const descriptor: CanonicalWorldDescriptor = {
      quiltId: '10000000-0000-4000-8000-000000000001',
      legacyCanvasId: '20000000-0000-4000-8000-000000000001',
      topology: 'toroidal',
      protocolVersion: 2,
      patchRows: 32,
      patchColumns: 32,
      patchWidth: 31.2,
      patchHeight: 20.4,
      originX: 0,
      originY: 0,
      generation: 2,
      initialPatch: { id: '30000000-0000-4000-8000-000000000001', row: 0, column: 0 },
    }

    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor)
  })
})