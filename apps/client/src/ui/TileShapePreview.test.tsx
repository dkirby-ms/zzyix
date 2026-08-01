import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TileShapePreview } from './TileShapePreview'
import { TILE_SHAPES, type TileShape } from '../domain/tileGeometry'
import { createTilePreviewPath } from './tileShapePreviewGeometry'

const extractCoordinates = (pathData: string): number[] => {
  const matches = pathData.match(/-?\d+(?:\.\d+)?/g)
  return matches ? matches.map(Number) : []
}

describe('TileShapePreview', () => {
  const cases: TileShape[] = [
    'square',
    'triangle',
    'rectangle',
    'l-shape',
    'large-square',
    'circle',
    'right-triangle',
    'large-right-triangle',
  ]

  it('covers all canonical tile shapes for preview rendering', () => {
    expect(cases).toEqual(TILE_SHAPES)
  })

  it.each(cases)('renders an inline svg preview for %s', (shape) => {
    const { container } = render(<TileShapePreview shape={shape} size={72} />)

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.tagName.toLowerCase()).toBe('svg')

    const path = svg?.querySelector('path')
    expect(path).not.toBeNull()
    expect(path?.getAttribute('d')).toMatch(/^M\s.+\sZ$/)
    expect(path?.getAttribute('d')).toBe(createTilePreviewPath(shape, { size: 72, padding: 6 }))
  })

  it.each(cases)('generates a normalized path for %s within padded bounds', (shape) => {
    const size = 72
    const padding = 6
    const pathData = createTilePreviewPath(shape, { size, padding })

    expect(pathData).not.toContain('NaN')
    expect(pathData).not.toContain('Infinity')

    const coords = extractCoordinates(pathData)
    const xs = coords.filter((_, index) => index % 2 === 0)
    const ys = coords.filter((_, index) => index % 2 === 1)

    expect(xs.length).toBeGreaterThan(0)
    expect(ys.length).toBeGreaterThan(0)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(padding)
    expect(Math.max(...xs)).toBeLessThanOrEqual(size - padding)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(padding)
    expect(Math.max(...ys)).toBeLessThanOrEqual(size - padding)
  })

  it('marks the preview as decorative', () => {
    const { container } = render(<TileShapePreview shape="square" />)

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
  })
})
