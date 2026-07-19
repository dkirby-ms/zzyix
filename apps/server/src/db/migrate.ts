import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { closeDatabaseBundle, getDatabaseBundle } from './client.js'

const run = async (): Promise<void> => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run database migrations')
  }

  const { db } = getDatabaseBundle()
  const currentFile = fileURLToPath(import.meta.url)
  const currentDir = path.dirname(currentFile)
  const migrationsFolder = path.resolve(currentDir, '../../migrations')

  console.log(`[db:migrate] Applying migrations from ${migrationsFolder}`)
  await migrate(db, { migrationsFolder })
  console.log('[db:migrate] Migration completed successfully')
}

run()
  .catch((error) => {
    console.error('[db:migrate] Migration failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDatabaseBundle()
  })