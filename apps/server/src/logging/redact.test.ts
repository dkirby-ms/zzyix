import { describe, expect, it } from 'vitest'
import { redactTelemetry } from './redact.js'

describe('telemetry redaction', () => {
  it('redacts credentials and external identity fields recursively', () => {
    expect(redactTelemetry({
      requestId: 'request-1',
      authorization: 'Bearer secret',
      identity: { externalSubject: 'provider-id', email: 'user@example.test' },
      result: { accessToken: 'secret-token', outcome: 'denied' },
    })).toEqual({
      requestId: 'request-1',
      authorization: '[redacted]',
      identity: { externalSubject: '[redacted]', email: '[redacted]' },
      result: { accessToken: '[redacted]', outcome: 'denied' },
    })
  })

  it('preserves safe correlation, replica, policy, operation, and outcome fields', () => {
    expect(redactTelemetry({
      requestId: 'request-1',
      socketId: 'socket-1',
      operationId: 'operation-1',
      replicaId: 'replica-a',
      policyVersion: 1,
      outcome: 'accepted',
    })).toEqual({
      requestId: 'request-1',
      socketId: 'socket-1',
      operationId: 'operation-1',
      replicaId: 'replica-a',
      policyVersion: 1,
      outcome: 'accepted',
    })
  })
})