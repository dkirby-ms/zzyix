import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { canvases, patches, patchVisibilityPolicies, principals, quilts, tileSpatialRefs, tiles } from './schema.js'
import {
  createProtectedSession,
  loadPatchDeliverySnapshot,
  listSessionSummaries,
  persistQuiltTilePlacement,
  pruneRetention,
  reconstructPatchState,
  savePatchSnapshot,
  ResourceNotFoundError,
} from './repository.js'
import { configureQuiltTelemetry } from '../migration/quiltTelemetry.js'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'

const CANVAS_ID = '50000000-0000-4000-8000-000000000001'
const QUILT_ID = '60000000-0000-4000-8000-000000000001'
const PRINCIPAL_ID = '70000000-0000-4000-8000-000000000001'
const NON_MEMBER_PRINCIPAL_ID = '70000000-0000-4000-8000-000000000002'
const ACTIVE_PATCH_ID = '80000000-0000-4000-8000-000000000001'
const QUIET_PATCH_ID = '80000000-0000-4000-8000-000000000002'

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

describe('authoritative patch recovery with retention', () => {
  let database: PostgresTestDatabase

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_recovery')
    await database.db.insert(canvases).values({ id: CANVAS_ID })
    await database.db.insert(principals).values([
      { id: PRINCIPAL_ID, kind: 'human' },
      { id: NON_MEMBER_PRINCIPAL_ID, kind: 'human' },
    ])
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
    await database.db.insert(patchVisibilityPolicies).values([
      { patchId: ACTIVE_PATCH_ID },
      { patchId: QUIET_PATCH_ID },
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

  it('scopes patch delivery by accepted chunks while preserving canonical tile deduplication', async () => {
    const tileId = '90000000-0000-4000-8000-000000000001'
    await database.db.insert(tileSpatialRefs).values({
      tileId,
      patchId: ACTIVE_PATCH_ID,
      chunkX: 1,
      chunkY: 0,
    })

    const snapshot = await loadPatchDeliverySnapshot(ACTIVE_PATCH_ID, {
      principalId: PRINCIPAL_ID,
      chunkIds: ['0:0', '1:0'],
    })

    expect(snapshot.tiles.map((tile) => tile.id)).toEqual([tileId])
    expect(snapshot.tilesByChunk['0:0']?.map((tile) => tile.id)).toEqual([tileId])
    expect(snapshot.tilesByChunk['1:0']?.map((tile) => tile.id)).toEqual([tileId])
  })

  it('makes hidden and unknown patch delivery indistinguishable', async () => {
    await database.db
      .update(patchVisibilityPolicies)
      .set({ fineData: 'hidden' })
      .where(eq(patchVisibilityPolicies.patchId, ACTIVE_PATCH_ID))

    const hidden = loadPatchDeliverySnapshot(ACTIVE_PATCH_ID, { principalId: NON_MEMBER_PRINCIPAL_ID })
    const unknown = loadPatchDeliverySnapshot('80000000-0000-4000-8000-000000000099', {
      principalId: NON_MEMBER_PRINCIPAL_ID,
    })

    await expect(hidden).rejects.toBeInstanceOf(ResourceNotFoundError)
    await expect(unknown).rejects.toBeInstanceOf(ResourceNotFoundError)

    await database.db
      .update(patchVisibilityPolicies)
      .set({ fineData: 'authenticated' })
      .where(eq(patchVisibilityPolicies.patchId, ACTIVE_PATCH_ID))
  })

  it('filters hidden catalog entries while retaining owner visibility', async () => {
    await database.db
      .update(patchVisibilityPolicies)
      .set({ existence: 'hidden' })
      .where(eq(patchVisibilityPolicies.patchId, ACTIVE_PATCH_ID))
    await database.db
      .update(patchVisibilityPolicies)
      .set({ existence: 'hidden' })
      .where(eq(patchVisibilityPolicies.patchId, QUIET_PATCH_ID))

    await expect(listSessionSummaries(NON_MEMBER_PRINCIPAL_ID)).resolves.toEqual([])
    await expect(listSessionSummaries(PRINCIPAL_ID)).resolves.toMatchObject([{ id: CANVAS_ID }])

    await database.db
      .update(patchVisibilityPolicies)
      .set({ existence: 'authenticated' })
      .where(eq(patchVisibilityPolicies.patchId, ACTIVE_PATCH_ID))
    await database.db
      .update(patchVisibilityPolicies)
      .set({ existence: 'authenticated' })
      .where(eq(patchVisibilityPolicies.patchId, QUIET_PATCH_ID))
  })

  it('creates new sessions with an unclaimed authenticated policy and mutation disabled', async () => {
    const sessionId = randomUUID()
    await createProtectedSession(sessionId, {
      canvasSize: { width: 10.4, height: 6.8 },
      boundsPolicy: {
        mode: 'bounded',
        bounds: { minX: -5.2, maxX: 5.2, minY: -3.4, maxY: 3.4 },
      },
    })

    const rows = await queryWithConnection<{
      state: string
      ownerPrincipalId: string | null
      existence: string
      fineData: string
      claimEnabled: boolean
    }>(database, `
      SELECT
        p.state,
        p.owner_principal_id AS "ownerPrincipalId",
        v.existence,
        v.fine_data AS "fineData",
        v.claim_enabled AS "claimEnabled"
      FROM quilts q
      JOIN patches p ON p.quilt_id = q.id
      JOIN patch_visibility_policies v ON v.patch_id = p.id
      WHERE q.legacy_canvas_id = $1
    `, [sessionId])

    expect(rows).toEqual([{
      state: 'unclaimed',
      ownerPrincipalId: null,
      existence: 'authenticated',
      fineData: 'authenticated',
      claimEnabled: false,
    }])
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

  it('returns revision, authoritative tiles, and event cursor from one PostgreSQL snapshot', async () => {
    const pendingTileId = '90000000-0000-4000-8000-000000000003'
    await database.db.insert(tiles).values({
      id: pendingTileId,
      canvasId: CANVAS_ID,
      quiltId: QUILT_ID,
      anchorPatchId: ACTIVE_PATCH_ID,
      shape: 'square',
      color: '#789',
      material: 'ceramic',
      posX: 6,
      posY: 5,
      chunkX: 0,
      chunkY: 0,
      rotation: 0,
      mirrored: false,
    })
    const blockerPool = database.createConnection()
    const blocker = await blockerPool.connect()
    let blockerCommitted = false
    await blocker.query('BEGIN')
    await blocker.query('LOCK TABLE quilts IN ACCESS EXCLUSIVE MODE')

    try {
      const snapshotPromise = loadPatchDeliverySnapshot(ACTIVE_PATCH_ID, { principalId: PRINCIPAL_ID })
      await expect.poll(async () => {
        const rows = await queryWithConnection<{ waiting: boolean }>(database,
          `SELECT EXISTS (
             SELECT 1
             FROM pg_stat_activity
             WHERE datname = current_database()
               AND wait_event_type = 'Lock'
               AND pid <> pg_backend_pid()
               AND query ILIKE '%quilts%'
           ) AS waiting`,
        )
        return rows[0]?.waiting
      }).toBe(true)

      const writer = database.createConnection()
      await writer.query('BEGIN')
      await writer.query(
        'INSERT INTO tile_spatial_refs (tile_id, patch_id, chunk_x, chunk_y) VALUES ($1, $2, 0, 0)',
        [pendingTileId, ACTIVE_PATCH_ID],
      )
      await writer.query('UPDATE patches SET revision = revision + 1 WHERE id = $1', [ACTIVE_PATCH_ID])
      const inserted = await writer.query<{ event_id: string }>(
        `INSERT INTO patch_operations
           (patch_id, op_seq, operation_id, actor_principal_id, op_type, payload)
         SELECT id, revision, $2, $3, 'tile_placed', '{}'::jsonb
         FROM patches WHERE id = $1
         RETURNING event_id`,
        [ACTIVE_PATCH_ID, randomUUID(), PRINCIPAL_ID],
      )
      await writer.query('COMMIT')
      await writer.end()
      await blocker.query('COMMIT')
      blockerCommitted = true

      const snapshot = await snapshotPromise
      expect(snapshot.revision).toBe(1)
      expect(snapshot.tiles.map((tile) => tile.id)).not.toContain(pendingTileId)
      expect(snapshot.eventId).not.toBe(inserted.rows[0]?.event_id)
    } finally {
      if (!blockerCommitted) {
        await blocker.query('ROLLBACK')
      }
      blocker.release()
      await blockerPool.end()
      await queryWithConnection(database, 'DELETE FROM tiles WHERE id = $1', [pendingTileId])
    }
  })

  it('falls back to legacy canvas rows when a bounded compatibility patch diverges', async () => {
    const pool = database.createConnection()
    await pool.query('DELETE FROM tile_spatial_refs')
    await pool.query('DELETE FROM authorization_audit_events WHERE patch_id = $1', [QUIET_PATCH_ID])
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
      await loadPatchDeliverySnapshot(ACTIVE_PATCH_ID, {
        principalId: PRINCIPAL_ID,
        dualReadEnabled: false,
      })
      expect(observer.mock.calls.some(([event]) => event.name === 'dual_read_parity')).toBe(false)

      const snapshot = await loadPatchDeliverySnapshot(ACTIVE_PATCH_ID, {
        principalId: PRINCIPAL_ID,
        dualReadEnabled: true,
        canary: true,
      })
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