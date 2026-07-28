import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureQuiltTelemetry, emitQuiltTelemetry } from './quiltTelemetry.js'

afterEach(() => configureQuiltTelemetry())

describe('quilt migration telemetry', () => {
  it('delivers raw measurements and cohort dimensions to the configured observer', () => {
    const observer = vi.fn()
    configureQuiltTelemetry(observer)
    const event = {
      name: 'client_runtime' as const,
      quiltId: 'quilt-a',
      principalId: 'principal-a',
      canary: true,
      measurements: { frameTimeMs: 16.4, drawCalls: 12 },
    }

    emitQuiltTelemetry(event)

    expect(observer).toHaveBeenCalledWith(event)
  })

  it('does not affect callers when no observer is configured', () => {
    configureQuiltTelemetry()
    expect(() => emitQuiltTelemetry({
      name: 'pool_wait',
      canary: false,
      measurements: { waitingClients: 0 },
    })).not.toThrow()
  })
})