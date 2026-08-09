import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RESIDENT_CREATIVE_MEMORY_DELETION_SCOPE,
  DEFAULT_RESIDENT_CREATIVE_MEMORY_RETENTION_TIER,
  DEFAULT_RESIDENT_CREATIVE_MEMORY_TRANSPORT_BOUNDARIES,
  QUILT_PROTOCOL_VERSION,
  RESIDENT_SCHEMA_VERSION,
  SENSITIVE_MEMORY_POLICY,
  SCHEMA_VERSION,
  defaultCreativeMemoryPolicy,
  isResidentEventEnvelope,
  isResidentMemoryPolicy,
  type CanonicalWorldDescriptor,
} from './contracts.js'

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

describe('resident memory policy contract', () => {
  it('accepts creative memory policy with explicit non-client transport boundaries', () => {
    expect(isResidentMemoryPolicy({
      classification: 'creative',
      persistence: 'allowed',
      retentionTier: 'short_lived',
      deletionScope: 'principal',
      transport: 'server_control_plane',
    })).toBe(true)
  })

  it('rejects sensitive memory persistence', () => {
    expect(isResidentMemoryPolicy({
      classification: 'sensitive',
      persistence: 'allowed',
      retentionTier: 'short_lived',
      deletionScope: 'principal',
      transport: 'server_control_plane',
    })).toBe(false)
  })

  it('keeps sensitive data non-retained with no exceptions', () => {
    expect(SENSITIVE_MEMORY_POLICY).toEqual({
      classification: 'sensitive',
      persistence: 'forbidden',
      retentionTier: 'ephemeral',
      deletionScope: 'record',
      transport: 'runtime_internal',
    })
    expect(isResidentMemoryPolicy(SENSITIVE_MEMORY_POLICY)).toBe(true)
  })

  it('uses the selected creative-memory defaults', () => {
    expect(DEFAULT_RESIDENT_CREATIVE_MEMORY_RETENTION_TIER).toBe('short_lived')
    expect(DEFAULT_RESIDENT_CREATIVE_MEMORY_DELETION_SCOPE).toBe('principal')
    expect(DEFAULT_RESIDENT_CREATIVE_MEMORY_TRANSPORT_BOUNDARIES).toEqual([
      'runtime_internal',
      'server_control_plane',
    ])
    expect(defaultCreativeMemoryPolicy()).toEqual({
      classification: 'creative',
      persistence: 'allowed',
      retentionTier: 'short_lived',
      deletionScope: 'principal',
      transport: 'server_control_plane',
    })
  })
})

describe('resident event envelope contract', () => {
  it('accepts known resident runtime events', () => {
    expect(isResidentEventEnvelope({
      schemaVersion: RESIDENT_SCHEMA_VERSION,
      eventType: 'worker_trigger_claimed',
      occurredAt: '2026-08-09T00:00:00.000Z',
      quiltId: '10000000-0000-4000-8000-000000000001',
      runId: '20000000-0000-4000-8000-000000000001',
      triggerId: '30000000-0000-4000-8000-000000000001',
      payload: { source: 'test' },
    })).toBe(true)
  })

  it('rejects unknown event types', () => {
    expect(isResidentEventEnvelope({
      schemaVersion: RESIDENT_SCHEMA_VERSION,
      eventType: 'resident_mark_recorded',
      occurredAt: '2026-08-09T00:00:00.000Z',
      quiltId: '10000000-0000-4000-8000-000000000001',
    })).toBe(false)
  })
})