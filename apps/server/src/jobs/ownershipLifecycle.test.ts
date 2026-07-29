import { describe, expect, it, vi } from 'vitest'

vi.mock('../db', () => ({ expireOwnershipTransfers: vi.fn() }))

import { expireOwnershipTransfers } from '../db/index.js'
import { runOwnershipLifecyclePass } from './ownershipLifecycle.js'

describe('ownership lifecycle job', () => {
  it('expires transfers using the supplied pass timestamp', async () => {
    const now = new Date('2026-07-28T00:00:00Z')
    vi.mocked(expireOwnershipTransfers).mockResolvedValueOnce(2)

    await expect(runOwnershipLifecyclePass(now)).resolves.toEqual({ expiredTransfers: 2 })
    expect(expireOwnershipTransfers).toHaveBeenCalledWith(now)
  })
})