import './CanvasLoadingFallback.css'

export const CanvasLoadingFallback = () => (
  <div className="canvas-loading-fallback" role="status" aria-live="polite">
    <span className="canvas-loading-spinner" aria-hidden="true" />
    <span>Loading canvas...</span>
  </div>
)
