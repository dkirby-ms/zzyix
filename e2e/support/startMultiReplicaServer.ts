import { mkdir, readFile, rm } from 'node:fs/promises'
import { setupMultiReplicaDatabase } from './multiReplicaDatabase'

const STATE_FILE = '.playwright-multi-replica-database-url'
const LOCK_DIRECTORY = '.playwright-multi-replica-database-lock'

const readDatabaseUrl = async (): Promise<string | null> => {
  const value = await readFile(STATE_FILE, 'utf8').catch(() => '')
  return value || null
}

const waitForDatabaseUrl = async (): Promise<string> => {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const value = await readDatabaseUrl()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Timed out waiting for the disposable multi-replica database')
}

const main = async (): Promise<void> => {
  let ownsLock = false
  try {
    await mkdir(LOCK_DIRECTORY)
    ownsLock = true
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
  }

  if (ownsLock) {
    try {
      if (!await readDatabaseUrl()) await setupMultiReplicaDatabase()
    } finally {
      await rm(LOCK_DIRECTORY, { recursive: true, force: true })
    }
  }

  process.env.DATABASE_URL = await waitForDatabaseUrl()
  await import('../../apps/server/src/index.js')
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})