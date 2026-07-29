import { describe, expect, it, vi } from 'vitest'

vi.mock('../db', () => ({ completePrincipalDeletion: vi.fn() }))

import { completePrincipalDeletion } from '../db/index.js'
import { runPrincipalDeletionAttempt } from './principalDeletion.js'

describe('principal deletion job', () => {
  it('keeps completion fail-closed while retention remains unapproved', async () => {
    vi.mocked(completePrincipalDeletion).mockResolvedValueOnce({
      succeeded: false, idempotent: false, reason: 'RETENTION_UNAPPROVED',
    })
    await expect(runPrincipalDeletionAttempt('principal-1', new Date('2026-07-28T00:00:00Z')))
      .resolves.toMatchObject({ succeeded: false, reason: 'RETENTION_UNAPPROVED' })
    expect(completePrincipalDeletion).toHaveBeenCalledWith(expect.objectContaining({
      principalId: 'principal-1', retentionApproved: false,
    }))
  })
})