import { closeDatabaseBundle, getDatabaseBundle } from './client.js'
import { verifyQuiltBackfillParity } from './quiltBackfill.js'

verifyQuiltBackfillParity(getDatabaseBundle().pool)
  .then((parity) => {
    console.log('[db:parity] Quilt compatibility parity', parity)
    if (!parity.matches) process.exitCode = 1
  })
  .catch((error) => {
    console.error('[db:parity] Quilt compatibility parity failed', error)
    process.exitCode = 1
  })
  .finally(async () => closeDatabaseBundle())