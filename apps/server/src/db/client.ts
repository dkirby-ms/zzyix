import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool, type PoolConfig } from 'pg'
import * as schema from './schema.js'

export type DatabaseSchema = typeof schema
export type DatabaseClient = NodePgDatabase<DatabaseSchema>

type DatabaseBundle = {
  pool: Pool
  db: DatabaseClient
}

let sharedBundle: DatabaseBundle | null = null

const buildPoolConfig = (): PoolConfig => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for Postgres-backed persistence')
  }

  return {
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30_000),
  }
}

export const createDatabaseBundle = (poolConfig: PoolConfig = buildPoolConfig()): DatabaseBundle => {
  const pool = new Pool(poolConfig)
  return {
    pool,
    db: drizzle(pool, { schema }),
  }
}

export const getDatabaseBundle = (): DatabaseBundle => {
  if (!sharedBundle) {
    sharedBundle = createDatabaseBundle()
  }

  return sharedBundle
}

export const configureDatabaseBundleForTests = (bundle: DatabaseBundle | null): void => {
  sharedBundle = bundle
}

export const closeDatabaseBundle = async (): Promise<void> => {
  if (!sharedBundle) {
    return
  }

  const { pool } = sharedBundle
  sharedBundle = null
  await pool.end()
}