import { randomUUID } from 'node:crypto'
import { completePrincipalDeletion } from '../db/index.js'

export const runPrincipalDeletionAttempt = async (principalId: string, now: Date = new Date()) =>
  completePrincipalDeletion({
    operationId: randomUUID(),
    principalId,
    retentionApproved: false,
    completedAt: now,
  })