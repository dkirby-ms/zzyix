import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { MosaicScene } from './MosaicScene'
import { enumerateCameraTileImages, resolveDisplayHitPoint } from './periodicImages'

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: ReactNode }) => <div data-testid="canvas-root">{children}</div>,
  useFrame: vi.fn(),
  useThree: vi.fn(() => ({
    camera: { position: { x: 0, y: 0 }, zoom: 1 },
    size: { width: 960, height: 720 },
  })),
}))

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Html: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

afterEach(() => {
  cleanup()
})

describe('MosaicScene interaction plane', () => {
  it('changes periodic image enumeration with camera zoom and aspect without shifting shared images', () => {
    const topology = { patchRows: 1, patchColumns: 1, patchWidth: 10, patchHeight: 10 }
    const tile = {
      id: 'tile-a', shape: 'square' as const, color: '#fff', material: 'ceramic' as const,
      transform: { position: { x: 0.2, y: 0.3 }, rotation: 0 }, createdAt: 1,
    }
    const wide = enumerateCameraTileImages([tile], { x: 10, y: 10 }, 20, { width: 960, height: 480 }, topology)
    const tall = enumerateCameraTileImages([tile], { x: 10, y: 10 }, 20, { width: 480, height: 960 }, topology)
    const zoomed = enumerateCameraTileImages([tile], { x: 10, y: 10 }, 80, { width: 960, height: 480 }, topology)

    expect(wide.map(({ key }) => key)).not.toEqual(tall.map(({ key }) => key))
    expect(zoomed.length).toBeLessThan(wide.length)

    const zoomedByKey = new Map(zoomed.map((image) => [image.key, image.position]))
    for (const image of wide) {
      if (zoomedByKey.has(image.key)) expect(zoomedByKey.get(image.key)).toEqual(image.position)
    }
  })

  it('canonicalizes alias hits exactly once for toroidal scenes', () => {
    expect(resolveDisplayHitPoint(
      { x: 20.25, y: -0.5 },
      { patchRows: 1, patchColumns: 2, patchWidth: 10, patchHeight: 10 },
    )).toEqual({ x: 0.25, y: 9.5 })
  })
  it('routes right-drag motion into rotate drag callbacks', () => {
    const onRotateDrag = vi.fn()
    const onPointerMove = vi.fn()
    const onPointerDown = vi.fn()
    const onPointerUp = vi.fn()

    const { getByTestId } = render(
      <MosaicScene
        tiles={[]}
        clientId="client-1"
        ownershipIdentity="client-1"
        activeShape="square"
        ghost={{
          transform: { position: { x: 0, y: 0 }, rotation: 0, mirrored: false },
          confidence: 'valid',
          color: '#d4614f',
          material: 'ceramic',
          visible: false,
        }}
        remoteCursors={[]}
        remoteSelections={[]}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onRotateDrag={onRotateDrag}
        onCameraPan={vi.fn()}
        cameraPan={{ x: 0, y: 0 }}
      />,
    )

    expect(getByTestId('canvas-root')).toBeInTheDocument()

    const interactionPlane = getByTestId('interaction-plane')

    fireEvent.pointerDown(interactionPlane, { button: 2, buttons: 2, clientX: 40, clientY: 20, pointerId: 1 })
    fireEvent.pointerMove(interactionPlane, { buttons: 2, movementX: 18, pointerId: 1 })
    fireEvent.pointerUp(interactionPlane, { button: 2, buttons: 0, pointerId: 1 })

    expect(onRotateDrag).toHaveBeenCalledWith(18)
    expect(onPointerMove).not.toHaveBeenCalled()
    expect(onPointerDown).not.toHaveBeenCalled()
    expect(onPointerUp).not.toHaveBeenCalled()
  })

  it('routes middle-drag motion into camera pan callbacks', () => {
    const onRotateDrag = vi.fn()
    const onCameraPan = vi.fn()
    const onPointerMove = vi.fn()
    const onPointerDown = vi.fn()
    const onPointerUp = vi.fn()

    const { getByTestId } = render(
      <MosaicScene
        tiles={[]}
        clientId="client-1"
        ownershipIdentity="client-1"
        activeShape="square"
        ghost={{
          transform: { position: { x: 0, y: 0 }, rotation: 0, mirrored: false },
          confidence: 'valid',
          color: '#d4614f',
          material: 'ceramic',
          visible: false,
        }}
        remoteCursors={[]}
        remoteSelections={[]}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onRotateDrag={onRotateDrag}
        onCameraPan={onCameraPan}
        cameraPan={{ x: 0, y: 0 }}
      />,
    )

    const interactionPlane = getByTestId('interaction-plane')

    fireEvent.pointerDown(interactionPlane, { button: 1, buttons: 4, clientX: 90, clientY: 60, pointerId: 2 })
    fireEvent.pointerMove(interactionPlane, { buttons: 4, clientX: 114, clientY: 48, pointerId: 2 })
    fireEvent.pointerUp(interactionPlane, { button: 1, buttons: 0, pointerId: 2 })

    expect(onCameraPan).toHaveBeenCalledWith(24, -12)
    expect(onRotateDrag).not.toHaveBeenCalled()
    expect(onPointerMove).not.toHaveBeenCalled()
    expect(onPointerDown).not.toHaveBeenCalled()
    expect(onPointerUp).not.toHaveBeenCalled()
  })

  it('outlines tiles placed by other users without outlining local tiles', () => {
    const tile = {
      id: 'tile-a', shape: 'square' as const, color: '#fff', material: 'ceramic' as const,
      transform: { position: { x: 0.2, y: 0.3 }, rotation: 0 }, createdAt: 1,
    }

    const { container } = render(
      <MosaicScene
        tiles={[
          { ...tile, id: 'local-tile', placedBy: 'client-1' },
          { ...tile, id: 'remote-tile', placedBy: 'client-2' },
        ]}
        clientId="client-1"
        ownershipIdentity="client-1"
        activeShape="square"
        ghost={{
          transform: { position: { x: 0, y: 0 }, rotation: 0, mirrored: false },
          confidence: 'valid',
          color: '#d4614f',
          material: 'ceramic',
          visible: false,
        }}
        remoteCursors={[]}
        remoteSelections={[]}
        onPointerMove={vi.fn()}
        onPointerDown={vi.fn()}
        onPointerUp={vi.fn()}
        onRotateDrag={vi.fn()}
        onCameraPan={vi.fn()}
        cameraPan={{ x: 0, y: 0 }}
      />,
    )

    expect(container.querySelector('[data-owner-boundary="client-2"]')).toBeInTheDocument()
    expect(container.querySelector('[data-owner-boundary="client-1"]')).not.toBeInTheDocument()
  })

  it('renders witness signals separately and preserves canonical scene inputs', () => {
    const tiles = Object.freeze([Object.freeze({
      id: 'artist-tile',
      shape: 'square' as const,
      color: '#fff',
      material: 'ceramic' as const,
      transform: Object.freeze({ position: Object.freeze({ x: 0, y: 0 }), rotation: 0, mirrored: false }),
      createdAt: 1,
      placedBy: 'artist-1',
    })])
    const remoteCursors = Object.freeze([Object.freeze({ clientId: 'artist-2', position: Object.freeze({ x: 1, y: 1 }) })])
    const remoteSelections = Object.freeze([Object.freeze({ clientId: 'artist-2', tileId: 'artist-tile' })])
    const cameraPan = Object.freeze({ x: 0, y: 0 })
    const witnessSignals = Object.freeze([Object.freeze({
      id: 'fantome-witness-scene',
      kind: 'glyph' as const,
      anchor: Object.freeze({ x: 2, y: 2 }),
      residentId: 'fantome' as const,
      label: 'Fantome observed this area.',
      source: 'prototype-fixture' as const,
    })])
    const onWitnessDetail = vi.fn()

    const { container, getByRole } = render(
      <MosaicScene
        tiles={tiles}
        witnessSignals={witnessSignals}
        onWitnessDetail={onWitnessDetail}
        clientId="client-1"
        ownershipIdentity="client-1"
        activeShape="square"
        ghost={{
          transform: { position: { x: 0, y: 0 }, rotation: 0, mirrored: false },
          confidence: 'valid',
          color: '#d4614f',
          material: 'ceramic',
          visible: false,
        }}
        remoteCursors={remoteCursors}
        remoteSelections={remoteSelections}
        onPointerMove={vi.fn()}
        onPointerDown={vi.fn()}
        onPointerUp={vi.fn()}
        onRotateDrag={vi.fn()}
        onCameraPan={vi.fn()}
        cameraPan={cameraPan}
      />,
    )

    expect(container.querySelector('[data-canonical-id="artist-tile"]')).toBeInTheDocument()
    expect(container.querySelector('[data-witness-signal="fantome-witness-scene"]')).toBeInTheDocument()
    fireEvent.click(getByRole('button', { name: /Fantome resident witness mark/ }))
    expect(onWitnessDetail).toHaveBeenCalledWith(witnessSignals[0])
    expect(tiles[0].placedBy).toBe('artist-1')
    expect(remoteCursors[0].position).toEqual({ x: 1, y: 1 })
    expect(remoteSelections[0]).toEqual({ clientId: 'artist-2', tileId: 'artist-tile' })
    expect(cameraPan).toEqual({ x: 0, y: 0 })
    expect(witnessSignals[0].anchor).toEqual({ x: 2, y: 2 })
  })

  it('mounts settled tiles at their authoritative transform without replaying placement motion', () => {
    const { container } = render(
      <MosaicScene
        tiles={[{
          id: 'settled-tile',
          shape: 'square',
          color: '#fff',
          material: 'ceramic',
          transform: { position: { x: 2.5, y: -1.25 }, rotation: Math.PI / 2, mirrored: true },
          createdAt: 1,
        }]}
        clientId="client-1"
        ownershipIdentity="client-1"
        activeShape="square"
        ghost={{
          transform: { position: { x: 0, y: 0 }, rotation: 0, mirrored: false },
          confidence: 'valid',
          color: '#d4614f',
          material: 'ceramic',
          visible: false,
        }}
        remoteCursors={[]}
        remoteSelections={[]}
        onPointerMove={vi.fn()}
        onPointerDown={vi.fn()}
        onPointerUp={vi.fn()}
        onRotateDrag={vi.fn()}
        onCameraPan={vi.fn()}
        cameraPan={{ x: 0, y: 0 }}
      />,
    )

    const tileGroup = container.querySelector('[data-canonical-id="settled-tile"] > group')
    expect(tileGroup).toHaveAttribute('position', '2.5,-1.25,0')
    expect(tileGroup).toHaveAttribute('rotation', `0,0,${Math.PI / 2}`)
    expect(tileGroup).toHaveAttribute('scale', '-1,1,1')
  })

  it('resets animation state when an optimistic tile becomes authoritative under the same id', () => {
    const props = {
      clientId: 'client-1',
      ownershipIdentity: 'client-1',
      activeShape: 'square' as const,
      ghost: {
        transform: { position: { x: 0, y: 0 }, rotation: 0, mirrored: false },
        confidence: 'valid' as const,
        color: '#d4614f',
        material: 'ceramic' as const,
        visible: false,
      },
      remoteCursors: [],
      remoteSelections: [],
      onPointerMove: vi.fn(),
      onPointerDown: vi.fn(),
      onPointerUp: vi.fn(),
      onRotateDrag: vi.fn(),
      onCameraPan: vi.fn(),
      cameraPan: { x: 0, y: 0 },
    }
    const optimisticTile = {
      id: 'same-tile',
      shape: 'square' as const,
      color: '#fff',
      material: 'ceramic' as const,
      transform: { position: { x: 2, y: 3 }, rotation: 0, mirrored: false },
      settleFrom: { position: { x: 1.5, y: 3 }, rotation: 0, mirrored: false },
      createdAt: Date.now(),
    }
    const { container, rerender } = render(<MosaicScene {...props} tiles={[optimisticTile]} />)
    const optimisticGroup = container.querySelector('[data-canonical-id="same-tile"]')

    rerender(<MosaicScene {...props} tiles={[{
      ...optimisticTile,
      settleFrom: undefined,
      createdAt: Date.now() + 5_000,
    }]} />)

    const settledGroup = container.querySelector('[data-canonical-id="same-tile"]')
    expect(settledGroup).not.toBe(optimisticGroup)
    expect(settledGroup?.querySelector('group')).toHaveAttribute('position', '2,3,0')
  })
})