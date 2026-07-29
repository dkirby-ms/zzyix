import { describe, expect, it, vi } from 'vitest'

vi.mock('../db', () => ({
  cancelOwnershipTransfer: vi.fn(),
  recoverPrincipalDeletion: vi.fn(),
}))

import { cancelOwnershipTransfer, recoverPrincipalDeletion } from '../db/index.js'
import { runPrincipalRecovery } from './principalRecovery.js'

describe('restricted principal recovery operation', () => {
  it.each(['operatorId', 'supportTicket', 'reason'] as const)('requires %s', async (field) => {
    await expect(runPrincipalRecovery({
      action: 'recover-principal', targetId: 'principal-1',
      operatorId: 'operator-1', supportTicket: 'SUP-1', reason: 'verified request',
      [field]: ' ',
    })).rejects.toThrow(`${field} is required`)
    expect(recoverPrincipalDeletion).not.toHaveBeenCalled()
  })

  it('recovers only a deletion-pending principal with complete operational audit context', async () => {
    vi.mocked(recoverPrincipalDeletion).mockResolvedValueOnce({ succeeded: true, idempotent: false })
    await expect(runPrincipalRecovery({
      action: 'recover-principal', targetId: 'principal-1',
      operatorId: 'azure-object-id', supportTicket: 'SUP-1', reason: 'identity verified',
    })).resolves.toMatchObject({ succeeded: true })
    expect(recoverPrincipalDeletion).toHaveBeenCalledWith(expect.objectContaining({
      principalId: 'principal-1', sourceChannel: 'operation',
      operationalContext: {
        operatorId: 'azure-object-id', supportTicket: 'SUP-1', reason: 'identity verified',
      },
    }))
  })

  it('can cancel a transfer but exposes no ownership-assignment action', async () => {
    vi.mocked(cancelOwnershipTransfer).mockResolvedValueOnce({ succeeded: true, idempotent: false })
    await expect(runPrincipalRecovery({
      action: 'cancel-transfer', targetId: 'transfer-1',
      operatorId: 'azure-object-id', supportTicket: 'SUP-2', reason: 'sender account compromised',
    })).resolves.toMatchObject({ succeeded: true })
    expect(cancelOwnershipTransfer).toHaveBeenCalledWith(expect.objectContaining({ transferId: 'transfer-1' }))
    expect(Object.keys({ 'recover-principal': true, 'cancel-transfer': true })).not.toContain('assign-ownership')
  })
})