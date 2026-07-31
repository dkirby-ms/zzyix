import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readdirSync } from 'node:fs'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { closeDatabaseBundle, getDatabaseBundle } from './client.js'

export const resolveMigrationsFolder = (metaUrl: string): string => {
  const currentFile = fileURLToPath(metaUrl)
  const currentDir = path.dirname(currentFile)
  return path.resolve(currentDir, '../../migrations')
}

const countLocalMigrationFiles = (migrationsFolder: string): number =>
  readdirSync(migrationsFolder).filter((entry) => entry.endsWith('.sql')).length

const countAppliedMigrations = async (): Promise<number> => {
  const { pool } = getDatabaseBundle()
  const tableCheck = await pool.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
      ) AS exists
    `,
  )

  if (tableCheck.rows[0]?.exists !== true) {
    return 0
  }

  const applied = await pool.query('SELECT COUNT(*)::int AS count FROM "drizzle"."__drizzle_migrations"')
  return applied.rows[0]?.count ?? 0
}

export type MigrationStatus = {
  localMigrationCount: number
  appliedMigrationCount: number
}

export const assertMigrationStatusCompatible = (status: MigrationStatus): void => {
  if (status.appliedMigrationCount !== status.localMigrationCount) {
    throw new Error(
      `Database schema is incompatible: expected ${status.localMigrationCount} applied migrations, ` +
      `found ${status.appliedMigrationCount}. Run the one-shot db:apply command before starting production replicas.`,
    )
  }
}

export const getMigrationStatus = async (migrationsFolder: string): Promise<MigrationStatus> => ({
  localMigrationCount: countLocalMigrationFiles(migrationsFolder),
  appliedMigrationCount: await countAppliedMigrations(),
})

export const hasPendingMigrations = async (migrationsFolder: string): Promise<boolean> => {
  const status = await getMigrationStatus(migrationsFolder)
  if (status.localMigrationCount === 0) {
    return false
  }

  return status.appliedMigrationCount < status.localMigrationCount
}

export const verifyDatabaseSchemaCompatibility = async (): Promise<MigrationStatus> => {
  const status = await getMigrationStatus(resolveMigrationsFolder(import.meta.url))
  assertMigrationStatusCompatible(status)
  console.log(`[db:migrate] Schema compatibility verified (${status.appliedMigrationCount} migrations)`)
  return status
}

export const prepareDatabaseSchemaForStartup = async (): Promise<boolean> => {
  if (process.env.NODE_ENV === 'production') {
    await verifyDatabaseSchemaCompatibility()
    return false
  }

  return applyDatabaseMigrationsIfNeeded()
}

export const applyDatabaseMigrations = async (migrationsFolder: string): Promise<void> => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run database migrations')
  }

  const { db } = getDatabaseBundle()

  console.log(`[db:migrate] Applying migrations from ${migrationsFolder}`)
  await migrate(db, { migrationsFolder })
  console.log('[db:migrate] Migration completed successfully')
}

export const applyDatabaseMigrationsIfNeeded = async (): Promise<boolean> => {
  const migrationsFolder = resolveMigrationsFolder(import.meta.url)

  if (!(await hasPendingMigrations(migrationsFolder))) {
    console.log('[db:migrate] No pending migrations detected')
    return false
  }

  await applyDatabaseMigrations(migrationsFolder)
  return true
}

const runFromCli = async (): Promise<void> => {
  await applyDatabaseMigrationsIfNeeded()
}

const isExecutedAsEntryPoint = (): boolean => {
  const entryPath = process.argv[1]
  if (!entryPath) {
    return false
  }

  return path.resolve(entryPath) === fileURLToPath(import.meta.url)
}

if (isExecutedAsEntryPoint()) {
  runFromCli()
    .catch((error) => {
      console.error('[db:migrate] Migration failed', error)
      process.exitCode = 1
    })
    .finally(async () => {
      await closeDatabaseBundle()
    })
}