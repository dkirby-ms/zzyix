import { describe, expect, it, vi } from 'vitest'
import { runCanonicalWorldInitializer } from './initializeCanonicalWorld.js'

const quilt = {
  id: '00000000-0000-4000-8000-000000000001',
  legacyCanvasId: '00000000-0000-4000-8000-000000000002',
  topology: 'toroidal' as const,
  protocolVersion: 2 as const,
  patchRows: 32,
  patchColumns: 32,
  patchWidth: 31.2,
  patchHeight: 20.4,
  originX: 0,
  originY: 0,
}

const status = (pointerStatus: 'missing' | 'inactive' | 'active', generation: number) => ({
  schemaVersion: 1 as const,
  action: 'status' as const,
  result: 'succeeded' as const,
  idempotent: false,
  productKey: 'canonical' as const,
  pointerStatus,
  generation,
  ...(pointerStatus === 'missing' ? {} : { quilt }),
})

const dependencies = (initialStatus: ReturnType<typeof status>) => ({
  status: vi.fn().mockResolvedValue(initialStatus),
  provision: vi.fn(),
  activate: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
})

describe('canonical world initializer', () => {
  it('provisions fixed geometry and activates the returned quilt for a missing pointer', async () => {
    const deps = dependencies(status('missing', 0))
    deps.provision.mockResolvedValue({ ...status('inactive', 1), action: 'provision' })
    deps.activate.mockResolvedValue({ ...status('active', 2), action: 'activate' })
    const output = { log: vi.fn(), error: vi.fn() }

    await expect(runCanonicalWorldInitializer(deps, output)).resolves.toBe(0)

    expect(deps.provision).toHaveBeenCalledWith(expect.objectContaining({
      expectedGeneration: 0,
      patchRows: 32,
      patchColumns: 32,
      patchWidth: 31.2,
      patchHeight: 20.4,
      originX: 0,
      originY: 0,
    }))
    expect(deps.activate).toHaveBeenCalledWith(expect.objectContaining({
      quiltId: quilt.id,
      expectedGeneration: 1,
    }))
    expect(JSON.parse(output.log.mock.calls[0][0])).toEqual(expect.objectContaining({
      result: 'succeeded',
      pointerStatus: 'active',
      generation: 2,
      quiltId: quilt.id,
    }))
    expect(deps.close).toHaveBeenCalledOnce()
  })

  it('activates an inactive validated target with its current generation', async () => {
    const deps = dependencies(status('inactive', 1))
    deps.activate.mockResolvedValue({ ...status('active', 2), action: 'activate' })

    await expect(runCanonicalWorldInitializer(deps, { log: vi.fn(), error: vi.fn() })).resolves.toBe(0)

    expect(deps.provision).not.toHaveBeenCalled()
    expect(deps.activate).toHaveBeenCalledWith(expect.objectContaining({ quiltId: quilt.id, expectedGeneration: 1 }))
  })

  it('leaves an active validated pointer unchanged', async () => {
    const deps = dependencies(status('active', 2))

    await expect(runCanonicalWorldInitializer(deps, { log: vi.fn(), error: vi.fn() })).resolves.toBe(0)

    expect(deps.provision).not.toHaveBeenCalled()
    expect(deps.activate).not.toHaveBeenCalled()
  })

  it('fails closed for an invalid target or unexpected pointer status', async () => {
    const deps = dependencies({ ...status('active', 2), quilt: undefined } as never)
    const output = { log: vi.fn(), error: vi.fn() }

    await expect(runCanonicalWorldInitializer(deps, output)).resolves.toBe(1)

    expect(JSON.parse(output.error.mock.calls[0][0])).toEqual({
      schemaVersion: 1,
      result: 'failed',
      message: 'Canonical world initialization failed.',
    })
    expect(deps.close).toHaveBeenCalledOnce()
  })
})