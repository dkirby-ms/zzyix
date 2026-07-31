import { randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { applyDatabaseMigrations, resolveMigrationsFolder } from '../../apps/server/src/db/migrate'
import { configureDatabaseBundleForTests, createDatabaseBundle, closeDatabaseBundle } from '../../apps/server/src/db/client'

const STATE_FILE = '.playwright-multi-replica-database-url'
const DEFAULT_ADMIN_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres'
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

const resolveDatabaseUrl = (): URL => {
  const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL ?? DEFAULT_ADMIN_URL)
  if (!LOOPBACK_HOSTS.has(adminUrl.hostname)) {
    throw new Error('Multi-replica tests require a loopback TEST_DATABASE_ADMIN_URL')
  }
  return adminUrl
}

export const setupMultiReplicaDatabase = async (): Promise<void> => {
  const adminUrl = resolveDatabaseUrl()
  const databaseName = `zzyix_multi_replica_${randomUUID().replaceAll('-', '')}`
  const adminPool = new Pool({ connectionString: adminUrl.toString(), max: 1 })
  await adminPool.query(`CREATE DATABASE "${databaseName}"`)
  await adminPool.end()

  const databaseUrl = new URL(adminUrl)
  databaseUrl.pathname = `/${databaseName}`
  const connectionString = databaseUrl.toString()
  const bundle = createDatabaseBundle({ connectionString, max: 2 })
  configureDatabaseBundleForTests(bundle)
  const previousDatabaseUrl = process.env.DATABASE_URL
  process.env.DATABASE_URL = connectionString
  try {
    await applyDatabaseMigrations(resolveMigrationsFolder(new URL('../../apps/server/src/db/migrate.ts', import.meta.url).href))
  } finally {
    await closeDatabaseBundle()
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousDatabaseUrl
  }

  await writeFile(STATE_FILE, connectionString, { encoding: 'utf8', mode: 0o600 })
}

export const teardownMultiReplicaDatabase = async (): Promise<void> => {
  const connectionString = await readFile(STATE_FILE, 'utf8').catch(() => '')
  if (!connectionString) return
  const databaseUrl = new URL(connectionString)
  const databaseName = databaseUrl.pathname.slice(1)
  const adminUrl = resolveDatabaseUrl()
  const pool = new Pool({ connectionString: adminUrl.toString(), max: 1 })
  await pool.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
  await pool.end()
  await rm(STATE_FILE, { force: true })
}