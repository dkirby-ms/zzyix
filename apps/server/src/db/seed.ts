import { pathToFileURL } from 'node:url'
import { closeDatabaseBundle } from './client.js'
import { activateCanonicalWorld, getCanonicalWorldStatus, provisionCanonicalWorld } from './repository.js'

const CANONICAL_OPERATOR_ID = 'db-bootstrap'

const ensureCanonicalWorld = async (): Promise<void> => {
  let status = await getCanonicalWorldStatus()
  if (status.pointerStatus === 'missing') {
    console.log('[db:bootstrap] Provisioning canonical world...')
    status = await provisionCanonicalWorld({
      action: 'provision',
      expectedGeneration: 0,
      patchRows: 32,
      patchColumns: 32,
      patchWidth: 31.2,
      patchHeight: 20.4,
      originX: 0,
      originY: 0,
      operatorId: CANONICAL_OPERATOR_ID,
      reason: 'provision canonical world during database bootstrap',
    })
  }

  if (status.pointerStatus === 'inactive' && status.quilt) {
    console.log('[db:bootstrap] Activating canonical world...')
    await activateCanonicalWorld({
      action: 'activate',
      quiltId: status.quilt.id,
      expectedGeneration: status.generation,
      operatorId: CANONICAL_OPERATOR_ID,
      reason: 'activate canonical world during database bootstrap',
    })
  }
}

export const runDatabaseSeed = async (): Promise<void> => {
  console.log('[db:bootstrap] Ensuring canonical world...')
  
  try {
    await ensureCanonicalWorld()
    
    console.log('[db:bootstrap] Canonical world is ready')
  } catch (error) {
    console.error('[db:bootstrap] Canonical world bootstrap failed:', error)
    throw error
  }
}

const isExecutedAsEntryPoint = (): boolean => {
  const entryPath = process.argv[1]
  return entryPath !== undefined && pathToFileURL(entryPath).href === import.meta.url
}

if (isExecutedAsEntryPoint()) {
  runDatabaseSeed()
    .catch((error) => {
      console.error('[db:bootstrap] Fatal error:', error)
      process.exitCode = 1
    })
    .finally(async () => {
      await closeDatabaseBundle()
    })
}
