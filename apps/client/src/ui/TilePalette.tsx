import { palettes } from './palettes'
import { ToggleGroup, ToggleGroupItem } from './primitives/ToggleGroup'
import type { MaterialVariant, TileShape } from '../domain/tileGeometry'
import type { PaletteName } from './palettes'

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

const shapes: TileShape[] = ['square', 'triangle', 'rectangle', 'l-shape']
const materials: MaterialVariant[] = ['ceramic', 'glass', 'stone']
const paletteNames = Object.keys(palettes) as PaletteName[]

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
            if (value) {
              onShape(value as TileShape)
            }
          }}
          aria-label="Shape"
        >
          {shapes.map((entry) => (
            <ToggleGroupItem key={entry} value={entry} aria-label={entry}>
              {entry}
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
            if (value) {
              onMaterial(value as MaterialVariant)
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
            if (value) {
              onPaletteName(value as PaletteName)
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
