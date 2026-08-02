import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MinimapOverlay } from './MinimapOverlay'

afterEach(() => {
  cleanup()
})

const setTrackRect = (element: HTMLElement, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): void => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  })
}

describe('MinimapOverlay', () => {
  it('pans the camera when clicking on the minimap track', () => {
    const onPanTo = vi.fn()

    render(
      <MinimapOverlay
        worldBounds={{ minX: 0, maxX: 100, minY: 0, maxY: 100 }}
        viewport={{
          center: { x: 50, y: 50 },
          viewport: { minX: 40, maxX: 60, minY: 40, maxY: 60 },
        }}
        tiles={[
          { id: 'tile-1', shape: 'square', color: '#112233', position: { x: 5, y: 95 }, rotation: 0 },
          { id: 'tile-2', shape: 'triangle', color: '#334455', position: { x: 95, y: 5 }, rotation: Math.PI / 2, mirrored: true },
        ]}
        onPanTo={onPanTo}
      />,
    )

    expect(screen.getByLabelText('Whole quilt preview').querySelectorAll('path')).toHaveLength(2)

    const track = screen.getByLabelText('Drag or click to pan the canvas')
    setTrackRect(track, { left: 10, top: 20, width: 200, height: 100 })

    fireEvent.pointerDown(track, { clientX: 110, clientY: 70 })

    expect(onPanTo).toHaveBeenCalledWith({ x: 50, y: 50 })
  })

  it('renders quilt-wide occupancy separately from cached tile geometry', () => {
    render(
      <MinimapOverlay
        worldBounds={{ minX: 0, maxX: 32, minY: 0, maxY: 32 }}
        viewport={null}
        occupancy={[
          { chunkId: '0:0', tileCount: 2 },
          { chunkId: '3:3', tileCount: 8 },
        ]}
        chunkWorldSize={8}
        tiles={[]}
        onPanTo={vi.fn()}
      />,
    )

    const preview = screen.getByLabelText('Whole quilt preview')
    expect(preview.querySelectorAll('rect.minimap-occupancy')).toHaveLength(2)
    expect(preview.querySelector('[data-tile-count="8"]')).toHaveAttribute('x', '75')
    expect(preview.querySelectorAll('path.minimap-tile')).toHaveLength(0)
  })

  it('drags the viewport frame to pan quickly', () => {
    const onPanTo = vi.fn()

    render(
      <MinimapOverlay
        worldBounds={{ minX: 0, maxX: 100, minY: 0, maxY: 100 }}
        viewport={{
          center: { x: 50, y: 50 },
          viewport: { minX: 40, maxX: 60, minY: 40, maxY: 60 },
        }}
        onPanTo={onPanTo}
      />,
    )

    const track = screen.getByLabelText('Drag or click to pan the canvas')
    setTrackRect(track, { left: 10, top: 20, width: 200, height: 100 })

    const viewport = screen.getByLabelText('Current viewport')
    fireEvent.pointerDown(viewport, { clientX: 110, clientY: 70 })
    fireEvent.pointerMove(window, { clientX: 210, clientY: 70 })

    expect(onPanTo).toHaveBeenLastCalledWith({ x: 100, y: 50 })
  })

  it('exposes zoom controls without assigned-patch marker', () => {
    const onZoomTo = vi.fn()

    render(
      <MinimapOverlay
        worldBounds={{ minX: 0, maxX: 100, minY: 0, maxY: 100 }}
        viewport={{
          center: { x: 50, y: 50 },
          viewport: { minX: 40, maxX: 60, minY: 40, maxY: 60 },
        }}
        cameraZoom={60}
        zoomRange={{ min: 20, max: 140 }}
        onZoomTo={onZoomTo}
        onPanTo={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('Your assigned patch')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))

    expect(onZoomTo).toHaveBeenNthCalledWith(1, 69)
    expect(onZoomTo).toHaveBeenNthCalledWith(2, 51)
  })

  it('allows minimizing and expanding the minimap overlay', () => {
    render(
      <MinimapOverlay
        worldBounds={{ minX: 0, maxX: 100, minY: 0, maxY: 100 }}
        viewport={{
          center: { x: 50, y: 50 },
          viewport: { minX: 40, maxX: 60, minY: 40, maxY: 60 },
        }}
        onPanTo={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Drag or click to pan the canvas')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Minimize minimap' }))

    expect(screen.queryByLabelText('Drag or click to pan the canvas')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand minimap' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand minimap' }))

    expect(screen.getByLabelText('Drag or click to pan the canvas')).toBeInTheDocument()
  })
})
