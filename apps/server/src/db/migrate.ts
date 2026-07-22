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
        WHERE table_schema = 'public' AND table_name = '__drizzle_migrations'
      ) AS exists
    `,
  )

  if (tableCheck.rows[0]?.exists !== true) {
    return 0
  }

  const applied = await pool.query('SELECT COUNT(*)::int AS count FROM "__drizzle_migrations"')
  return applied.rows[0]?.count ?? 0
}

export const hasPendingMigrations = async (migrationsFolder: string): Promise<boolean> => {
  const localMigrationCount = countLocalMigrationFiles(migrationsFolder)
  if (localMigrationCount === 0) {
    return false
  }

  const appliedMigrationCount = await countAppliedMigrations()
  return appliedMigrationCount < localMigrationCount
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