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
  rotation: number
  onRotateCw: () => void
  onRotateCcw: () => void
  onRotateFine: () => void
  onRotateFineCcw: () => void
  onMirror: () => void
  canUndo: boolean
  onUndo: () => void
  clearDisabled: boolean
  onClear: () => void
  onReturnToLobby: () => void
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
  rotation,
  onRotateCw,
  onRotateCcw,
  onRotateFine,
  onRotateFineCcw,
  onMirror,
  canUndo,
  onUndo,
  clearDisabled,
  onClear,
  onReturnToLobby,
}: ControlsPanelProps) => {
  return (
    <aside className="controls-shell" aria-label="Mosaic controls">
      <h1>Mosaic Atelier</h1>
      <p>Drag to guide tiles. Release to settle.</p>

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

      <section>
        <h2>Transform</h2>
        <div className="pill-row">
          <button type="button" onClick={onRotateCcw}>−90°</button>
          <button type="button" onClick={onRotateCw}>+90°</button>
          <button type="button" onClick={onMirror}>Mirror</button>
        </div>
        <div className="pill-row">
          <button type="button" onClick={onRotateFineCcw}>−15°</button>
          <span className="rotation-display">{Math.round((rotation * 180) / Math.PI)}°</span>
          <button type="button" onClick={onRotateFine}>+15°</button>
        </div>
      </section>

      <section>
        <h2>Edit</h2>
        <div className="pill-row">
          <button type="button" disabled={!canUndo} onClick={onUndo}>Undo</button>
          <button type="button" disabled={clearDisabled} onClick={onClear}>Clear</button>
        </div>
      </section>

      <section>
        <div className="pill-row">
          <button type="button" onClick={onReturnToLobby}>Return to Lobby</button>
        </div>
      </section>

      <section className="hint-list">
        <h2>Keys</h2>
        <p>R rotate clockwise (+90°), Shift+R counter-clockwise (−90°), [ / ] fine rotation (±15°), F mirror, Z undo. Scroll to zoom, middle-drag to pan, right-drag to rotate.</p>
      </section>
    </aside>
  )
}
