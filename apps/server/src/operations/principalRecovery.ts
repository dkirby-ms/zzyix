import { randomUUID } from 'node:crypto'
import { cancelOwnershipTransfer, recoverPrincipalDeletion } from '../db/index.js'

export type PrincipalRecoveryInput = {
  action: 'recover-principal' | 'cancel-transfer'
  targetId: string
  operatorId: string
  supportTicket: string
  reason: string
  operationId?: string
}

const requiredText = (value: string, name: string): string => {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}

export const runPrincipalRecovery = async (input: PrincipalRecoveryInput) => {
  const operationId = input.operationId ?? randomUUID()
  const targetId = requiredText(input.targetId, 'targetId')
  const operationalContext = {
    operatorId: requiredText(input.operatorId, 'operatorId'),
    supportTicket: requiredText(input.supportTicket, 'supportTicket'),
    reason: requiredText(input.reason, 'reason'),
  }

  if (input.action === 'recover-principal') {
    return recoverPrincipalDeletion({
      operationId,
      principalId: targetId,
      sourceChannel: 'operation',
      operationalContext,
    })
  }
  if (input.action === 'cancel-transfer') {
    return cancelOwnershipTransfer({
      operationId,
      transferId: targetId,
      sourceChannel: 'operation',
      operationalContext,
    })
  }
  throw new Error('Unsupported recovery action')
}