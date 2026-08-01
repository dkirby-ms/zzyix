// Copyright (c) Microsoft Corporation.
// SPDX-License-Identifier: MIT

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'

const execFileAsync = promisify(execFile)

const purgeScriptPath = fileURLToPath(
  new URL('../../../../scripts/database-purge.sh', import.meta.url),
)

const CANVAS_A_ID = 'aa100000-0000-4000-8000-000000000001'
const QUILT_A_ID = 'aa100000-0000-4000-8000-000000000002'
const PATCH_A_ID = 'aa100000-0000-4000-8000-000000000003'
const TILE_A_ID = 'aa100000-0000-4000-8000-000000000004'

// A tile in a different canvas whose anchor_patch_id points into quilt A.
// Without the anchor_patch_id clause in purge_canvas, deleting quilt A cascades
// to patch A and triggers a tiles.anchor_patch_id → patches RESTRICT violation.
const CANVAS_B_ID = 'bb100000-0000-4000-8000-000000000001'
const TILE_B_CROSS_ANCHOR_ID = 'bb100000-0000-4000-8000-000000000002'

const seedGameData = async (pool: Pool): Promise<void> => {
  await pool.query(
    'INSERT INTO canvases (id) VALUES ($1), ($2) ON CONFLICT (id) DO NOTHING',
    [CANVAS_A_ID, CANVAS_B_ID],
  )
  await pool.query(
    `INSERT INTO quilts (id, legacy_canvas_id, patch_rows, patch_columns, patch_width, patch_height, topology)
     VALUES ($1, $2, 1, 1, 10, 10, 'toroidal')`,
    [QUILT_A_ID, CANVAS_A_ID],
  )
  await pool.query(
    'INSERT INTO patches (id, quilt_id, "row", "column") VALUES ($1, $2, 0, 0)',
    [PATCH_A_ID, QUILT_A_ID],
  )
  // A tile that belongs to canvas A and is normally anchored to patch A.
  await pool.query(
    `INSERT INTO tiles (id, canvas_id, quilt_id, anchor_patch_id, shape, color, material, pos_x, pos_y, rotation)
     VALUES ($1, $2, $3, $4, 'square', '#aabbcc', 'ceramic', 1, 1, 0)`,
    [TILE_A_ID, CANVAS_A_ID, QUILT_A_ID, PATCH_A_ID],
  )
  // A tile in canvas B whose anchor_patch_id points to patch A (cross-canvas stale anchor).
  // quilt_id is deliberately NULL to represent a partially migrated / orphaned tile state.
  await pool.query(
    `INSERT INTO tiles (id, canvas_id, shape, color, material, pos_x, pos_y, rotation, anchor_patch_id)
     VALUES ($1, $2, 'triangle', '#ddeeff', 'glass', 2, 2, 0, $3)`,
    [TILE_B_CROSS_ANCHOR_ID, CANVAS_B_ID, PATCH_A_ID],
  )
  // Authorization audit event that references quilt A and patch A (both RESTRICT FKs).
  await pool.query(
    `INSERT INTO authorization_audit_events
       (event_type, attempted_action, outcome, source_channel, quilt_id, patch_id)
     VALUES ('patch_claim', 'claim', 'allowed', 'socket', $1, $2)`,
    [QUILT_A_ID, PATCH_A_ID],
  )
}

const runPurge = (
  args: string[],
  env?: Record<string, string>,
): Promise<{ stdout: string; stderr: string }> =>
  execFileAsync(purgeScriptPath, args, {
    env: { ...process.env, ...env },
  })

describe('database-purge regression: constraint violations', () => {
  let database: PostgresTestDatabase
  let pool: Pool

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_purge_regression')
    pool = database.createConnection()
  }, 30_000)

  afterAll(async () => {
    await pool?.end()
    await database?.dispose()
  }, 30_000)

  it('purge_canvas succeeds when a tile in another canvas has anchor_patch_id pointing to a patch in the target quilt', async () => {
    await seedGameData(pool)

    // Verify the cross-canvas tile with the stale anchor reference exists.
    const before = await pool.query<{ count: string }>(
      'SELECT count(*)::int AS count FROM tiles WHERE id = $1',
      [TILE_B_CROSS_ANCHOR_ID],
    )
    expect(before.rows[0]?.count).toBe(1)

    // Running purge_canvas without the anchor_patch_id fix would throw a constraint violation
    // because cascade-deleting patch A (via quilt A) fires tiles.anchor_patch_id → patches RESTRICT
    // for the cross-canvas tile that is not caught by canvas_id or quilt_id conditions alone.
    await expect(
      runPurge(
        ['--canvas-id', CANVAS_A_ID, '--database-url', database.connectionString, '--yes'],
      ),
    ).resolves.toMatchObject({ stdout: expect.stringContaining('Purge complete.') })

    // Canvas A rows must be gone.
    const canvasA = await pool.query(
      'SELECT count(*)::int AS count FROM canvases WHERE id = $1',
      [CANVAS_A_ID],
    )
    expect(canvasA.rows[0]?.count).toBe(0)

    // Quilt A and its patches must be gone.
    const quiltA = await pool.query(
      'SELECT count(*)::int AS count FROM quilts WHERE id = $1',
      [QUILT_A_ID],
    )
    expect(quiltA.rows[0]?.count).toBe(0)

    const patchA = await pool.query(
      'SELECT count(*)::int AS count FROM patches WHERE id = $1',
      [PATCH_A_ID],
    )
    expect(patchA.rows[0]?.count).toBe(0)

    // Tile A (same canvas) must be gone.
    const tileA = await pool.query(
      'SELECT count(*)::int AS count FROM tiles WHERE id = $1',
      [TILE_A_ID],
    )
    expect(tileA.rows[0]?.count).toBe(0)

    // The cross-canvas tile must also be gone (its anchor reference to patch A was cleared).
    const tileB = await pool.query(
      'SELECT count(*)::int AS count FROM tiles WHERE id = $1',
      [TILE_B_CROSS_ANCHOR_ID],
    )
    expect(tileB.rows[0]?.count).toBe(0)

    // Canvas B itself must still exist.
    const canvasB = await pool.query(
      'SELECT count(*)::int AS count FROM canvases WHERE id = $1',
      [CANVAS_B_ID],
    )
    expect(canvasB.rows[0]?.count).toBe(1)

    // Audit events for quilt A / patch A must be gone.
    const auditEvents = await pool.query(
      'SELECT count(*)::int AS count FROM authorization_audit_events WHERE quilt_id = $1',
      [QUILT_A_ID],
    )
    expect(auditEvents.rows[0]?.count).toBe(0)
  })

  it('purge_all succeeds with cross-canvas anchor references and removes all game data', async () => {
    // Re-seed into the same database; canvas B still exists from the previous test.
    await seedGameData(pool)

    await expect(
      runPurge(['--database-url', database.connectionString, '--yes']),
    ).resolves.toMatchObject({ stdout: expect.stringContaining('Purge complete.') })

    for (const table of ['canvases', 'quilts', 'patches', 'tiles', 'canonical_world', 'authorization_audit_events']) {
      const result = await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`)
      expect(result.rows[0]?.count, `${table} must be empty after purge_all`).toBe(0)
    }
  })
})
