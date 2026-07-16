import cron, { type ScheduledTask } from 'node-cron'
import { pruneRetention } from '../db'

const DEFAULT_RETENTION_CRON = process.env.RETENTION_CRON ?? '0 * * * *'
const DEFAULT_OPERATION_RETENTION_MS = Number(process.env.OPERATION_RETENTION_MS ?? 7 * 24 * 60 * 60 * 1000)
const DEFAULT_SNAPSHOT_RETENTION_MS = Number(process.env.SNAPSHOT_RETENTION_MS ?? 30 * 24 * 60 * 60 * 1000)

export const runRetentionPass = async (): Promise<{ deletedOperations: number; deletedSnapshots: number }> =>
  // Idempotency key TTL cleanup currently occurs in DB-level expiry checks.
  // Retention currently prunes snapshots and operation logs only; if explicit
  // key deletion is added later, it should be wired into this pass.
  pruneRetention({
    operationCutoffMs: DEFAULT_OPERATION_RETENTION_MS,
    snapshotCutoffMs: DEFAULT_SNAPSHOT_RETENTION_MS,
  })

export const startRetentionJob = (): ScheduledTask =>
  cron.schedule(DEFAULT_RETENTION_CRON, async () => {
    try {
      await runRetentionPass()
    } catch (error) {
      console.error('[retention] prune failed', error)
    }
  })