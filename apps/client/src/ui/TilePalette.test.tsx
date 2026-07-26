import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { TilePalette } from './TilePalette'
import { TILE_SHAPES } from '../domain/tileGeometry'

afterEach(() => {
  cleanup()
})

describe('TilePalette', () => {
  it('renders a radio-style single-select surface across all rows', () => {
    render(
      <TilePalette
        shape="square"
        onShape={vi.fn()}
        material="ceramic"
        onMaterial={vi.fn()}
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        color="#d4614f"
        onColor={vi.fn()}
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
        shape="triangle"
        onShape={vi.fn()}
        material="glass"
        onMaterial={vi.fn()}
        paletteName="lagoon"
        onPaletteName={vi.fn()}
        color="#67aeb3"
        onColor={vi.fn()}
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
        shape="triangle"
        onShape={vi.fn()}
        material="glass"
        onMaterial={vi.fn()}
        paletteName="lagoon"
        onPaletteName={vi.fn()}
        color="#67aeb3"
        onColor={vi.fn()}
      />,
    )

    expect(screen.getByRole('radio', { name: 'triangle' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'glass' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'lagoon' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Color #67aeb3' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Color #67aeb3' })).toHaveAttribute('data-state', 'on')
  })

  it('keeps shape radios accessible with visual preview cards', () => {
    render(
      <TilePalette
        shape="square"
        onShape={vi.fn()}
        material="ceramic"
        onMaterial={vi.fn()}
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        color="#d4614f"
        onColor={vi.fn()}
      />,
    )

    const shapeGroup = screen.getByRole('radiogroup', { name: 'Shape' })

    for (const shape of TILE_SHAPES) {
      const radio = within(shapeGroup).getByRole('radio', { name: shape })
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
        shape="square"
        onShape={vi.fn()}
        material="ceramic"
        onMaterial={vi.fn()}
        paletteName="terracotta"
        onPaletteName={vi.fn()}
        color="#d4614f"
        onColor={vi.fn()}
      />,
    )

    const shapeGroup = screen.getByRole('radiogroup', { name: 'Shape' })
    const renderedShapeOptions = within(shapeGroup)
      .getAllByRole('radio')
      .map((radio) => radio.getAttribute('aria-label'))

    expect(renderedShapeOptions).toEqual(TILE_SHAPES)
  })

  it('emits selection callbacks from the single-select controls', () => {
    const onShape = vi.fn()
    const onMaterial = vi.fn()
    const onPaletteName = vi.fn()
    const onColor = vi.fn()

    render(
      <TilePalette
        shape="square"
        onShape={onShape}
        material="ceramic"
        onMaterial={onMaterial}
        paletteName="terracotta"
        onPaletteName={onPaletteName}
        color="#d4614f"
        onColor={onColor}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'triangle' }))
    fireEvent.click(screen.getByRole('radio', { name: 'glass' }))
    fireEvent.click(screen.getByRole('radio', { name: 'lagoon' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Color #eea655' }))

    expect(onShape).toHaveBeenCalledWith('triangle')
    expect(onMaterial).toHaveBeenCalledWith('glass')
    expect(onPaletteName).toHaveBeenCalledWith('lagoon')
    expect(onColor).toHaveBeenCalledWith('#eea655')
  })
})
