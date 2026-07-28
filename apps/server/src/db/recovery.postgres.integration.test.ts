import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { canvases, patches, principals, quilts } from './schema.js'
import {
  loadPatchDeliverySnapshot,
  persistQuiltTilePlacement,
  pruneRetention,
  reconstructPatchState,
  savePatchSnapshot,
} from './repository.js'
import { configureQuiltTelemetry } from '../migration/quiltTelemetry.js'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'

const CANVAS_ID = '50000000-0000-4000-8000-000000000001'
const QUILT_ID = '60000000-0000-4000-8000-000000000001'
const PRINCIPAL_ID = '70000000-0000-4000-8000-000000000001'
const ACTIVE_PATCH_ID = '80000000-0000-4000-8000-000000000001'
const QUIET_PATCH_ID = '80000000-0000-4000-8000-000000000002'

describe('authoritative patch recovery with retention', () => {
  let database: PostgresTestDatabase

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_recovery')
    await database.db.insert(canvases).values({ id: CANVAS_ID })
    await database.db.insert(principals).values({ id: PRINCIPAL_ID, kind: 'human' })
    await database.db.insert(quilts).values({
      id: QUILT_ID,
      legacyCanvasId: CANVAS_ID,
      patchRows: 1,
      patchColumns: 2,
      patchWidth: 10,
      patchHeight: 10,
      topology: 'toroidal',
      protocolVersion: 2,
    })
    await database.db.insert(patches).values([
      {
        id: ACTIVE_PATCH_ID,
        quiltId: QUILT_ID,
        row: 0,
        column: 0,
        ownerPrincipalId: PRINCIPAL_ID,
        state: 'active',
      },
      {
        id: QUIET_PATCH_ID,
        quiltId: QUILT_ID,
        row: 0,
        column: 1,
        ownerPrincipalId: PRINCIPAL_ID,
        state: 'active',
      },
    ])
    const active = await persistQuiltTilePlacement({
      quiltId: QUILT_ID,
      operationId: randomUUID(),
      principalId: PRINCIPAL_ID,
      expectedPatchRevisions: { [ACTIVE_PATCH_ID]: 0 },
      payload: {
        tileId: '90000000-0000-4000-8000-000000000001',
        shape: 'square',
        color: '#123',
        material: 'stone',
        transform: { position: { x: 5, y: 5 }, rotation: 0 },
      },
      createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
    })
    const quiet = await persistQuiltTilePlacement({
      quiltId: QUILT_ID,
      operationId: randomUUID(),
      principalId: PRINCIPAL_ID,
      expectedPatchRevisions: { [QUIET_PATCH_ID]: 0 },
      payload: {
        tileId: '90000000-0000-4000-8000-000000000002',
        shape: 'square',
        color: '#456',
        material: 'glass',
        transform: { position: { x: 15, y: 5 }, rotation: 0 },
      },
      createdAt: Date.now() - 40 * 24 * 60 * 60 * 1000,
    })
    expect(active.committed).toBe(true)
    expect(quiet.committed).toBe(true)
    await savePatchSnapshot(ACTIVE_PATCH_ID)
    await savePatchSnapshot(QUIET_PATCH_ID)
    const pool = database.createConnection()
    await pool.query("UPDATE patch_snapshots SET created_at = now() - interval '40 days' WHERE patch_id = $1", [QUIET_PATCH_ID])
    await pool.end()
  }, 30_000)

  afterAll(async () => database?.dispose(), 30_000)

  it('reconstructs current state before retention', async () => {
    const active = await reconstructPatchState(ACTIVE_PATCH_ID)
    const quiet = await reconstructPatchState(QUIET_PATCH_ID)

    expect(active.tiles.map((tile) => tile.id)).toEqual(['90000000-0000-4000-8000-000000000001'])
    expect(quiet.tiles.map((tile) => tile.id)).toEqual(['90000000-0000-4000-8000-000000000002'])
  })

  it('reconstructs from authoritative rows after operation history expires', async () => {
    await pruneRetention({
      operationCutoffMs: 7 * 24 * 60 * 60 * 1000,
      snapshotCutoffMs: 30 * 24 * 60 * 60 * 1000,
    })

    const active = await reconstructPatchState(ACTIVE_PATCH_ID)
    expect(active.tiles.map((tile) => tile.id)).toEqual(['90000000-0000-4000-8000-000000000001'])
  })

  it('does not reconstruct a quiet patch as empty after its snapshot is pruned', async () => {
    await pruneRetention({
      operationCutoffMs: 7 * 24 * 60 * 60 * 1000,
      snapshotCutoffMs: 30 * 24 * 60 * 60 * 1000,
    })

    const quiet = await reconstructPatchState(QUIET_PATCH_ID)
    const pool = database.createConnection()
    const counts = await pool.query(
      'SELECT (SELECT count(*)::int FROM patch_snapshots WHERE patch_id = $1) AS snapshots, ' +
      '(SELECT count(*)::int FROM patch_operations WHERE patch_id = $1) AS operations',
      [QUIET_PATCH_ID],
    )
    await pool.end()

    expect(counts.rows[0]).toEqual({ snapshots: 0, operations: 0 })
    expect(quiet.tiles.map((tile) => tile.id)).toEqual(['90000000-0000-4000-8000-000000000002'])
  })

  it('falls back to legacy canvas rows when a bounded compatibility patch diverges', async () => {
    const pool = database.createConnection()
    await pool.query('DELETE FROM tile_spatial_refs')
    await pool.query(
      'UPDATE tiles SET anchor_patch_id = $1 WHERE canvas_id = $2',
      [ACTIVE_PATCH_ID, CANVAS_ID],
    )
    await pool.query('DELETE FROM patches WHERE id = $1', [QUIET_PATCH_ID])
    await pool.query(
      `UPDATE quilts
       SET patch_rows = 1, patch_columns = 1, patch_width = 20, patch_height = 10, topology = 'bounded'
       WHERE id = $1`,
      [QUILT_ID],
    )
    await pool.end()

    const observer = vi.fn()
    configureQuiltTelemetry(observer)
    try {
      const snapshot = await loadPatchDeliverySnapshot(ACTIVE_PATCH_ID, { canary: true })
      expect(snapshot.tiles.map((tile) => tile.id).sort()).toEqual([
        '90000000-0000-4000-8000-000000000001',
        '90000000-0000-4000-8000-000000000002',
      ])
      expect(observer).toHaveBeenCalledWith(expect.objectContaining({
        name: 'dual_read_parity',
        canary: true,
        dimensions: { matched: false, readPath: 'legacy-patch' },
      }))
    } finally {
      configureQuiltTelemetry()
    }
  })
})