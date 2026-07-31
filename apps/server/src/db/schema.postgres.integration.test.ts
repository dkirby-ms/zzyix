import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DatabaseError, Pool } from 'pg'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'
import { patchesParentBoundsConstraintName } from './schema.js'

const QUILT_ID = '21000000-0000-4000-8000-000000000001'

const insertPatch = async (pool: Pool, row: number, column: number): Promise<void> => {
  await pool.query(
    'INSERT INTO patches (quilt_id, "row", "column") VALUES ($1, $2, $3)',
    [QUILT_ID, row, column],
  )
}

describe('canonical patch address PostgreSQL constraints', () => {
  let database: PostgresTestDatabase
  let pool: Pool

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_patch_bounds')
    pool = database.createConnection()
    await pool.query(
      `INSERT INTO quilts (
        id, patch_rows, patch_columns, patch_width, patch_height, topology
      ) VALUES ($1, 2, 3, 10, 10, 'toroidal')`,
      [QUILT_ID],
    )
  }, 30_000)

  afterAll(async () => {
    await pool?.end()
    await database?.dispose()
  }, 30_000)

  it('persists the last valid canonical patch address', async () => {
    await expect(insertPatch(pool, 1, 2)).resolves.toBeUndefined()
  })

  it.each([
    ['negative row', -1, 0],
    ['negative column', 0, -1],
    ['row equal to patch rows', 2, 0],
    ['column equal to patch columns', 0, 3],
  ])('rejects %s', async (_label, row, column) => {
    await expect(insertPatch(pool, row, column)).rejects.toMatchObject<Partial<DatabaseError>>({
      code: '23514',
      constraint: patchesParentBoundsConstraintName,
    })
  })
})