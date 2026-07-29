const SENSITIVE_KEY_PATTERN = /(?:authorization|access.?token|refresh.?token|external.?subject|email)/i

export const redactTelemetry = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Error) {
    return { name: value.name, message: 'Internal operation failed' }
  }
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (Array.isArray(value)) return value.map((entry) => redactTelemetry(entry, seen))

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : redactTelemetry(entry, seen),
  ]))
}