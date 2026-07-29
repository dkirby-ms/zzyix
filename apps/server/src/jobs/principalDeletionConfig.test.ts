import { describe, expect, it } from 'vitest'
import { readPrincipalDeletionJobOptions } from './principalDeletionConfig.js'

describe('principal deletion CLI configuration', () => {
  it('requires retention approval independently from deletion completion approval', () => {
    expect(readPrincipalDeletionJobOptions({
      AUTH_RETENTION_POLICY_APPROVED: 'false',
      AUTH_DELETION_COMPLETION_POLICY_APPROVED: 'true',
    })).toEqual({ retentionApproved: false })
    expect(readPrincipalDeletionJobOptions({
      AUTH_RETENTION_POLICY_APPROVED: 'true',
      AUTH_DELETION_COMPLETION_POLICY_APPROVED: 'false',
    })).toEqual({ retentionApproved: true })
  })

  it('passes through the optional batch size', () => {
    expect(readPrincipalDeletionJobOptions({
      AUTH_RETENTION_POLICY_APPROVED: 'true',
      PRINCIPAL_DELETION_BATCH_SIZE: '25',
    })).toEqual({ retentionApproved: true, batchSize: 25 })
  })
})