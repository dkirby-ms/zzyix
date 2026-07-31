import { expireOwnershipTransfers } from '../db/index.js'

export const runOwnershipLifecyclePass = async (now: Date = new Date()): Promise<{ expiredTransfers: number }> => ({
  expiredTransfers: await expireOwnershipTransfers(now),
})