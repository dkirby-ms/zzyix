import { useEffect, useId, useState } from 'react'
import { palettes } from './palettes'
import { ToggleGroup, ToggleGroupItem } from './primitives/ToggleGroup'
import { TILE_SHAPES, type TileShape } from '../domain/tileGeometry'
import type { PaletteName } from './palettes'
import { TileShapePreview } from './TileShapePreview'
import type { ActiveTile } from '../interaction/controller'

type TilePaletteProps = {
  activeTile: ActiveTile
  onShape: (shape: TileShape) => void
  paletteName: PaletteName
  onPaletteName: (name: PaletteName) => void
  paletteOpen: boolean
  onTogglePaletteOpen: () => void
  onColor: (color: string) => void
  paletteFallbackAnnouncement: string
}

const paletteNames = Object.keys(palettes) as PaletteName[]
const paletteLabels: Record<PaletteName, string> = {
  terracotta: 'Terracotta',
  lagoon: 'Lagoon',
  dusk: 'Dusk',
  quarry: 'Quarry',
  forest: 'Forest',
  aurora: 'Aurora',
  ember: 'Ember',
  frost: 'Frost',
}

const shapeLabels: Record<TileShape, string> = {
  square: 'Square',
  triangle: 'Triangle',
  rectangle: 'Rectangle',
  'l-shape': 'L-shape',
  'large-square': 'Large square',
  circle: 'Circle',
  'right-triangle': 'Right triangle',
  'large-right-triangle': 'Large right triangle',
}

const isTileShape = (value: string): value is TileShape => TILE_SHAPES.includes(value as TileShape)

const isPaletteName = (value: string): value is PaletteName => paletteNames.includes(value as PaletteName)

const isColorValue = (value: string): boolean => {
  if (typeof document === 'undefined') {
    return value.trim().length > 0
  }

  const probe = document.createElement('option')
  probe.style.color = ''
  probe.style.color = value.trim()
  return probe.style.color !== ''
}

const rgbChannelToHex = (value: number): string => value.toString(16).padStart(2, '0')

const normalizeColorForTile = (value: string): string | null => {
  if (typeof document === 'undefined') {
    return value.trim().length > 0 ? value.trim() : null
  }

  const probe = document.createElement('option')
  probe.style.color = ''
  probe.style.color = value.trim()

  if (probe.style.color === '') {
    return null
  }

  const rgbMatch = probe.style.color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgbMatch) {
    const [, red, green, blue] = rgbMatch
    return `#${rgbChannelToHex(Number(red))}${rgbChannelToHex(Number(green))}${rgbChannelToHex(Number(blue))}`
  }

  return value.trim()
}

export const TilePalette = ({
  activeTile,
  onShape,
  paletteName,
  onPaletteName,
  paletteOpen,
  onTogglePaletteOpen,
  onColor,
  paletteFallbackAnnouncement,
}: TilePaletteProps) => {
  const customColorInputId = useId()
  const [customColorValue, setCustomColorValue] = useState(activeTile.color)
  const [customColorError, setCustomColorError] = useState('')

  useEffect(() => {
    setCustomColorValue(activeTile.color)
    setCustomColorError('')
  }, [activeTile.color])

  const activeSwatches = palettes[paletteName]
  const selectedSwatch = activeSwatches.some((entry) => entry === activeTile.color) ? activeTile.color : undefined

  const applyCustomColor = () => {
    const nextColor = customColorValue.trim()

    if (!nextColor) {
      setCustomColorError('Enter a hex or rgb color value.')
      return
    }

    if (!isColorValue(nextColor)) {
      setCustomColorError('That color format is not recognized.')
      return
    }

    const normalizedColor = normalizeColorForTile(nextColor)
    if (!normalizedColor) {
      setCustomColorError('That color format is not recognized.')
      return
    }

    setCustomColorError('')
    onColor(normalizedColor)
  }

  return (
    <aside className="palette-region" aria-label="Tile palette controls">
      <div className="palette-header-row">
        <div>
          <h2>Tile palette</h2>
        </div>
        <button type="button" onClick={onTogglePaletteOpen} aria-expanded={paletteOpen} aria-controls="tile-palette-body">
          {paletteOpen ? 'Collapse' : 'Expand'}
        </button>
      </div>
      <section className="palette-current-selection" aria-label="Active selection summary">
        <span
          className="palette-current-selection-swatch"
          style={{ backgroundColor: activeTile.color }}
          aria-hidden="true"
        />
        <div>
          <span className="palette-current-selection-label">Active tessera</span>
          <p>{shapeLabels[activeTile.shape]} · {activeTile.material} · {paletteLabels[paletteName]}</p>
        </div>
        <code>{activeTile.color}</code>
      </section>
      <div id="tile-palette-body" hidden={!paletteOpen}>
        <section>
          <h2>Shape</h2>
          <ToggleGroup
            type="single"
            className="shape-grid"
            value={activeTile.shape}
            onValueChange={(value) => {
              if (value && isTileShape(value)) {
                onShape(value)
              }
            }}
            aria-label="Shape"
          >
            {TILE_SHAPES.map((entry) => (
              <ToggleGroupItem
                key={entry}
                value={entry}
                aria-label={shapeLabels[entry]}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onShape(entry)
                    return
                  }

                  const isForwardArrow = event.key === 'ArrowRight' || event.key === 'ArrowDown'
                  const isBackwardArrow = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  if (!isForwardArrow && !isBackwardArrow) {
                    return
                  }

                  event.preventDefault()
                  const currentIndex = TILE_SHAPES.indexOf(entry)
                  const direction = isForwardArrow ? 1 : -1
                  const nextIndex = (currentIndex + direction + TILE_SHAPES.length) % TILE_SHAPES.length
                  onShape(TILE_SHAPES[nextIndex])
                }}
              >
                <span className="tile-shape-card">
                  <TileShapePreview shape={entry} className="tile-shape-card-preview" />
                  <span className="tile-shape-card-label">{shapeLabels[entry]}</span>
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>

        <section className="palette-control">
          <div className="palette-control-header">
            <div>
              <h2>Palette</h2>
            </div>
            <span className="palette-control-chip">{paletteLabels[paletteName]}</span>
          </div>

          <ToggleGroup
            type="single"
            className="palette-preset-grid"
            value={paletteName}
            onValueChange={(value) => {
              if (value && isPaletteName(value)) {
                onPaletteName(value)
              }
            }}
            aria-label="Palette"
          >
            {paletteNames.map((name) => (
              <ToggleGroupItem key={name} value={name} aria-label={paletteLabels[name]} className="palette-preset-card">
                <span className="palette-preset-card-label">{paletteLabels[name]}</span>
                <span className="palette-preset-card-strip" aria-hidden="true">
                  {palettes[name].map((swatch) => (
                    <span key={swatch} className="palette-preset-card-swatch" style={{ backgroundColor: swatch }} />
                  ))}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="palette-subsection">
            <h3>Colors</h3>
            <ToggleGroup
              type="single"
              className="palette-color-grid"
              value={selectedSwatch}
              onValueChange={(value) => {
                if (value) {
                  onColor(value)
                }
              }}
              aria-label="Color swatches"
            >
              {activeSwatches.map((swatch) => (
                <ToggleGroupItem
                  key={`${paletteName}-${swatch}`}
                  value={swatch}
                  className="swatch tile-palette-swatch"
                  aria-label={`Palette color ${swatch}`}
                  title={swatch}
                  style={{ backgroundColor: swatch }}
                >
                  <span aria-hidden="true"> </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <details className="palette-custom-input">
            <summary>Custom hex / rgb</summary>
            <div className="palette-custom-input-body">
              <label htmlFor={customColorInputId}>Advanced color value</label>
              <div className="palette-custom-input-row">
                <input
                  id={customColorInputId}
                  type="text"
                  value={customColorValue}
                  onChange={(event) => {
                    setCustomColorValue(event.target.value)
                    if (customColorError) {
                      setCustomColorError('')
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      applyCustomColor()
                    }
                  }}
                  placeholder="#5f7588 or rgb(95 117 136)"
                  spellCheck={false}
                  autoComplete="off"
                />
                <input
                  type="color"
                  value={customColorValue.startsWith('#') ? customColorValue : activeTile.color}
                  onChange={(event) => {
                    setCustomColorValue(event.target.value)
                    setCustomColorError('')
                    onColor(event.target.value)
                  }}
                  title="Color picker"
                />
                <button type="button" onClick={applyCustomColor}>
                  Apply
                </button>
              </div>
              {customColorError ? (
                <p className="palette-custom-input-error" role="alert">
                  {customColorError}
                </p>
              ) : (
                <p className="palette-custom-input-help">Examples: #5f7588, rgb(95 117 136), rgb(95, 117, 136)</p>
              )}
            </div>
          </details>
        </section>

      </div>
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {paletteFallbackAnnouncement}
      </div>
    </aside>
  )
}
