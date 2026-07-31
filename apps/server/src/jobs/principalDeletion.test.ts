import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db', () => ({
  completePrincipalDeletion: vi.fn(),
  listDuePrincipalDeletionIds: vi.fn(),
}))

import { completePrincipalDeletion, listDuePrincipalDeletionIds } from '../db/index.js'
import { runPrincipalDeletionAttempt, runPrincipalDeletionJob } from './principalDeletion.js'

describe('principal deletion job', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps completion fail-closed while retention remains unapproved', async () => {
    vi.mocked(completePrincipalDeletion).mockResolvedValueOnce({
      succeeded: false, idempotent: false, reason: 'RETENTION_UNAPPROVED',
    })
    await expect(runPrincipalDeletionAttempt('principal-1', false, new Date('2026-07-28T00:00:00Z')))
      .resolves.toMatchObject({ succeeded: false, reason: 'RETENTION_UNAPPROVED' })
    expect(completePrincipalDeletion).toHaveBeenCalledWith(expect.objectContaining({
      principalId: 'principal-1', retentionApproved: false,
    }))
  })

  it('completes due principals when retention approval is explicit', async () => {
    const now = new Date('2026-07-28T00:00:00Z')
    vi.mocked(listDuePrincipalDeletionIds).mockResolvedValueOnce(['principal-1', 'principal-2'])
    vi.mocked(completePrincipalDeletion)
      .mockResolvedValueOnce({ succeeded: true, idempotent: false })
      .mockResolvedValueOnce({ succeeded: true, idempotent: false })

    await expect(runPrincipalDeletionJob({ retentionApproved: true, now, batchSize: 2 }))
      .resolves.toEqual({ dueCount: 2, completedCount: 2, blocked: [], failures: [] })
    expect(listDuePrincipalDeletionIds).toHaveBeenCalledWith({ dueAt: now, limit: 2 })
    expect(completePrincipalDeletion).toHaveBeenCalledTimes(2)
    expect(completePrincipalDeletion).toHaveBeenCalledWith(expect.objectContaining({
      principalId: 'principal-1', retentionApproved: true, completedAt: now,
    }))
  })

  it('reports ownership blocks and isolated failures without skipping remaining due principals', async () => {
    vi.mocked(listDuePrincipalDeletionIds).mockResolvedValueOnce([
      'principal-owned', 'principal-error', 'principal-complete',
    ])
    vi.mocked(completePrincipalDeletion)
      .mockResolvedValueOnce({ succeeded: false, idempotent: false, reason: 'OWNERSHIP_UNRESOLVED' })
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({ succeeded: true, idempotent: false })

    await expect(runPrincipalDeletionJob({ retentionApproved: true }))
      .resolves.toEqual({
        dueCount: 3,
        completedCount: 1,
        blocked: [{ principalId: 'principal-owned', reason: 'OWNERSHIP_UNRESOLVED' }],
        failures: [{ principalId: 'principal-error', message: 'Principal deletion attempt failed.' }],
      })
  })

  it('rejects an unbounded batch size', async () => {
    await expect(runPrincipalDeletionJob({ retentionApproved: true, batchSize: 501 }))
      .rejects.toThrow('between 1 and 500')
    expect(listDuePrincipalDeletionIds).not.toHaveBeenCalled()
  })
})