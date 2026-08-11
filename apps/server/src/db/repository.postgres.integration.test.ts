import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import {
  canvases,
  patchMemberships,
  patches,
  patchVisibilityPolicies,
  principals,
  quilts,
} from './schema.js'
import {
  listQuiltOccupancy,
  loadPatchDeliverySnapshot,
  persistQuiltTilePlacement,
  persistQuiltTileRemoval,
  reconstructPatchState,
  savePatchSnapshot,
} from './repository.js'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'

const CANVAS_ID = '10000000-0000-4000-8000-000000000001'
const QUILT_ID = '20000000-0000-4000-8000-000000000001'
const PRINCIPAL_ID = '30000000-0000-4000-8000-000000000001'
const MEMBER_PRINCIPAL_ID = '30000000-0000-4000-8000-000000000002'
const PATCH_IDS = [
  'f0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
]

const placement = (
  tileId: string,
  operationId: string,
  x: number,
  expectedPatchRevisions: Record<string, number>,
) => persistQuiltTilePlacement({
  quiltId: QUILT_ID,
  operationId,
  principalId: PRINCIPAL_ID,
  expectedPatchRevisions,
  payload: {
    tileId,
    shape: 'square',
    color: '#abc',
    material: 'ceramic',
    transform: { position: { x, y: 5 }, rotation: 0 },
  },
})

const importedPlacement = (request: {
  operationId: string
  tile: Parameters<typeof persistQuiltTilePlacement>[0]['payload']
  expectedPatchRevisions: Record<string, number>
  principalId?: string
}) => persistQuiltTilePlacement({
  quiltId: QUILT_ID,
  operationId: request.operationId,
  principalId: request.principalId ?? PRINCIPAL_ID,
  expectedPatchRevisions: request.expectedPatchRevisions,
  payload: request.tile,
})

const revisions = (value: number, patchIds = PATCH_IDS): Record<string, number> =>
  Object.fromEntries(patchIds.map((patchId) => [patchId, value]))

const queryWithConnection = async <Row extends Record<string, unknown>>(
  database: PostgresTestDatabase,
  text: string,
  values?: unknown[],
): Promise<Row[]> => {
  const pool = database.createConnection()
  try {
    return (await pool.query<Row>(text, values)).rows
  } finally {
    await pool.end()
  }
}

describe('patch-scoped PostgreSQL placement', () => {
  let database: PostgresTestDatabase

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_repository')
    await database.db.insert(canvases).values({ id: CANVAS_ID })
    await database.db.insert(principals).values([
      { id: PRINCIPAL_ID, kind: 'human' },
      { id: MEMBER_PRINCIPAL_ID, kind: 'human' },
    ])
    await database.db.insert(quilts).values({
      id: QUILT_ID,
      legacyCanvasId: CANVAS_ID,
      patchRows: 1,
      patchColumns: 4,
      patchWidth: 10,
      patchHeight: 10,
      topology: 'toroidal',
      protocolVersion: 2,
    })
    await database.db.insert(patches).values(PATCH_IDS.map((id, column) => ({
      id,
      quiltId: QUILT_ID,
      row: 0,
      column,
      ownerPrincipalId: PRINCIPAL_ID,
      state: 'active',
    })))
    await database.db.insert(patchVisibilityPolicies).values(PATCH_IDS.map((patchId) => ({ patchId })))
  }, 30_000)

  afterAll(async () => database?.dispose(), 30_000)

  beforeEach(async () => {
    await queryWithConnection(database,
      'TRUNCATE authorization_audit_events, idempotency_keys, patch_operations, patch_snapshots, tile_spatial_refs, tiles CASCADE',
    )
    await queryWithConnection(database, 'TRUNCATE patch_memberships')
    await queryWithConnection(database, 'UPDATE patches SET revision = 0, owner_principal_id = $1', [PRINCIPAL_ID])
    await queryWithConnection(database, "UPDATE patch_visibility_policies SET aggregate_data = 'authenticated'")
  })

  it('summarizes authorized chunk occupancy without exposing hidden non-member patches', async () => {
    const tileId = '40000000-0000-4000-8000-000000000010'
    const result = await placement(tileId, randomUUID(), 5, revisions(0, [PATCH_IDS[0]]))
    expect(result.committed).toBe(true)

    await database.db.update(patchVisibilityPolicies)
      .set({ aggregateData: 'hidden' })
      .where(eq(patchVisibilityPolicies.patchId, PATCH_IDS[0]))

    await expect(listQuiltOccupancy(QUILT_ID, MEMBER_PRINCIPAL_ID)).resolves.toEqual({
      quiltId: QUILT_ID,
      chunks: [],
    })

    await database.db.insert(patchMemberships).values({
      patchId: PATCH_IDS[0],
      principalId: MEMBER_PRINCIPAL_ID,
      role: 'member',
    })

    await expect(listQuiltOccupancy(QUILT_ID, MEMBER_PRINCIPAL_ID)).resolves.toEqual({
      quiltId: QUILT_ID,
      chunks: [{ chunkId: '0:0', tileCount: 1 }],
    })
  })

  it('allows exactly one conflicting placement across the toroidal seam', async () => {
    const results = await Promise.all([
      placement('40000000-0000-4000-8000-000000000001', randomUUID(), 0.2, revisions(0, [PATCH_IDS[0], PATCH_IDS[3]])),
      placement('40000000-0000-4000-8000-000000000002', randomUUID(), 39.8, revisions(0, [PATCH_IDS[0], PATCH_IDS[3]])),
    ])

    expect(results.filter((result) => result.committed)).toHaveLength(1)
    const counts = await queryWithConnection<{ tiles: number; operations: number }>(database,
      'SELECT (SELECT count(*)::int FROM tiles) AS tiles, (SELECT count(*)::int FROM patch_operations) AS operations',
    )
    expect(counts[0]).toEqual({ tiles: 1, operations: 2 })
  })

  it('requires ownership of every patch touched by a seam placement', async () => {
    await database.db.update(patches)
      .set({ ownerPrincipalId: MEMBER_PRINCIPAL_ID })
      .where(eq(patches.id, PATCH_IDS[3]))

    const result = await placement(
      '40000000-0000-4000-8000-000000000018',
      randomUUID(),
      0.2,
      revisions(0, [PATCH_IDS[0], PATCH_IDS[3]]),
    )
    const counts = await queryWithConnection<{ tiles: number; refs: number; operations: number }>(database,
      'SELECT (SELECT count(*)::int FROM tiles) AS tiles, '
      + '(SELECT count(*)::int FROM tile_spatial_refs) AS refs, '
      + '(SELECT count(*)::int FROM patch_operations) AS operations',
    )

    expect(result).toEqual({ committed: false, reason: 'UNAUTHORIZED' })
    expect(counts[0]).toEqual({ tiles: 0, refs: 0, operations: 0 })
  })

  it('does not deadlock when address order is reversed from patch ID lock order', async () => {
    const current = await queryWithConnection<{ id: string; revision: number }>(database,
      'SELECT id, revision FROM patches ORDER BY id',
    )
    const expected = Object.fromEntries(current.map((patch) => [patch.id, patch.revision]))
    const outcome = await Promise.race([
      Promise.all([
        placement('40000000-0000-4000-8000-000000000003', randomUUID(), 9.8, expected),
        placement('40000000-0000-4000-8000-000000000004', randomUUID(), 10.2, expected),
      ]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('possible patch lock deadlock')), 5_000)),
    ])

    expect(outcome.filter((result) => result.committed)).toHaveLength(1)
  })

  it('returns an idempotent result without duplicating durable rows', async () => {
    const operationId = randomUUID()
    const tileId = '40000000-0000-4000-8000-000000000005'
    const current = await queryWithConnection<{ id: string; revision: number }>(database,
      'SELECT id, revision FROM patches',
    )
    const expected = Object.fromEntries(current.map((patch) => [patch.id, patch.revision]))

    const first = await placement(tileId, operationId, 25, expected)
    const retry = await placement(tileId, operationId, 25, expected)
    const counts = await queryWithConnection<{ tiles: number; refs: number; operations: number }>(database,
      'SELECT (SELECT count(*)::int FROM tiles WHERE id = $1) AS tiles, ' +
      '(SELECT count(*)::int FROM tile_spatial_refs WHERE tile_id = $1) AS refs, ' +
      '(SELECT count(*)::int FROM patch_operations WHERE operation_id = $2) AS operations',
      [tileId, operationId],
    )

    expect(first).toMatchObject({ committed: true, idempotent: false })
    expect(retry).toMatchObject({ committed: true, idempotent: true })
    expect(counts[0]).toEqual({ tiles: 1, refs: 1, operations: 1 })
  })

  it('persists import-shaped placements through canonical replay and snapshot state', async () => {
    const imported = [
      {
        operationId: randomUUID(),
        tile: {
          tileId: '40000000-0000-4000-8000-000000000019',
          shape: 'square' as const,
          color: '#abc',
          material: 'ceramic' as const,
          transform: { position: { x: 5, y: 5 }, rotation: 0 },
        },
        expectedPatchRevisions: { [PATCH_IDS[0]]: 0 },
      },
      {
        operationId: randomUUID(),
        tile: {
          tileId: '40000000-0000-4000-8000-000000000020',
          shape: 'square' as const,
          color: '#def',
          material: 'glass' as const,
          transform: { position: { x: 15, y: 5 }, rotation: 0 },
        },
        expectedPatchRevisions: { [PATCH_IDS[1]]: 0 },
      },
    ]

    const accepted = await Promise.all(imported.map(importedPlacement))
    const replay = await importedPlacement(imported[0])
    const unauthorized = await importedPlacement({
      ...imported[0],
      operationId: randomUUID(),
      principalId: MEMBER_PRINCIPAL_ID,
    })
    const stale = await importedPlacement({
      ...imported[0],
      operationId: randomUUID(),
    })
    const collision = await importedPlacement({
      ...imported[0],
      operationId: randomUUID(),
      expectedPatchRevisions: { [PATCH_IDS[0]]: 1 },
      tile: { ...imported[0].tile, tileId: '40000000-0000-4000-8000-000000000021' },
    })

    expect(accepted.every((result) => result.committed)).toBe(true)
    expect(replay).toMatchObject({ committed: true, idempotent: true, patchRevisions: { [PATCH_IDS[0]]: 1 } })
    expect(unauthorized).toEqual({ committed: false, reason: 'UNAUTHORIZED' })
    expect(stale).toEqual({ committed: false, reason: 'STALE_REVISION' })
    expect(collision).toEqual({ committed: false, reason: 'PLACEMENT_REJECTED' })

    const snapshot = await savePatchSnapshot(PATCH_IDS[0])
    const delivered = await loadPatchDeliverySnapshot(PATCH_IDS[0], { principalId: PRINCIPAL_ID })
    const reconstructed = await reconstructPatchState(PATCH_IDS[0])
    const counts = await queryWithConnection<{ tiles: number; refs: number; operations: number }>(database,
      'SELECT (SELECT count(*)::int FROM tiles) AS tiles, '
      + '(SELECT count(*)::int FROM tile_spatial_refs) AS refs, '
      + '(SELECT count(*)::int FROM patch_operations) AS operations',
    )

    expect(snapshot.tiles.map((tile) => tile.id)).toContain(imported[0].tile.tileId)
    expect(delivered.tiles.map((tile) => tile.id)).toEqual([imported[0].tile.tileId])
    expect(reconstructed.tiles.map((tile) => tile.id)).toEqual([imported[0].tile.tileId])
    expect(delivered.revision).toBe(1)
    expect(counts[0]).toEqual({ tiles: 2, refs: 2, operations: 2 })
  })

  it('binds placement replay to the actor and canonical command payload', async () => {
    const operationId = randomUUID()
    const tileId = '40000000-0000-4000-8000-000000000014'
    const command = {
      quiltId: QUILT_ID,
      operationId,
      principalId: PRINCIPAL_ID,
      expectedPatchRevisions: { [PATCH_IDS[2]]: 0 },
      payload: {
        tileId,
        shape: 'square' as const,
        color: '#abc',
        material: 'ceramic' as const,
        transform: { position: { x: 25, y: 5 }, rotation: 0 },
      },
    }

    await expect(persistQuiltTilePlacement(command)).resolves.toMatchObject({ committed: true, idempotent: false })
    await expect(persistQuiltTilePlacement({
      ...command,
      principalId: MEMBER_PRINCIPAL_ID,
    })).resolves.toEqual({ committed: false, reason: 'UNAUTHORIZED' })
    await expect(persistQuiltTilePlacement({
      ...command,
      payload: { ...command.payload, color: '#def' },
    })).resolves.toEqual({ committed: false, reason: 'PLACEMENT_REJECTED' })
  })

  it('returns immutable committed placement revisions after later writes', async () => {
    const operationId = randomUUID()
    const tileId = '40000000-0000-4000-8000-000000000015'
    const expectedPatchRevisions = { [PATCH_IDS[2]]: 0 }
    const first = await placement(tileId, operationId, 25, expectedPatchRevisions)
    await placement('40000000-0000-4000-8000-000000000016', randomUUID(), 28, { [PATCH_IDS[2]]: 1 })
    const retry = await placement(tileId, operationId, 25, expectedPatchRevisions)

    expect(first).toMatchObject({ committed: true, idempotent: false, patchRevisions: { [PATCH_IDS[2]]: 1 } })
    expect(retry).toEqual({ ...first, idempotent: true })
  })

  it('allows a distant patch write while an unrelated patch row is locked', async () => {
    const blocker = database.createConnection()
    const client = await blocker.connect()
    await client.query('BEGIN')
    await client.query('SELECT id FROM patches WHERE id = $1 FOR UPDATE', [PATCH_IDS[0]])
    const current = await queryWithConnection<{ id: string; revision: number }>(database,
      'SELECT id, revision FROM patches',
    )
    const expected = Object.fromEntries(current.map((patch) => [patch.id, patch.revision]))

    try {
      const result = await Promise.race([
        placement('40000000-0000-4000-8000-000000000006', randomUUID(), 25, expected),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('distant write waited on unrelated patch')), 2_000)),
      ])
      expect(result.committed).toBe(true)
    } finally {
      await client.query('ROLLBACK')
      client.release()
      await blocker.end()
    }
  })

  it('persists no partial state for unauthorized or stale writes', async () => {
    const unauthorized = await persistQuiltTilePlacement({
      quiltId: QUILT_ID,
      operationId: randomUUID(),
      principalId: MEMBER_PRINCIPAL_ID,
      expectedPatchRevisions: { [PATCH_IDS[1]]: 0 },
      payload: {
        tileId: '40000000-0000-4000-8000-000000000007',
        shape: 'square',
        color: '#def',
        material: 'glass',
        transform: { position: { x: 15, y: 5 }, rotation: 0 },
      },
    })
    const stale = await placement(
      '40000000-0000-4000-8000-000000000008',
      randomUUID(),
      25,
      { [PATCH_IDS[2]]: -1 },
    )
    const counts = await queryWithConnection<{ tiles: number; refs: number; operations: number }>(database,
      'SELECT (SELECT count(*)::int FROM tiles) AS tiles, ' +
      '(SELECT count(*)::int FROM tile_spatial_refs) AS refs, ' +
      '(SELECT count(*)::int FROM patch_operations) AS operations',
    )

    expect(unauthorized).toEqual({ committed: false, reason: 'UNAUTHORIZED' })
    expect(stale).toEqual({ committed: false, reason: 'STALE_REVISION' })
    expect(counts[0]).toEqual({ tiles: 0, refs: 0, operations: 0 })
  })

  it('denies member roles and requires persisted patch ownership', async () => {
    await database.db.update(patches).set({ ownerPrincipalId: null }).where(eq(patches.id, PATCH_IDS[1]))
    await database.db.insert(patchMemberships).values({
      patchId: PATCH_IDS[1],
      principalId: MEMBER_PRINCIPAL_ID,
      role: 'member',
    })

    const memberResult = await persistQuiltTilePlacement({
      quiltId: QUILT_ID,
      operationId: randomUUID(),
      principalId: MEMBER_PRINCIPAL_ID,
      expectedPatchRevisions: { [PATCH_IDS[1]]: 0 },
      payload: {
        tileId: '40000000-0000-4000-8000-000000000009',
        shape: 'square',
        color: '#123',
        material: 'stone',
        transform: { position: { x: 15, y: 5 }, rotation: 0 },
      },
    })
    await database.db.update(patchMemberships).set({ role: 'owner' }).where(and(
      eq(patchMemberships.patchId, PATCH_IDS[1]),
      eq(patchMemberships.principalId, MEMBER_PRINCIPAL_ID),
    ))
    const delegatedResult = await persistQuiltTilePlacement({
      quiltId: QUILT_ID,
      operationId: randomUUID(),
      principalId: MEMBER_PRINCIPAL_ID,
      expectedPatchRevisions: { [PATCH_IDS[1]]: 0 },
      payload: {
        tileId: '40000000-0000-4000-8000-000000000010',
        shape: 'square',
        color: '#456',
        material: 'glass',
        transform: { position: { x: 15, y: 5 }, rotation: 0 },
      },
    })
    await database.db.update(patches).set({ ownerPrincipalId: MEMBER_PRINCIPAL_ID }).where(eq(patches.id, PATCH_IDS[1]))
    const ownerResult = await persistQuiltTilePlacement({
      quiltId: QUILT_ID,
      operationId: randomUUID(),
      principalId: MEMBER_PRINCIPAL_ID,
      expectedPatchRevisions: { [PATCH_IDS[1]]: 0 },
      payload: {
        tileId: '40000000-0000-4000-8000-000000000011',
        shape: 'square',
        color: '#789',
        material: 'ceramic',
        transform: { position: { x: 15, y: 5 }, rotation: 0 },
      },
    })

    expect(memberResult).toEqual({ committed: false, reason: 'UNAUTHORIZED' })
    expect(delegatedResult).toEqual({ committed: false, reason: 'UNAUTHORIZED' })
    expect(ownerResult).toMatchObject({ committed: true, idempotent: false })
  })

  it('removes an owned tile durably and replays the committed result idempotently', async () => {
    const tileId = '40000000-0000-4000-8000-000000000012'
    const placed = await placement(tileId, randomUUID(), 15, { [PATCH_IDS[1]]: 0 })
    expect(placed).toMatchObject({ committed: true, patchRevisions: { [PATCH_IDS[1]]: 1 } })
    const operationId = randomUUID()
    const removal = {
      quiltId: QUILT_ID,
      operationId,
      principalId: PRINCIPAL_ID,
      expectedPatchRevisions: { [PATCH_IDS[1]]: 1 },
      tileId,
    }

    const first = await persistQuiltTileRemoval(removal)
    await placement('40000000-0000-4000-8000-000000000017', randomUUID(), 15, { [PATCH_IDS[1]]: 2 })
    const retry = await persistQuiltTileRemoval(removal)
    const crossPrincipalRetry = await persistQuiltTileRemoval({
      ...removal,
      principalId: MEMBER_PRINCIPAL_ID,
    })
    const mismatchedRetry = await persistQuiltTileRemoval({
      ...removal,
      tileId: '40000000-0000-4000-8000-000000000099',
    })
    const counts = await queryWithConnection<{ tiles: number; refs: number; removals: number; audits: number }>(database,
      'SELECT (SELECT count(*)::int FROM tiles WHERE id = $1) AS tiles, ' +
      '(SELECT count(*)::int FROM tile_spatial_refs WHERE tile_id = $1) AS refs, ' +
      "(SELECT count(*)::int FROM patch_operations WHERE operation_id = $2 AND op_type = 'tile_removed') AS removals, " +
      "(SELECT count(*)::int FROM authorization_audit_events WHERE operation_id = $2 AND event_type = 'quilt_tile_removed') AS audits",
      [tileId, operationId],
    )

    expect(first).toMatchObject({ committed: true, idempotent: false, patchRevisions: { [PATCH_IDS[1]]: 2 } })
    expect(retry).toEqual({ ...first, idempotent: true })
    expect(crossPrincipalRetry).toEqual({ committed: false, reason: 'RESOURCE_UNAVAILABLE' })
    expect(mismatchedRetry).toEqual({ committed: false, reason: 'RESOURCE_UNAVAILABLE' })
    expect(counts[0]).toEqual({ tiles: 0, refs: 0, removals: 1, audits: 1 })
  })

  it('rolls back removal for non-owners and stale revisions', async () => {
    const tileId = '40000000-0000-4000-8000-000000000013'
    await placement(tileId, randomUUID(), 15, { [PATCH_IDS[1]]: 0 })
    const denied = await persistQuiltTileRemoval({
      quiltId: QUILT_ID,
      operationId: randomUUID(),
      principalId: MEMBER_PRINCIPAL_ID,
      expectedPatchRevisions: { [PATCH_IDS[1]]: 1 },
      tileId,
    })
    const stale = await persistQuiltTileRemoval({
      quiltId: QUILT_ID,
      operationId: randomUUID(),
      principalId: PRINCIPAL_ID,
      expectedPatchRevisions: { [PATCH_IDS[1]]: 0 },
      tileId,
    })
    const [tileCount] = await queryWithConnection<{ count: number }>(database,
      'SELECT count(*)::int AS count FROM tiles WHERE id = $1',
      [tileId],
    )

    expect(denied).toEqual({ committed: false, reason: 'UNAUTHORIZED' })
    expect(stale).toEqual({ committed: false, reason: 'STALE_REVISION' })
    expect(tileCount.count).toBe(1)
  })
})