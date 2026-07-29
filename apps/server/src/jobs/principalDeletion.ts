import { randomUUID } from 'node:crypto'
import {
  completePrincipalDeletion,
  listDuePrincipalDeletionIds,
  type PrincipalDeletionResult,
} from '../db/index.js'

const DEFAULT_BATCH_SIZE = 100
const MAX_BATCH_SIZE = 500

export type PrincipalDeletionJobReport = {
  dueCount: number
  completedCount: number
  blocked: Array<{ principalId: string; reason: PrincipalDeletionResult['reason'] }>
  failures: Array<{ principalId: string; message: string }>
}

export const runPrincipalDeletionAttempt = async (
  principalId: string,
  retentionApproved: boolean,
  now: Date = new Date(),
) =>
  completePrincipalDeletion({
    operationId: randomUUID(),
    principalId,
    retentionApproved,
    completedAt: now,
  })

export const runPrincipalDeletionJob = async (params: {
  retentionApproved: boolean
  now?: Date
  batchSize?: number
}): Promise<PrincipalDeletionJobReport> => {
  const now = params.now ?? new Date()
  const batchSize = params.batchSize ?? DEFAULT_BATCH_SIZE
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`Principal deletion batch size must be an integer between 1 and ${MAX_BATCH_SIZE}.`)
  }

  const principalIds = await listDuePrincipalDeletionIds({ dueAt: now, limit: batchSize })
  const report: PrincipalDeletionJobReport = {
    dueCount: principalIds.length,
    completedCount: 0,
    blocked: [],
    failures: [],
  }
  for (const principalId of principalIds) {
    try {
      const result = await runPrincipalDeletionAttempt(principalId, params.retentionApproved, now)
      if (result.succeeded) report.completedCount += 1
      else report.blocked.push({ principalId, reason: result.reason })
    } catch {
      report.failures.push({
        principalId,
        message: 'Principal deletion attempt failed.',
      })
    }
  }
  return report
}