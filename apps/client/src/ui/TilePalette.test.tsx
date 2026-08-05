import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { TilePalette } from './TilePalette'
import { TILE_SHAPES } from '../domain/tileGeometry'

const shapeLabelByToken = {
  square: 'Square',
  triangle: 'Triangle',
  rectangle: 'Rectangle',
  'l-shape': 'L-shape',
  'large-square': 'Large square',
  circle: 'Circle',
  'right-triangle': 'Right triangle',
  'large-right-triangle': 'Large right triangle',
} as const

afterEach(() => {
  cleanup()
})

describe('TilePalette', () => {
  it('renders compact palette controls with curated palettes and advanced color entry', () => {
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
    expect(screen.getByRole('radiogroup', { name: 'Palette' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Color swatches' })).toBeInTheDocument()
    expect(screen.getByText('Custom hex / rgb')).toBeInTheDocument()
  })

  it('shows palette-specific swatches that change with the selected palette', () => {
    const { rerender } = render(
      <TilePalette
        activeTile={{
          shape: 'square',
          color: '#d4614f',
          material: 'ceramic',
          rotation: 0,
          mirrored: false,
        }}
        onShape={vi.fn()}
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    expect(screen.getByRole('radio', { name: 'Palette color #d4614f' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Palette color #4e6d7c' })).not.toBeInTheDocument()

    rerender(
      <TilePalette
        activeTile={{
          shape: 'square',
          color: '#4e6d7c',
          material: 'ceramic',
          rotation: 0,
          mirrored: false,
        }}
        onShape={vi.fn()}
        paletteName="lagoon"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    expect(screen.getByRole('radio', { name: 'Palette color #4e6d7c' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Palette color #d4614f' })).not.toBeInTheDocument()
  })

  it('renders an always-visible active selection summary', () => {
    render(
      <TilePalette
        activeTile={{
          shape: 'triangle',
          color: '#489ac0',
          material: 'glass',
          rotation: 0,
          mirrored: false,
        }}
        onShape={vi.fn()}
        paletteName="lagoon"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    const activeSelection = screen.getByRole('region', { name: 'Active selection summary' })
    expect(activeSelection).toBeInTheDocument()
    expect(within(activeSelection).getByText('Triangle · glass · Lagoon')).toBeInTheDocument()
    expect(within(activeSelection).getByText('#489ac0')).toBeInTheDocument()
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
        paletteName="lagoon"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    expect(screen.getByRole('radio', { name: 'Triangle' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Lagoon' })).toHaveAttribute('aria-checked', 'true')
  })

  it('groups all canonical shapes into accessible visual families', () => {
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
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    const renderedShapeOptions = new Set<string | null>()
    for (const family of ['Basic', 'Triangles', 'Special']) {
      fireEvent.click(screen.getByRole('radio', { name: family }))
      const shapeGroup = screen.getByRole('radiogroup', { name: 'Shape' })
      for (const radio of within(shapeGroup).getAllByRole('radio')) {
        renderedShapeOptions.add(radio.getAttribute('aria-label'))
        expect(radio.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      }
    }

    expect(renderedShapeOptions).toEqual(new Set(TILE_SHAPES.map((shape) => shapeLabelByToken[shape])))
  })

  it('selects a shape in the chosen family', () => {
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
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Triangles' }))

    expect(onShape).toHaveBeenCalledWith('triangle')
    expect(screen.getByRole('radio', { name: 'Triangle' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Square' })).not.toBeInTheDocument()
  })

  it('shows only compatible shapes when a grid pattern locks the palette', () => {
    render(
      <TilePalette
        activeTile={{
          shape: 'rectangle',
          color: '#d4614f',
          material: 'ceramic',
          rotation: 0,
          mirrored: false,
        }}
        availableShapes={['rectangle']}
        shapeConstraintLabel="Running bond"
        onShape={vi.fn()}
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    expect(screen.getByText('Locked to Running bond')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Shape family' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('radiogroup', { name: 'Shape' })).getAllByRole('radio'))
      .toHaveLength(1)
    expect(screen.getByRole('radio', { name: 'Rectangle' })).toHaveAttribute('aria-checked', 'true')
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

    expect(onShape).toHaveBeenCalledWith('rectangle')
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
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={vi.fn()}
        paletteFallbackAnnouncement=""
      />,
    )

    const rectangle = screen.getByRole('radio', { name: 'Rectangle' })
    const square = screen.getByRole('radio', { name: 'Square' })

    rectangle.focus()
    fireEvent.keyDown(rectangle, { key: 'Enter' })

    square.focus()
    fireEvent.keyDown(square, { key: ' ' })

    expect(onShape).toHaveBeenCalledWith('rectangle')
    expect(onShape).toHaveBeenCalledWith('square')
  })

  it('emits selection callbacks from the single-select controls', () => {
    const onShape = vi.fn()
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
        paletteName="terracotta"
        onPaletteName={onPaletteName}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={onColor}
        paletteFallbackAnnouncement=""
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))

    fireEvent.click(screen.getByRole('radio', { name: 'Rectangle' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Lagoon' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Palette color #eea655' }))

    expect(onShape).toHaveBeenCalledWith('rectangle')
    expect(onPaletteName).toHaveBeenCalledWith('lagoon')
    expect(onColor).toHaveBeenCalledWith('#eea655')
  })

  it('accepts custom hex and rgb color values from the advanced entry', () => {
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
        onShape={vi.fn()}
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        paletteOpen
        onTogglePaletteOpen={vi.fn()}
        onColor={onColor}
        paletteFallbackAnnouncement=""
      />,
    )

    fireEvent.click(screen.getByText('Custom hex / rgb'))
    fireEvent.change(screen.getByLabelText('Advanced color value'), { target: { value: 'rgb(95 117 136)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(onColor).toHaveBeenCalledWith('#5f7588')
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
