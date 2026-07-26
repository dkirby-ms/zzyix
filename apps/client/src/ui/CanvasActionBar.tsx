type CanvasActionBarProps = {
  rotation: number
  onRotateCw: () => void
  onRotateCcw: () => void
  onRotateFine: () => void
  onRotateFineCcw: () => void
  onMirror: () => void
  canUndo: boolean
  onUndo: () => void
}

export const CanvasActionBar = ({
  rotation,
  onRotateCw,
  onRotateCcw,
  onRotateFine,
  onRotateFineCcw,
  onMirror,
  canUndo,
  onUndo,
}: CanvasActionBarProps) => {
  return (
    <div className="canvas-action-bar">
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
      <div className="pill-row">
        <button type="button" disabled={!canUndo} onClick={onUndo}>Undo</button>
      </div>
    </div>
  )
}
