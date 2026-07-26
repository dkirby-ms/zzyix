import type { TileShape } from '../domain/tileGeometry'
import {
  DEFAULT_PREVIEW_PADDING,
  DEFAULT_PREVIEW_SIZE,
  createTilePreviewPath,
} from './tileShapePreviewGeometry'

type TileShapePreviewProps = {
  shape: TileShape
  size?: number
  padding?: number
  className?: string
}

export const TileShapePreview = ({
  shape,
  size = DEFAULT_PREVIEW_SIZE,
  padding = DEFAULT_PREVIEW_PADDING,
  className,
}: TileShapePreviewProps) => {
  const d = createTilePreviewPath(shape, { size, padding })

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
    >
      <path d={d} />
    </svg>
  )
}
