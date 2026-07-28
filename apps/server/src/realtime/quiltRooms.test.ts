import { describe, expect, it } from 'vitest'
import type { QuiltProtocolLimits, QuiltTopologyHandshake } from '../contracts.js'
import { resolveQuiltRooms, type PatchRoomAccess, type QuiltRoomResolutionContext } from './quiltRooms.js'

const topology: QuiltTopologyHandshake = {
  quiltId: 'quilt-1',
  topology: 'toroidal',
  patchRows: 2,
  patchColumns: 3,
  patchWidth: 31.2,
  patchHeight: 20.4,
}

const limits: QuiltProtocolLimits = {
  maxRoomsPerConnection: 4,
  maxRoomsPerRequest: 4,
  maxChunksPerRequest: 3,
  maxRoomChurnPerMinute: 6,
  maxSnapshotTiles: 100,
  maxPayloadBytes: 64 * 1024,
  source: 'canary-default',
}

const access = (overrides: Partial<PatchRoomAccess> = {}): PatchRoomAccess => ({
  patchId: 'patch-0-0',
  state: 'active',
  publishesExistence: true,
  publicFine: false,
  publicAggregate: true,
  principalFine: true,
  principalAggregate: true,
  principalPresence: true,
  principalEvents: true,
  ...overrides,
})

const context = (overrides: Partial<QuiltRoomResolutionContext> = {}): QuiltRoomResolutionContext => ({
  topology,
  principalId: 'principal-1',
  currentRoomIds: new Set(),
  churnInWindow: 0,
  accessByAddress: new Map([['0:0', access()]]),
  limits,
  ...overrides,
})

describe('resolveQuiltRooms', () => {
  it('canonicalizes wrapped addresses and deduplicates canonical rooms', () => {
    const result = resolveQuiltRooms([
      { requestId: 'a', kind: 'fine', row: 0, column: 0, chunkIds: ['0:0'] },
      { requestId: 'b', kind: 'fine', row: 2, column: -3, chunkIds: ['1:0'] },
    ], context())

    expect(result.outcomes).toEqual([
      { requestId: 'a', status: 'accepted', canonicalRoomId: 'quilt:quilt-1:patch:0:0:fine' },
      { requestId: 'b', status: 'accepted', canonicalRoomId: 'quilt:quilt-1:patch:0:0:fine' },
    ])
    expect(result.accepted).toHaveLength(1)
    expect(result.accepted[0]?.chunkIds).toEqual(['0:0', '1:0'])
  })

  it('applies public, principal, presence, event, and lifecycle visibility consistently', () => {
    const anonymous = resolveQuiltRooms([
      { requestId: 'fine', kind: 'fine', row: 0, column: 0, chunkIds: ['0:0'] },
      { requestId: 'aggregate', kind: 'aggregate', row: 0, column: 0, chunkIds: ['0:0'] },
      { requestId: 'presence', kind: 'presence', row: 0, column: 0 },
      { requestId: 'events', kind: 'events', row: 0, column: 0, chunkIds: ['0:0'] },
    ], context({ principalId: undefined }))

    expect(anonymous.outcomes.map((outcome) => outcome.status)).toEqual([
      'forbidden',
      'accepted',
      'forbidden',
      'forbidden',
    ])

    const deleted = resolveQuiltRooms([
      { requestId: 'aggregate', kind: 'aggregate', row: 0, column: 0, chunkIds: ['0:0'] },
    ], context({ accessByAddress: new Map([['0:0', access({ state: 'deleted' })]]) }))
    expect(deleted.outcomes[0]?.status).toBe('forbidden')
  })

  it('returns explicit invalid, forbidden, and budget outcomes', () => {
    const result = resolveQuiltRooms([
      { requestId: 'invalid', kind: 'fine', row: 0.5, column: 0 },
      { requestId: 'forbidden', kind: 'fine', row: 0, column: 1, chunkIds: ['0:0'] },
      { requestId: 'chunks', kind: 'fine', row: 0, column: 0, chunkIds: ['0:0', '1:0', '2:0', '3:0'] },
      { requestId: 'accepted', kind: 'fine', row: 0, column: 0, chunkIds: ['0:0'] },
      { requestId: 'request-limit', kind: 'aggregate', row: 0, column: 0, chunkIds: ['0:0'] },
    ], context())

    expect(result.outcomes.map((outcome) => outcome.status)).toEqual([
      'invalid',
      'forbidden',
      'budget-exceeded',
      'accepted',
      'budget-exceeded',
    ])
  })

  it('enforces connection and churn budgets only for new canonical rooms', () => {
    const existing = new Set(['quilt:quilt-1:patch:0:0:fine'])
    const existingResult = resolveQuiltRooms([
      { requestId: 'existing', kind: 'fine', row: 0, column: 0, chunkIds: ['0:0'] },
    ], context({ currentRoomIds: existing, churnInWindow: limits.maxRoomChurnPerMinute }))
    expect(existingResult.outcomes[0]?.status).toBe('accepted')

    const churnResult = resolveQuiltRooms([
      { requestId: 'new', kind: 'aggregate', row: 0, column: 0, chunkIds: ['0:0'] },
    ], context({ churnInWindow: limits.maxRoomChurnPerMinute }))
    expect(churnResult.outcomes[0]).toMatchObject({ status: 'budget-exceeded', reason: 'ROOM_CHURN' })
  })
})