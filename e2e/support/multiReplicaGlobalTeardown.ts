import { readFile, rm } from 'node:fs/promises'
import { Pool } from 'pg'

const STATE_FILE = '.playwright-multi-replica-database-url'
const DEFAULT_ADMIN_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres'
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export default async (): Promise<void> => {
	const connectionString = await readFile(STATE_FILE, 'utf8').catch(() => '')
	if (!connectionString) return
	const databaseUrl = new URL(connectionString)
	const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL ?? DEFAULT_ADMIN_URL)
	if (!LOOPBACK_HOSTS.has(adminUrl.hostname)) {
		throw new Error('Multi-replica teardown requires a loopback TEST_DATABASE_ADMIN_URL')
	}

	const pool = new Pool({ connectionString: adminUrl.toString(), max: 1 })
	await pool.query(`DROP DATABASE "${databaseUrl.pathname.slice(1)}" WITH (FORCE)`)
	await pool.end()
	await rm(STATE_FILE, { force: true })
}