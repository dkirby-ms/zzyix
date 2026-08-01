import { getPatternCompatibleShapes } from '../domain/gridPatterns'
import type { GridPattern, GridPatternId } from '../domain/gridPatterns'
import type { TileShape } from '../domain/tileGeometry'
import { TileShapePreview } from './TileShapePreview'
import { ToggleGroup, ToggleGroupItem } from './primitives/ToggleGroup'

type GridOverlayControlsProps = {
  enabled: boolean
  patterns: readonly GridPattern[]
  selectedPatternId?: GridPatternId
  activeShape: TileShape
  announcement?: string
  onEnabledChange: (enabled: boolean) => void
  onPatternChange: (patternId: GridPatternId) => void
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

const isGridPatternId = (
  value: string,
  patterns: readonly GridPattern[],
): value is GridPatternId => patterns.some((pattern) => pattern.id === value)

export const GridOverlayControls = ({
  enabled,
  patterns,
  selectedPatternId,
  activeShape,
  announcement = '',
  onEnabledChange,
  onPatternChange,
}: GridOverlayControlsProps) => {
  const selectedPattern = patterns.find((pattern) => pattern.id === selectedPatternId)
  const compatibleShapes = selectedPattern ? getPatternCompatibleShapes(selectedPattern) : []
  const compatibilityMessage = enabled && selectedPattern && !compatibleShapes.includes(activeShape)
    ? `${shapeLabels[activeShape]} is not compatible with ${selectedPattern.label}. Choose ${compatibleShapes.map((shape) => shapeLabels[shape]).join(' or ')}.`
    : ''
  const statusMessage = compatibilityMessage || announcement ||
    (patterns.length === 0 ? 'No grid patterns are available for the current tile library.' : '')

  return (
    <section className="grid-overlay-controls" aria-label="Grid overlay controls">
      <div className="grid-overlay-controls-header">
        <button
          type="button"
          className="grid-overlay-toggle"
          aria-pressed={enabled}
          disabled={patterns.length === 0}
          onClick={() => onEnabledChange(!enabled)}
        >
          <span>Grid overlay</span>
          <span className="grid-overlay-toggle-state" aria-hidden="true">{enabled ? 'On' : 'Off'}</span>
        </button>
        {selectedPattern && (
          <span className="grid-overlay-active-pattern">{selectedPattern.label}</span>
        )}
      </div>

      {enabled && selectedPattern && (
        <div className="grid-overlay-options">
          <span id="grid-pattern-label" className="grid-overlay-options-label">Pattern</span>
          <ToggleGroup
            type="single"
            className="grid-pattern-options"
            value={selectedPattern.id}
            aria-labelledby="grid-pattern-label"
            onValueChange={(value) => {
              if (value && isGridPatternId(value, patterns)) {
                onPatternChange(value)
              }
            }}
          >
            {patterns.map((pattern, patternIndex) => {
              const patternShapes = getPatternCompatibleShapes(pattern)

              return (
                <ToggleGroupItem
                  key={pattern.id}
                  value={pattern.id}
                  aria-label={pattern.label}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onPatternChange(pattern.id)
                      return
                    }

                    const isForwardArrow = event.key === 'ArrowRight' || event.key === 'ArrowDown'
                    const isBackwardArrow = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                    if (!isForwardArrow && !isBackwardArrow) {
                      return
                    }

                    event.preventDefault()
                    const direction = isForwardArrow ? 1 : -1
                    const nextIndex = (patternIndex + direction + patterns.length) % patterns.length
                    onPatternChange(patterns[nextIndex].id)
                  }}
                >
                  <span className="grid-pattern-option">
                    <TileShapePreview
                      shape={patternShapes[0]}
                      size={26}
                      padding={4}
                      className="grid-pattern-preview"
                    />
                    <span>{pattern.label}</span>
                  </span>
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
          <p className="grid-overlay-compatible-shapes">
            Compatible: {compatibleShapes.map((shape) => shapeLabels[shape]).join(', ')}
          </p>
        </div>
      )}

      {statusMessage && (
        <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {statusMessage}
        </div>
      )}
    </section>
  )
}
