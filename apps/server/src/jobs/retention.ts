import cron, { type ScheduledTask } from 'node-cron'
import { pruneRetention } from '../db/index.js'
import { CHAT_CONFIG } from '../contracts.js'

const DEFAULT_RETENTION_CRON = process.env.RETENTION_CRON ?? '0 * * * *'
const DEFAULT_OPERATION_RETENTION_MS = Number(process.env.OPERATION_RETENTION_MS ?? 7 * 24 * 60 * 60 * 1000)
const DEFAULT_SNAPSHOT_RETENTION_MS = Number(process.env.SNAPSHOT_RETENTION_MS ?? 30 * 24 * 60 * 60 * 1000)
const DEFAULT_CHAT_RETENTION_MS = Number(process.env.CHAT_RETENTION_MS ?? CHAT_CONFIG.retentionDays * 24 * 60 * 60 * 1000)

export const runRetentionPass = async (): Promise<{
  deletedOperations: number
  deletedSnapshots: number
  deletedIdempotencyKeys: number
  deletedChatMessages: number
}> =>
  // Retention prunes snapshots, operation logs, and expired idempotency keys.
  pruneRetention({
    operationCutoffMs: DEFAULT_OPERATION_RETENTION_MS,
    snapshotCutoffMs: DEFAULT_SNAPSHOT_RETENTION_MS,
    chatCutoffMs: DEFAULT_CHAT_RETENTION_MS,
  })

export const startRetentionJob = (): ScheduledTask =>
  cron.schedule(DEFAULT_RETENTION_CRON, async () => {
    try {
      await runRetentionPass()
    } catch (error) {
      console.error('[retention] prune failed', error)
    }
  })