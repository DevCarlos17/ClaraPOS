import { v4 as uuidv4 } from 'uuid'
import { useDebugLogStore } from './store'

/**
 * Plain function — safe to import from anywhere (not a hook).
 * Reads user context from the store (set via setContexto on login).
 */
export function logEvento(
  accion: string,
  detalle?: Record<string, unknown> | null,
  nivel: 'info' | 'ok' | 'error' = 'info'
): void {
  const state = useDebugLogStore.getState()
  const { usuarioEmail, empresaId } = state._context

  state.push({
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    usuarioEmail,
    empresaId,
    accion,
    nivel,
    detalle: detalle ?? null,
  })
}
