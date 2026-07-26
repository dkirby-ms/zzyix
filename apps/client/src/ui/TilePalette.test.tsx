import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { TilePalette } from './TilePalette'
import { TILE_SHAPES } from '../domain/tileGeometry'

const shapeLabelByToken = {
  square: 'Square',
  triangle: 'Triangle',
  rectangle: 'Rectangle',
  'l-shape': 'L-shape',
} as const

afterEach(() => {
  cleanup()
})

describe('TilePalette', () => {
  it('renders a radio-style single-select surface across all rows', () => {
    render(
      <TilePalette
        activeTile={{
          shape: 'square',
          color: '#d4614f',
          material: 'ceramic',
          rotation: 0,
          mirrored: false,
        }}
        onShape={vi.fn()}
        onMaterial={vi.fn()}
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    expect(screen.getByRole('complementary', { name: 'Tile palette controls' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Shape' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Material' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Palette' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Color' })).toBeInTheDocument()
  })

  it('renders an always-visible active selection summary', () => {
    render(
      <TilePalette
        activeTile={{
          shape: 'triangle',
          color: '#67aeb3',
          material: 'glass',
          rotation: 0,
          mirrored: false,
        }}
        onShape={vi.fn()}
        onMaterial={vi.fn()}
        paletteName="lagoon"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    expect(screen.getByRole('region', { name: 'Active selection summary' })).toBeInTheDocument()
    expect(screen.getByText('Shape: triangle')).toBeInTheDocument()
    expect(screen.getByText('Material: glass')).toBeInTheDocument()
    expect(screen.getByText('Palette: lagoon')).toBeInTheDocument()
    expect(screen.getByText('Color: #67aeb3')).toBeInTheDocument()
  })

  it('exposes selected state semantics on radio controls and swatches', () => {
    render(
      <TilePalette
        activeTile={{
          shape: 'triangle',
          color: '#67aeb3',
          material: 'glass',
          rotation: 0,
          mirrored: false,
        }}
        onShape={vi.fn()}
        onMaterial={vi.fn()}
        paletteName="lagoon"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    expect(screen.getByRole('radio', { name: 'Triangle' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'glass' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'lagoon' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Color #67aeb3' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Color #67aeb3' })).toHaveAttribute('data-state', 'on')
  })

  it('keeps shape radios accessible with visual preview cards', () => {
    render(
      <TilePalette
        activeTile={{
          shape: 'square',
          color: '#d4614f',
          material: 'ceramic',
          rotation: 0,
          mirrored: false,
        }}
        onShape={vi.fn()}
        onMaterial={vi.fn()}
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    const shapeGroup = screen.getByRole('radiogroup', { name: 'Shape' })

    for (const shape of TILE_SHAPES) {
      const radio = within(shapeGroup).getByRole('radio', { name: shapeLabelByToken[shape] })
      expect(radio).toBeInTheDocument()
      const preview = radio.querySelector('svg')
      expect(preview).not.toBeNull()
      expect(preview).toHaveAttribute('aria-hidden', 'true')
    }

    expect(screen.getByText('Square')).toBeInTheDocument()
    expect(screen.getByText('Triangle')).toBeInTheDocument()
    expect(screen.getByText('Rectangle')).toBeInTheDocument()
    expect(screen.getByText('L-shape')).toBeInTheDocument()
  })

  it('keeps shape option radios aligned with the canonical geometry list', () => {
    render(
      <TilePalette
        activeTile={{
          shape: 'square',
          color: '#d4614f',
          material: 'ceramic',
          rotation: 0,
          mirrored: false,
        }}
        onShape={vi.fn()}
        onMaterial={vi.fn()}
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    const shapeGroup = screen.getByRole('radiogroup', { name: 'Shape' })
    const renderedShapeOptions = within(shapeGroup)
      .getAllByRole('radio')
      .map((radio) => radio.getAttribute('aria-label'))

    expect(renderedShapeOptions).toEqual(TILE_SHAPES.map((shape) => shapeLabelByToken[shape]))
  })

  it('supports keyboard arrow navigation between shape radios', async () => {
    const onShape = vi.fn()

    render(
      <TilePalette
        activeTile={{
          shape: 'square',
          color: '#d4614f',
          material: 'ceramic',
          rotation: 0,
          mirrored: false,
        }}
        onShape={onShape}
        onMaterial={vi.fn()}
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    const square = screen.getByRole('radio', { name: 'Square' })

    square.focus()
    fireEvent.keyDown(square, { key: 'ArrowRight' })

    expect(onShape).toHaveBeenCalledWith('triangle')
  })

  it('supports keyboard Space/Enter activation on shape radios', () => {
    const onShape = vi.fn()

    render(
      <TilePalette
        activeTile={{
          shape: 'square',
          color: '#d4614f',
          material: 'ceramic',
          rotation: 0,
          mirrored: false,
        }}
        onShape={onShape}
        onMaterial={vi.fn()}
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    const triangle = screen.getByRole('radio', { name: 'Triangle' })
    const square = screen.getByRole('radio', { name: 'Square' })

    triangle.focus()
    fireEvent.keyDown(triangle, { key: 'Enter' })

    square.focus()
    fireEvent.keyDown(square, { key: ' ' })

    expect(onShape).toHaveBeenCalledWith('triangle')
    expect(onShape).toHaveBeenCalledWith('square')
  })

  it('emits selection callbacks from the single-select controls', () => {
    const onShape = vi.fn()
    const onMaterial = vi.fn()
    const onPaletteName = vi.fn()
    const onColor = vi.fn()

    render(
      <TilePalette
        activeTile={{
          shape: 'square',
          color: '#d4614f',
          material: 'ceramic',
          rotation: 0,
          mirrored: false,
        }}
        onShape={onShape}
        onMaterial={onMaterial}
        paletteName="terracotta"
        onPaletteName={onPaletteName}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={onColor}
        paletteFallbackAnnouncement=""
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))

    fireEvent.click(screen.getByRole('radio', { name: 'Triangle' }))
    fireEvent.click(screen.getByRole('radio', { name: 'glass' }))
    fireEvent.click(screen.getByRole('radio', { name: 'lagoon' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Color #eea655' }))

    expect(onShape).toHaveBeenCalledWith('triangle')
    expect(onMaterial).toHaveBeenCalledWith('glass')
    expect(onPaletteName).toHaveBeenCalledWith('lagoon')
    expect(onColor).toHaveBeenCalledWith('#eea655')
  })

  it('toggles palette body visibility from the header button', () => {
    const onTogglePaletteOpen = vi.fn()

    render(
      <TilePalette
        activeTile={{
          shape: 'square',
          color: '#d4614f',
          material: 'ceramic',
          rotation: 0,
          mirrored: false,
        }}
        onShape={vi.fn()}
        onMaterial={vi.fn()}
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        paletteOpen={false}
        onTogglePaletteOpen={onTogglePaletteOpen}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('radiogroup', { name: 'Shape' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }))

    expect(onTogglePaletteOpen).toHaveBeenCalledTimes(1)
  })
})
