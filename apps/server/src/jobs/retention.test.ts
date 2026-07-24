import { describe, expect, it, vi } from 'vitest'

vi.mock('../db', () => ({
  pruneRetention: vi.fn(),
}))

import { pruneRetention } from '../db/index.js'
import { runRetentionPass } from './retention.js'

describe('retention job', () => {
  it('returns idempotency key cleanup counts from pruneRetention', async () => {
    vi.mocked(pruneRetention).mockResolvedValueOnce({
      deletedOperations: 1,
      deletedSnapshots: 2,
      deletedIdempotencyKeys: 3,
      deletedChatMessages: 4,
    })

    const result = await runRetentionPass()

    expect(pruneRetention).toHaveBeenCalledOnce()
    expect(pruneRetention).toHaveBeenCalledWith(expect.objectContaining({
      chatCutoffMs: expect.any(Number),
    }))
    expect(result).toEqual({
      deletedOperations: 1,
      deletedSnapshots: 2,
      deletedIdempotencyKeys: 3,
      deletedChatMessages: 4,
    })
  })
})
