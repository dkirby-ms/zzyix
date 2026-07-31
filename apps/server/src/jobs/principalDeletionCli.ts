import { closeDatabaseBundle } from '../db/index.js'
import { runPrincipalDeletionJob } from './principalDeletion.js'
import { readPrincipalDeletionJobOptions } from './principalDeletionConfig.js'

const main = async (): Promise<void> => {
  const report = await runPrincipalDeletionJob(readPrincipalDeletionJobOptions())
  console.log('[principal-deletion] pass completed', report)
  if (report.blocked.length > 0 || report.failures.length > 0) process.exitCode = 1
}

main()
  .catch((error: unknown) => {
    console.error('[principal-deletion] pass failed', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => closeDatabaseBundle())