import { describe, expect, it, vi } from 'vitest'

vi.mock('../db', () => ({
  persistRetentionPatchSnapshots: vi.fn(),
  pruneRetention: vi.fn(),
}))

import { persistRetentionPatchSnapshots, pruneRetention } from '../db/index.js'
import { runRetentionPass } from './retention.js'

describe('retention job', () => {
  it('returns idempotency key cleanup counts from pruneRetention', async () => {
    vi.mocked(persistRetentionPatchSnapshots).mockResolvedValueOnce(4)
    vi.mocked(pruneRetention).mockResolvedValueOnce({
      deletedOperations: 1,
      deletedSnapshots: 2,
      deletedIdempotencyKeys: 3,
    })

    const result = await runRetentionPass()

    expect(pruneRetention).toHaveBeenCalledOnce()
    expect(persistRetentionPatchSnapshots).toHaveBeenCalledOnce()
    expect(result).toEqual({
      deletedOperations: 1,
      deletedSnapshots: 2,
      deletedIdempotencyKeys: 3,
      createdPatchSnapshots: 4,
    })
  })
})
