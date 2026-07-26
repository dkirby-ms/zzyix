import { palettes } from './palettes'
import { ToggleGroup, ToggleGroupItem } from './primitives/ToggleGroup'
import { TILE_SHAPES, type MaterialVariant, type TileShape } from '../domain/tileGeometry'
import type { PaletteName } from './palettes'
import { TileShapePreview } from './TileShapePreview'

type TilePaletteProps = {
  shape: TileShape
  onShape: (shape: TileShape) => void
  material: MaterialVariant
  onMaterial: (material: MaterialVariant) => void
  paletteName: PaletteName
  onPaletteName: (name: PaletteName) => void
  color: string
  onColor: (color: string) => void
}

const materials: MaterialVariant[] = ['ceramic', 'glass', 'stone']
const paletteNames = Object.keys(palettes) as PaletteName[]

const shapeLabels: Record<TileShape, string> = {
  square: 'Square',
  triangle: 'Triangle',
  rectangle: 'Rectangle',
  'l-shape': 'L-shape',
}

const isTileShape = (value: string): value is TileShape => TILE_SHAPES.includes(value as TileShape)

const isMaterialVariant = (value: string): value is MaterialVariant => materials.includes(value as MaterialVariant)

const isPaletteName = (value: string): value is PaletteName => paletteNames.includes(value as PaletteName)

export const TilePalette = ({
  shape,
  onShape,
  material,
  onMaterial,
  paletteName,
  onPaletteName,
  color,
  onColor,
}: TilePaletteProps) => {
  return (
    <aside className="palette-region" aria-label="Tile palette controls">
      <section>
        <h2>Shape</h2>
        <ToggleGroup
          type="single"
          className="shape-grid"
          value={shape}
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

      <section>
        <h2>Material</h2>
        <ToggleGroup
          type="single"
          className="pill-row"
          value={material}
          onValueChange={(value) => {
            if (value && isMaterialVariant(value)) {
              onMaterial(value)
            }
          }}
          aria-label="Material"
        >
          {materials.map((entry) => (
            <ToggleGroupItem key={entry} value={entry} aria-label={entry}>
              {entry}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </section>

      <section>
        <h2>Palette</h2>
        <ToggleGroup
          type="single"
          className="pill-row"
          value={paletteName}
          onValueChange={(value) => {
            if (value && isPaletteName(value)) {
              onPaletteName(value)
            }
          }}
          aria-label="Palette"
        >
          {paletteNames.map((name) => (
            <ToggleGroupItem key={name} value={name} aria-label={name}>
              {name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <ToggleGroup
          type="single"
          className="color-row"
          value={color}
          onValueChange={(value) => {
            if (value) {
              onColor(value)
            }
          }}
          aria-label="Color"
        >
          {palettes[paletteName].map((swatch) => (
            <ToggleGroupItem
              key={swatch}
              value={swatch}
              className="swatch tile-palette-swatch"
              aria-label={`Color ${swatch}`}
              title={swatch}
              style={{ backgroundColor: swatch }}
            >
              <span aria-hidden="true"> </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </section>

      <section className="tile-palette-summary" aria-label="Active selection summary">
        <h2>Active Selection</h2>
        <p>Shape: {shape}</p>
        <p>Material: {material}</p>
        <p>Palette: {paletteName}</p>
        <p>Color: {color}</p>
      </section>
    </aside>
  )
}
