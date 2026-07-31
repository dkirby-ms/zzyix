import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'
import { assertMigrationStatusCompatible } from './migrate.js'

describe('database schema compatibility', () => {
  it('accepts an exact migration count match', () => {
    expect(() => assertMigrationStatusCompatible({
      localMigrationCount: 9,
      appliedMigrationCount: 9,
    })).not.toThrow()
  })

  it('rejects production startup when migrations are pending', () => {
    expect(() => assertMigrationStatusCompatible({
      localMigrationCount: 9,
      appliedMigrationCount: 8,
    })).toThrow(/Run the one-shot db:apply command/)
  })

  it('rejects startup when the database is ahead of the application image', () => {
    expect(() => assertMigrationStatusCompatible({
      localMigrationCount: 9,
      appliedMigrationCount: 10,
    })).toThrow(/expected 9 applied migrations, found 10/)
  })
})

describe('failed migration rollback', () => {
  let database: PostgresTestDatabase

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_failed_migration')
  }, 30_000)

  afterAll(async () => database?.dispose(), 30_000)

  it('leaves no partial schema changes after a failed migration transaction', async () => {
    const pool = database.createConnection()
    try {
      await expect(pool.query(`
        BEGIN;
        CREATE TABLE migration_failure_probe (id integer PRIMARY KEY);
        SELECT missing_migration_function();
        COMMIT;
      `)).rejects.toThrow()
      await pool.query('ROLLBACK')
      const result = await pool.query<{ tableExists: boolean }>(`
        SELECT to_regclass('public.migration_failure_probe') IS NOT NULL AS "tableExists"
      `)
      expect(result.rows[0]?.tableExists).toBe(false)
    } finally {
      await pool.end()
    }
  })
})