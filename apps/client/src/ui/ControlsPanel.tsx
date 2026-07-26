import { palettes } from './palettes'
import type { MaterialVariant, TileShape } from '../domain/tileGeometry'
import type { PaletteName } from './palettes'

type ControlsPanelProps = {
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

export const ControlsPanel = ({
  shape,
  onShape,
  material,
  onMaterial,
  paletteName,
  onPaletteName,
  color,
  onColor,
}: ControlsPanelProps) => {
  return (
    <aside className="palette-region" aria-label="Palette controls">
      <section>
        <h2>Shape</h2>
        <div className="shape-grid">
          {shapes.map((entry) => (
            <button
              key={entry}
              type="button"
              className={entry === shape ? 'active' : ''}
              onClick={() => onShape(entry)}
            >
              {entry}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Material</h2>
        <div className="pill-row">
          {materials.map((entry) => (
            <button
              key={entry}
              type="button"
              className={entry === material ? 'active' : ''}
              onClick={() => onMaterial(entry)}
            >
              {entry}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Palette</h2>
        <div className="pill-row">
          {Object.keys(palettes).map((name) => (
            <button
              key={name}
              type="button"
              className={name === paletteName ? 'active' : ''}
              onClick={() => onPaletteName(name as PaletteName)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="color-row">
          {palettes[paletteName].map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`color ${swatch}`}
              className={swatch === color ? 'swatch active' : 'swatch'}
              style={{ backgroundColor: swatch }}
              onClick={() => onColor(swatch)}
            />
          ))}
        </div>
      </section>
    </aside>
  )
}
