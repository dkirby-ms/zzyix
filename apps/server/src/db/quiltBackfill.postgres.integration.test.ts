import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { backfillLegacyCanvases } from './quiltBackfill.js'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'

type PreservedTileRow = {
  id: string
  canvasId: string
  shape: string
  color: string
  material: string
  posX: number
  posY: number
  chunkX: number
  chunkY: number
  rotation: number
  mirrored: boolean
  placedBy: string | null
  createdAt: string
}

const preservedTilesQuery = `
  SELECT
    id,
    canvas_id AS "canvasId",
    shape,
    color,
    material,
    pos_x AS "posX",
    pos_y AS "posY",
    chunk_x AS "chunkX",
    chunk_y AS "chunkY",
    rotation,
    mirrored,
    placed_by AS "placedBy",
    created_at::text AS "createdAt"
  FROM tiles
  ORDER BY id
`

const additiveCounts = async (pool: Pool): Promise<Record<string, number>> => {
  const result = await pool.query<Record<string, number>>(`
    SELECT
      (SELECT count(*)::int FROM quilts) AS quilts,
      (SELECT count(*)::int FROM patches) AS patches,
      (SELECT count(*)::int FROM tile_spatial_refs) AS "spatialRefs",
      (SELECT count(*)::int FROM patch_memberships) AS memberships,
      (SELECT count(*)::int FROM patches WHERE owner_principal_id IS NOT NULL) AS owners
  `)
  return result.rows[0] ?? {}
}

describe('legacy quilt backfill database preservation', () => {
  let database: PostgresTestDatabase

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_backfill')
    const pool = database.createConnection()
    try {
      await pool.query(`
        INSERT INTO canvases (id, version, canvas_config, created_at, updated_at)
        VALUES
          ('10000000-0000-4000-8000-000000000001', 1,
            '{"canvasSize":{"width":10.4,"height":6.8},"boundsPolicy":{"mode":"bounded","bounds":{"minX":-5.2,"maxX":5.2,"minY":-3.4,"maxY":3.4}}}',
            '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z'),
          ('10000000-0000-4000-8000-000000000002', 2,
            '{"canvasSize":{"width":20.8,"height":13.6},"boundsPolicy":{"mode":"bounded","bounds":{"minX":-10.4,"maxX":10.4,"minY":-6.8,"maxY":6.8}}}',
            '2026-02-01T00:00:00Z', '2026-02-01T01:00:00Z'),
          ('10000000-0000-4000-8000-000000000003', 3,
            '{"canvasSize":{"width":31.2,"height":20.4},"boundsPolicy":{"mode":"bounded","bounds":{"minX":-15.6,"maxX":15.6,"minY":-10.2,"maxY":10.2}}}',
            '2026-03-01T00:00:00Z', '2026-03-01T01:00:00Z')
      `)
      await pool.query(`
        INSERT INTO tiles (
          id, canvas_id, shape, color, material, pos_x, pos_y, chunk_x, chunk_y,
          rotation, mirrored, placed_by, created_at
        )
        VALUES
          ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
            'square', '#abc', 'ceramic', -5.19, -3.39, -1, -1, 0, false,
            'classic-author', '2026-01-02T03:04:05.123Z'),
          ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
            'triangle', '#def', 'glass', 7.9, 0, 0, 0, 1.5, true,
            'expanded-author', '2026-02-02T03:04:05.456Z'),
          ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003',
            'rectangle', '#123456', 'stone', 15.59, 10.19, 1, 1, 3.14159, false,
            NULL, '2026-03-02T03:04:05.789Z'),
          ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003',
            'l-shape', '#654321', 'ceramic', -8.01, -8.01, -2, -2, 0.75, true,
            'vast-author', '2026-03-03T03:04:05.999Z')
      `)
    } finally {
      await pool.end()
    }
  }, 30_000)

  afterAll(async () => database?.dispose(), 30_000)

  it('preserves every tile field across restart-safe repeated backfill without inventing owners', async () => {
    const beforePool = database.createConnection()
    const before = (await beforePool.query<PreservedTileRow>(preservedTilesQuery)).rows
    await beforePool.end()

    const firstPool = new Pool({ connectionString: database.connectionString, max: 2 })
    const firstParity = await backfillLegacyCanvases(firstPool)
    const firstCounts = await additiveCounts(firstPool)
    await firstPool.end()

    const restartedPool = new Pool({ connectionString: database.connectionString, max: 2 })
    const secondParity = await backfillLegacyCanvases(restartedPool)
    const secondCounts = await additiveCounts(restartedPool)
    const after = (await restartedPool.query<PreservedTileRow>(preservedTilesQuery)).rows
    const geometries = (await restartedPool.query(`
      SELECT q.patch_width, q.patch_height, q.origin_x, q.origin_y, p.revision, p.state,
        p.owner_principal_id
      FROM quilts q
      JOIN patches p ON p.quilt_id = q.id
      ORDER BY q.patch_width
    `)).rows
    await restartedPool.end()

    expect(firstParity.matches).toBe(true)
    expect(secondParity.matches).toBe(true)
    expect(secondParity.legacyTileFingerprint).toBe(secondParity.linkedTileFingerprint)
    expect(after).toEqual(before)
    expect(secondCounts).toEqual(firstCounts)
    expect(secondCounts).toMatchObject({ quilts: 3, patches: 3, memberships: 0, owners: 0 })
    expect(secondCounts.spatialRefs).toBeGreaterThanOrEqual(before.length)
    expect(geometries).toEqual([
      expect.objectContaining({ patch_width: 10.4, patch_height: 6.8, origin_x: -5.2, origin_y: -3.4, revision: 1, state: 'unclaimed', owner_principal_id: null }),
      expect.objectContaining({ patch_width: 20.8, patch_height: 13.6, origin_x: -10.4, origin_y: -6.8, revision: 2, state: 'unclaimed', owner_principal_id: null }),
      expect.objectContaining({ patch_width: 31.2, patch_height: 20.4, origin_x: -15.6, origin_y: -10.2, revision: 3, state: 'unclaimed', owner_principal_id: null }),
    ])
  }, 30_000)
})
