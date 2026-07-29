import { closeDatabaseBundle } from '../db/index.js'
import { runPrincipalDeletionJob } from './principalDeletion.js'

const readBatchSize = (): number | undefined => {
  const value = process.env.PRINCIPAL_DELETION_BATCH_SIZE
  return value === undefined ? undefined : Number(value)
}

const main = async (): Promise<void> => {
  const report = await runPrincipalDeletionJob({
    retentionApproved: process.env.AUTH_DELETION_COMPLETION_POLICY_APPROVED === 'true',
    batchSize: readBatchSize(),
  })
  console.log('[principal-deletion] pass completed', report)
  if (report.blocked.length > 0 || report.failures.length > 0) process.exitCode = 1
}

main()
  .catch((error: unknown) => {
    console.error('[principal-deletion] pass failed', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => closeDatabaseBundle())