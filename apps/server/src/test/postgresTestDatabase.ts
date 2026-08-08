import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { applyDatabaseMigrations, resolveMigrationsFolder } from '../db/migrate.js'
import {
  closeDatabaseBundle,
  configureDatabaseBundleForTests,
  createDatabaseBundle,
  type DatabaseClient,
} from '../db/client.js'

const DEFAULT_ADMIN_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres'
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
// Cluster-wide advisory lock key: serializes migrations across parallel test
// workers so cluster-level DDL (e.g. CREATE ROLE agent_control_worker) can't race.
const MIGRATION_ADVISORY_LOCK_KEY = 847_362_910

export type PostgresTestDatabase = {
  connectionString: string
  db: DatabaseClient
  createConnection: () => Pool
  dispose: () => Promise<void>
}

export const createPostgresTestDatabase = async (prefix: string): Promise<PostgresTestDatabase> => {
  const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL ?? DEFAULT_ADMIN_URL)
  if (!LOOPBACK_HOSTS.has(adminUrl.hostname)) {
    throw new Error('PostgreSQL integration tests require a loopback TEST_DATABASE_ADMIN_URL')
  }

  const databaseName = `${prefix}_${randomUUID().replaceAll('-', '')}`
  const adminPool = new Pool({ connectionString: adminUrl.toString(), max: 2 })
  await adminPool.query(`CREATE DATABASE "${databaseName}"`)
  await adminPool.end()

  const databaseUrl = new URL(adminUrl)
  databaseUrl.pathname = `/${databaseName}`
  const connectionString = databaseUrl.toString()
  const bundle = createDatabaseBundle({ connectionString, max: 10 })
  configureDatabaseBundleForTests(bundle)
  const priorDatabaseUrl = process.env.DATABASE_URL
  process.env.DATABASE_URL = connectionString

  // Advisory locks are session-scoped, so hold a dedicated connection for the duration.
  const lockPool = new Pool({ connectionString: adminUrl.toString(), max: 1 })
  try {
    await lockPool.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_KEY])
    try {
      await applyDatabaseMigrations(resolveMigrationsFolder(new URL('../db/migrate.ts', import.meta.url).href))
    } finally {
      await lockPool.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_KEY])
    }
  } finally {
    await lockPool.end()
    if (priorDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL
    } else {
      process.env.DATABASE_URL = priorDatabaseUrl
    }
  }

  return {
    connectionString,
    db: bundle.db,
    createConnection: () => new Pool({ connectionString, max: 1 }),
    dispose: async () => {
      await closeDatabaseBundle()
      const cleanupPool = new Pool({ connectionString: adminUrl.toString(), max: 1 })
      await cleanupPool.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
      await cleanupPool.end()
    },
  }
}