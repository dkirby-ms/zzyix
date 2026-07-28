import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { MosaicScene } from './MosaicScene'
import { resolveDisplayHitPoint } from './periodicImages'

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
}))

afterEach(() => {
  cleanup()
})

describe('MosaicScene interaction plane', () => {
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
})