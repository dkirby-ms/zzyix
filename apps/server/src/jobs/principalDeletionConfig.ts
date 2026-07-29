export type PrincipalDeletionJobOptions = {
  retentionApproved: boolean
  batchSize?: number
}

export const readPrincipalDeletionJobOptions = (
  environment: NodeJS.ProcessEnv = process.env,
): PrincipalDeletionJobOptions => {
  const batchSize = environment.PRINCIPAL_DELETION_BATCH_SIZE

  return {
    retentionApproved: environment.AUTH_RETENTION_POLICY_APPROVED === 'true',
    ...(batchSize === undefined ? {} : { batchSize: Number(batchSize) }),
  }
}