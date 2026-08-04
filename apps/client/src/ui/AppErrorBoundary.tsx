import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryProps = {
  children: ReactNode
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

type AppErrorBoundaryState = {
  error: Error | null
  errorInfo: ErrorInfo | null
  occurrenceId: string | null
  occurredAt: string | null
}

const createOccurrenceId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `client-${Date.now().toString(36)}`
}

const getCurrentLocation = (): string => {
  if (typeof window === 'undefined') {
    return 'unavailable'
  }

  return window.location.href
}

const formatTechnicalDetails = (error: Error | null, errorInfo: ErrorInfo | null): string => {
  const details = [
    error?.stack ?? error?.message,
    errorInfo?.componentStack ? `Component stack:${errorInfo.componentStack}` : undefined,
  ].filter((entry): entry is string => Boolean(entry))

  return details.join('\n\n') || 'No stack trace was captured.'
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
    errorInfo: null,
    occurrenceId: null,
    occurredAt: null,
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return {
      error,
      occurrenceId: createOccurrenceId(),
      occurredAt: new Date().toISOString(),
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    console.error('Application render failed', {
      occurrenceId: this.state.occurrenceId,
      occurredAt: this.state.occurredAt,
      location: getCurrentLocation(),
      error,
      errorInfo,
    })
  }

  render() {
    if (this.state.error) {
      const {
        title = 'Zzyix ran into a problem',
        description = 'Refresh the page to try again. If this keeps happening, include the diagnostic details below when reporting it.',
        actionLabel = 'Reload page',
        onAction = () => window.location.reload(),
      } = this.props

      return (
        <main className="app-error-page" role="alert" aria-labelledby="app-error-title">
          <section className="app-error-panel">
            <p className="app-error-kicker">Application error</p>
            <h1 id="app-error-title">{title}</h1>
            <p>{description}</p>
            <button type="button" onClick={onAction}>{actionLabel}</button>
            <dl className="app-error-diagnostics" aria-label="Error diagnostics">
              <div>
                <dt>Error ID</dt>
                <dd>{this.state.occurrenceId}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{this.state.occurredAt}</dd>
              </div>
              <div>
                <dt>Page</dt>
                <dd>{getCurrentLocation()}</dd>
              </div>
              <div>
                <dt>Message</dt>
                <dd>{this.state.error.message || this.state.error.name}</dd>
              </div>
            </dl>
            <details className="app-error-technical-details">
              <summary>Technical details</summary>
              <pre>{formatTechnicalDetails(this.state.error, this.state.errorInfo)}</pre>
            </details>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}