import React from 'react'
import type { ConnectionState } from '../network/useConnectionStatus'
import { Tooltip, TooltipArrow, TooltipContent, TooltipTrigger } from './primitives/Tooltip'
import './StatusIndicator.css'

export interface StatusIndicatorProps {
  connectionState: ConnectionState
  showLabel?: boolean
}

const getStatusDisplay = (status: ConnectionState): { text: string; className: string } => {
  switch (status.status) {
    case 'connected':
      return { text: 'Connected', className: 'status-connected' }
    case 'connecting':
      return { text: 'Connecting...', className: 'status-connecting' }
    case 'error':
      return { text: 'Connection Error', className: 'status-error' }
    case 'disconnected':
    case 'disconnecting':
      return { text: 'Offline', className: 'status-disconnected' }
    default:
      return { text: 'Unknown', className: 'status-unknown' }
  }
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ connectionState, showLabel = true }) => {
  const display = getStatusDisplay(connectionState)
  const lastError = connectionState.lastError?.trim()
  const hasErrorDetails = display.className === 'status-error' && Boolean(lastError)
  const indicatorLabel = `Connection status: ${display.text}`

  const indicator = (
    <div
      className={`status-indicator ${display.className}${showLabel ? '' : ' status-indicator--compact'}`}
      aria-label={indicatorLabel}
      title={indicatorLabel}
    >
      <div className="status-dot" />
      {showLabel && <span className="status-text">{display.text}</span>}
    </div>
  )

  if (!hasErrorDetails) {
    return indicator
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="status-indicator-trigger"
          aria-label="View connection error details"
        >
          {indicator}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        {lastError}
        <TooltipArrow />
      </TooltipContent>
    </Tooltip>
  )
}
