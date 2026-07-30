import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Pool, PoolClient } from 'pg'
import { closeDatabaseBundle, getDatabaseBundle } from './client.js'
import { RUNTIME_CHUNK_WORLD_SIZE, type TileInstance } from '../contracts.js'
import type { LegacySessionCanvasConfig as SessionCanvasConfig } from '../domain/legacySession.js'
import { transformTile } from '../domain/tileGeometry.js'

const DEFAULT_WIDTH = 10.4
const DEFAULT_HEIGHT = 6.8

export type LegacyCanvasBackfillSource = {
  id: string
  version: number
  canvasConfig: SessionCanvasConfig | null
}

export type LegacyTileBackfillSource = Pick<TileInstance, 'id' | 'shape' | 'color' | 'material' | 'transform' | 'placedBy'>

export type SpatialRefAddress = {
  chunkX: number
  chunkY: number
}

export type QuiltBackfillParity = {
  legacyCanvases: number
  compatibilityQuilts: number
  legacyTiles: number
  linkedTiles: number
  spatiallyReferencedTiles: number
  inferredOwners: number
  geometryMismatches: number
  legacyTileFingerprint: string
  linkedTileFingerprint: string
  matches: boolean
}

export const resolveCompatibilityGeometry = (
  canvasConfig: SessionCanvasConfig | null,
): { width: number; height: number; originX: number; originY: number } => {
  if (canvasConfig?.boundsPolicy.mode === 'bounded') {
    return {
      width: canvasConfig.canvasSize.width,
      height: canvasConfig.canvasSize.height,
      originX: canvasConfig.boundsPolicy.bounds.minX,
      originY: canvasConfig.boundsPolicy.bounds.minY,
    }
  }

  return {
    width: canvasConfig?.canvasSize.width ?? DEFAULT_WIDTH,
    height: canvasConfig?.canvasSize.height ?? DEFAULT_HEIGHT,
    originX: -(canvasConfig?.canvasSize.width ?? DEFAULT_WIDTH) / 2,
    originY: -(canvasConfig?.canvasSize.height ?? DEFAULT_HEIGHT) / 2,
  }
}

export const deriveTileSpatialRefs = (
  tile: LegacyTileBackfillSource,
  chunkWorldSize: number = RUNTIME_CHUNK_WORLD_SIZE,
): SpatialRefAddress[] => {
  const outline = transformTile(tile.shape, tile.transform).outline
  const minX = Math.min(...outline.map((point) => point.x))
  const maxX = Math.max(...outline.map((point) => point.x))
  const minY = Math.min(...outline.map((point) => point.y))
  const maxY = Math.max(...outline.map((point) => point.y))
  const refs: SpatialRefAddress[] = []

  for (let chunkX = Math.floor(minX / chunkWorldSize); chunkX <= Math.floor(maxX / chunkWorldSize); chunkX += 1) {
    for (let chunkY = Math.floor(minY / chunkWorldSize); chunkY <= Math.floor(maxY / chunkWorldSize); chunkY += 1) {
      refs.push({ chunkX, chunkY })
    }
  }

  return refs
}

const backfillCanvas = async (client: PoolClient, canvas: LegacyCanvasBackfillSource): Promise<void> => {
  const geometry = resolveCompatibilityGeometry(canvas.canvasConfig)
  const quiltResult = await client.query<{ id: string }>(
    `
      INSERT INTO quilts (
        legacy_canvas_id,
        patch_rows,
        patch_columns,
        patch_width,
        patch_height,
        origin_x,
        origin_y,
        topology,
        protocol_version
      )
      VALUES ($1, 1, 1, $2, $3, $4, $5, 'bounded', 1)
      ON CONFLICT (legacy_canvas_id) DO UPDATE
      SET updated_at = quilts.updated_at
      RETURNING id
    `,
    [canvas.id, geometry.width, geometry.height, geometry.originX, geometry.originY],
  )
  const quiltId = quiltResult.rows[0]?.id
  if (!quiltId) {
    throw new Error(`Could not resolve compatibility quilt for canvas ${canvas.id}`)
  }

  const patchResult = await client.query<{ id: string }>(
    `
      INSERT INTO patches (quilt_id, row, "column", state, revision)
      VALUES ($1, 0, 0, 'unclaimed', $2)
      ON CONFLICT (quilt_id, row, "column") DO UPDATE
      SET revision = EXCLUDED.revision
      RETURNING id
    `,
    [quiltId, canvas.version],
  )
  const patchId = patchResult.rows[0]?.id
  if (!patchId) {
    throw new Error(`Could not resolve compatibility patch for canvas ${canvas.id}`)
  }

  await client.query(
    `
      UPDATE tiles
      SET quilt_id = $1, anchor_patch_id = $2
      WHERE canvas_id = $3
        AND (quilt_id IS DISTINCT FROM $1 OR anchor_patch_id IS DISTINCT FROM $2)
    `,
    [quiltId, patchId, canvas.id],
  )

  const tileResult = await client.query<{
    id: string
    shape: TileInstance['shape']
    color: string
    material: TileInstance['material']
    pos_x: number
    pos_y: number
    rotation: number
    mirrored: boolean
    placed_by: string | null
  }>(
    `
      SELECT id, shape, color, material, pos_x, pos_y, rotation, mirrored, placed_by
      FROM tiles
      WHERE canvas_id = $1
      ORDER BY id
    `,
    [canvas.id],
  )

  for (const row of tileResult.rows) {
    const refs = deriveTileSpatialRefs({
      id: row.id,
      shape: row.shape,
      color: row.color,
      material: row.material,
      transform: {
        position: { x: row.pos_x, y: row.pos_y },
        rotation: row.rotation,
        mirrored: row.mirrored,
      },
      placedBy: row.placed_by ?? undefined,
    })

    await client.query('DELETE FROM tile_spatial_refs WHERE tile_id = $1 AND patch_id = $2', [row.id, patchId])
    for (const ref of refs) {
      await client.query(
        `
          INSERT INTO tile_spatial_refs (tile_id, patch_id, chunk_x, chunk_y)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT DO NOTHING
        `,
        [row.id, patchId, ref.chunkX, ref.chunkY],
      )
    }
  }

  await client.query(
    `
      INSERT INTO patch_operations (
        patch_id,
        op_seq,
        operation_id,
        op_type,
        payload,
        legacy_operation_id,
        created_at
      )
      SELECT $1, op_seq, gen_random_uuid(), op_type, payload, id, created_at
      FROM operation_log
      WHERE canvas_id = $2
      ON CONFLICT (legacy_operation_id) DO NOTHING
    `,
    [patchId, canvas.id],
  )

  await client.query(
    `
      INSERT INTO patch_snapshots (patch_id, op_seq, state, legacy_snapshot_id, created_at)
      SELECT $1, op_seq, state, id, created_at
      FROM snapshots
      WHERE canvas_id = $2
      ON CONFLICT (legacy_snapshot_id) DO NOTHING
    `,
    [patchId, canvas.id],
  )
}

export const verifyQuiltBackfillParity = async (pool: Pool): Promise<QuiltBackfillParity> => {
  const result = await pool.query<QuiltBackfillParity>(
    `
      WITH tile_fingerprints AS (
        SELECT
          md5(coalesce(string_agg(
            concat_ws('|', id, canvas_id, shape, color, material, pos_x, pos_y,
              chunk_x, chunk_y, rotation, mirrored, coalesce(placed_by, ''),
              extract(epoch FROM created_at)),
            ',' ORDER BY id
          ), '')) AS legacy_fingerprint,
          md5(coalesce(string_agg(
            concat_ws('|', id, canvas_id, shape, color, material, pos_x, pos_y,
              chunk_x, chunk_y, rotation, mirrored, coalesce(placed_by, ''),
              extract(epoch FROM created_at)),
            ',' ORDER BY id
          ) FILTER (WHERE quilt_id IS NOT NULL AND anchor_patch_id IS NOT NULL), '')) AS linked_fingerprint
        FROM tiles
      )
      SELECT
        (SELECT count(*)::int FROM canvases) AS "legacyCanvases",
        (SELECT count(*)::int FROM quilts WHERE legacy_canvas_id IS NOT NULL AND topology = 'bounded') AS "compatibilityQuilts",
        (SELECT count(*)::int FROM tiles) AS "legacyTiles",
        (SELECT count(*)::int FROM tiles WHERE quilt_id IS NOT NULL AND anchor_patch_id IS NOT NULL) AS "linkedTiles",
        (SELECT count(DISTINCT tile_id)::int FROM tile_spatial_refs) AS "spatiallyReferencedTiles",
        (SELECT count(*)::int FROM patches WHERE owner_principal_id IS NOT NULL) AS "inferredOwners",
        (SELECT count(*)::int
          FROM canvases c
          JOIN quilts q ON q.legacy_canvas_id = c.id
          WHERE q.patch_rows <> 1
            OR q.patch_columns <> 1
            OR q.topology <> 'bounded'
            OR q.patch_width <> (c.canvas_config->'canvasSize'->>'width')::double precision
            OR q.patch_height <> (c.canvas_config->'canvasSize'->>'height')::double precision
            OR q.origin_x <> (c.canvas_config->'boundsPolicy'->'bounds'->>'minX')::double precision
            OR q.origin_y <> (c.canvas_config->'boundsPolicy'->'bounds'->>'minY')::double precision
        ) AS "geometryMismatches",
        legacy_fingerprint AS "legacyTileFingerprint",
        linked_fingerprint AS "linkedTileFingerprint"
      FROM tile_fingerprints
    `,
  )
  const counts = result.rows[0]
  if (!counts) {
    throw new Error('Could not compute quilt backfill parity')
  }

  return {
    ...counts,
    matches:
      counts.legacyCanvases === counts.compatibilityQuilts &&
      counts.legacyTiles === counts.linkedTiles &&
      counts.legacyTiles === counts.spatiallyReferencedTiles &&
      counts.inferredOwners === 0 &&
      counts.geometryMismatches === 0 &&
      counts.legacyTileFingerprint === counts.linkedTileFingerprint,
  }
}

export const backfillLegacyCanvases = async (pool: Pool): Promise<QuiltBackfillParity> => {
  const canvasesResult = await pool.query<LegacyCanvasBackfillSource>(
    'SELECT id, version, canvas_config AS "canvasConfig" FROM canvases ORDER BY id',
  )

  for (const canvas of canvasesResult.rows) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await backfillCanvas(client, canvas)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  const parity = await verifyQuiltBackfillParity(pool)
  if (!parity.matches) {
    throw new Error(`Quilt backfill parity failed: ${JSON.stringify(parity)}`)
  }

  return parity
}

const isExecutedAsEntryPoint = (): boolean => {
  const entryPath = process.argv[1]
  return entryPath !== undefined && path.resolve(entryPath) === fileURLToPath(import.meta.url)
}

if (isExecutedAsEntryPoint()) {
  backfillLegacyCanvases(getDatabaseBundle().pool)
    .then((parity) => console.log('[db:backfill] Quilt compatibility backfill completed', parity))
    .catch((error) => {
      console.error('[db:backfill] Quilt compatibility backfill failed', error)
      process.exitCode = 1
    })
    .finally(async () => closeDatabaseBundle())
}
