const envCanvasDebug = import.meta.env.VITE_CANVAS_DEBUG

export const resolveCanvasDebug = (): boolean => {
  if (typeof envCanvasDebug === 'string' && envCanvasDebug.trim() !== '') {
    return envCanvasDebug.trim().toLowerCase() !== 'false' && envCanvasDebug.trim() !== '0'
  }

  return import.meta.env.DEV === true
}
