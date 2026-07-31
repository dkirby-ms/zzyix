import { describe, expect, it, vi } from 'vitest'
import { parseCanonicalWorldArguments, runCanonicalWorldCli } from './selectCanonicalWorld.js'

const provisionArguments = [
  '--action', 'provision',
  '--expected-generation', '0',
  '--patch-rows', '32',
  '--patch-columns', '32',
  '--patch-width', '31.2',
  '--patch-height', '20.4',
  '--origin-x', '0',
  '--origin-y', '0',
  '--operator-id', 'operator-1',
  '--reason', 'initial provision',
]

describe('canonical world CLI parsing', () => {
  it('parses the fixed provision geometry before database access', () => {
    expect(parseCanonicalWorldArguments(provisionArguments)).toEqual({
      action: 'provision',
      expectedGeneration: 0,
      patchRows: 32,
      patchColumns: 32,
      patchWidth: 31.2,
      patchHeight: 20.4,
      originX: 0,
      originY: 0,
      operatorId: 'operator-1',
      reason: 'initial provision',
    })
  })

  it.each([
    [...provisionArguments, '--patch-rows', '32'],
    [...provisionArguments, '--unknown', 'value'],
    provisionArguments.map((value) => value === '32' ? '-1' : value),
    provisionArguments.map((value) => value === '31.2' ? 'Infinity' : value),
    ['--action', 'status', '--reason', 'not compatible'],
    ['--action', 'activate', '--quilt-id', 'invalid', '--expected-generation', '1', '--operator-id', 'op', '--reason', 'go'],
    provisionArguments.map((value, index) => provisionArguments[index - 1] === '--operator-id' ? ' ' : value),
  ])('rejects invalid, duplicate, unknown, or action-incompatible arguments', (argv) => {
    expect(() => parseCanonicalWorldArguments(argv)).toThrow()
  })
})

describe('canonical world CLI machine output', () => {
  it('writes one versioned success object and always closes the database bundle', async () => {
    const result = {
      schemaVersion: 1 as const,
      action: 'status' as const,
      result: 'succeeded' as const,
      idempotent: false,
      productKey: 'canonical' as const,
      pointerStatus: 'missing' as const,
      generation: 0,
    }
    const dependencies = {
      status: vi.fn().mockResolvedValue(result),
      provision: vi.fn(),
      activate: vi.fn(),
      deactivate: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const output = { log: vi.fn(), error: vi.fn() }

    await expect(runCanonicalWorldCli(['--action', 'status'], dependencies, output)).resolves.toBe(0)
    expect(output.log).toHaveBeenCalledTimes(1)
    expect(JSON.parse(output.log.mock.calls[0][0])).toEqual(result)
    expect(output.error).not.toHaveBeenCalled()
    expect(dependencies.close).toHaveBeenCalledOnce()
  })

  it('rejects usage before any repository operation and emits only safe fields', async () => {
    const dependencies = {
      status: vi.fn(),
      provision: vi.fn(),
      activate: vi.fn(),
      deactivate: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const output = { log: vi.fn(), error: vi.fn() }

    await expect(runCanonicalWorldCli(['--action', 'activate'], dependencies, output)).resolves.toBe(1)
    expect(dependencies.activate).not.toHaveBeenCalled()
    expect(JSON.parse(output.error.mock.calls[0][0])).toEqual({
      schemaVersion: 1,
      action: 'activate',
      result: 'failed',
      message: 'Invalid canonical world command arguments.',
      code: 'usage_error',
    })
    expect(dependencies.close).toHaveBeenCalledOnce()
  })

  it('maps cleanup failures to one safe database error without writing success', async () => {
    const dependencies = {
      status: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        action: 'status',
        result: 'succeeded',
        idempotent: false,
        productKey: 'canonical',
        pointerStatus: 'missing',
        generation: 0,
      }),
      provision: vi.fn(),
      activate: vi.fn(),
      deactivate: vi.fn(),
      close: vi.fn().mockRejectedValue(new Error('connection details')),
    }
    const output = { log: vi.fn(), error: vi.fn() }

    await expect(runCanonicalWorldCli(['--action', 'status'], dependencies, output)).resolves.toBe(1)
    expect(output.log).not.toHaveBeenCalled()
    expect(JSON.parse(output.error.mock.calls[0][0])).toEqual({
      schemaVersion: 1,
      action: 'status',
      result: 'failed',
      message: 'Canonical world database operation failed.',
      code: 'database_error',
    })
  })
})