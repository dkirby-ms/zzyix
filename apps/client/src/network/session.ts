const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export const ensureSession = async (): Promise<string> => {
  const stored = sessionStorage.getItem('zzyix_session_id')
  if (stored) return stored

  const response = await fetch(`${SERVER_URL}/sessions`, { method: 'POST' })
  if (!response.ok) throw new Error(`Failed to create session: ${response.status}`)

  const data = (await response.json()) as { session: { id: string } }
  sessionStorage.setItem('zzyix_session_id', data.session.id)
  return data.session.id
}

export const ensureClientId = (): string => {
  const stored = localStorage.getItem('zzyix_client_id')
  if (stored) return stored

  const id = crypto.randomUUID()
  localStorage.setItem('zzyix_client_id', id)
  return id
}