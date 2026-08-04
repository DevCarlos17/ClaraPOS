import type { CuentaTesoreria } from '../hooks/use-cuentas-tesoreria'

export interface CuentaSeleccionadaViva {
  cuenta: CuentaTesoreria | null
  esActivo: boolean
}

/**
 * Deriva el estado VIVO de la cuenta seleccionada a partir de las listas
 * activas/inactivas actuales del render, en vez de confiar en el snapshot
 * capturado por `useState` al momento de la seleccion.
 *
 * Bug que resuelve: si el usuario selecciona un banco activo y ese banco se
 * inactiva desde otra sesion/ventana (sync de PowerSync), el snapshot en
 * `selectedCuenta.is_active` queda obsoleto y las acciones que dependen de
 * `is_active` (Traspaso, Movimiento manual) quedan habilitadas indebidamente.
 *
 * Si el id no aparece en ninguna de las dos listas (ej. banco eliminado o
 * datos aun no cargados), se retorna el fallback mas seguro: inactivo.
 */
export function resolverCuentaSeleccionadaViva(
  selectedId: string | null | undefined,
  cuentas: CuentaTesoreria[],
  cuentasInactivas: CuentaTesoreria[]
): CuentaSeleccionadaViva {
  if (!selectedId) return { cuenta: null, esActivo: false }

  const activa = cuentas.find((c) => c.id === selectedId)
  if (activa) return { cuenta: activa, esActivo: activa.is_active }

  const inactiva = cuentasInactivas.find((c) => c.id === selectedId)
  if (inactiva) return { cuenta: inactiva, esActivo: false }

  return { cuenta: null, esActivo: false }
}
