/**
 * Cierra el gap "is_active en depositos es decorativo" (QA post-merge de
 * PR#57 `deposito-unico-principal`): un deposito referenciado por una caja
 * (`cajas.deposito_id`) NO puede desactivarse sin antes cerrar la sesion
 * abierta (si existe) o reasignar la caja a otro deposito primero. Funciones
 * puras, testeables sin I/O — el caller (`actualizarDeposito` en
 * use-depositos.ts, y `deposito-list.tsx` para la transparencia del listado)
 * ejecuta la query agrupada y le pasa el resultado ya mapeado.
 */

export interface CajaReferenciaDeposito {
  cajaId: string
  cajaNombre: string
  tieneSesionAbierta: boolean
}

/**
 * Agrupa filas planas (1 query agrupada, sin N+1) en un
 * `Map<deposito_id, CajaReferenciaDeposito[]>`. La query origen trae, por
 * cada caja con `deposito_id` no nulo de la empresa, si tiene una
 * `sesiones_caja` con `status='ABIERTA'` (via `EXISTS` correlacionado) — el
 * mismo patron `useMemo` + `Map` ya establecido en `deposito-list.tsx` para
 * `conteosMap`.
 */
export function agruparCajasPorDeposito(
  rows: { deposito_id: string; caja_id: string; caja_nombre: string; tiene_sesion_abierta: number }[]
): Map<string, CajaReferenciaDeposito[]> {
  const map = new Map<string, CajaReferenciaDeposito[]>()

  for (const row of rows) {
    const caja: CajaReferenciaDeposito = {
      cajaId: row.caja_id,
      cajaNombre: row.caja_nombre,
      tieneSesionAbierta: row.tiene_sesion_abierta === 1,
    }
    const existentes = map.get(row.deposito_id)
    if (existentes) {
      existentes.push(caja)
    } else {
      map.set(row.deposito_id, [caja])
    }
  }

  return map
}

export interface BloqueoDesactivacion {
  bloqueado: boolean
  motivo?: 'SESION_ABIERTA' | 'CAJA_SIN_SESION'
  cajas: CajaReferenciaDeposito[]
}

/**
 * Pura: decide si desactivar un deposito debe bloquearse y por que motivo,
 * dado el set de cajas que lo referencian (`cajas.deposito_id`).
 *
 * - Sin cajas referenciandolo: PERMITE (`bloqueado: false`).
 * - Con cajas, y al menos una tiene sesion `ABIERTA`: BLOQUEA con
 *   `SESION_ABIERTA` (debe cerrarse la sesion primero — no tiene sentido
 *   ofrecer reasignar mientras la caja esta en uso activo).
 * - Con cajas, ninguna con sesion abierta: BLOQUEA con `CAJA_SIN_SESION`
 *   (instruye a reasignar la caja a otro deposito antes de desactivar este).
 */
export function resolveBloqueoDesactivacion(cajas: CajaReferenciaDeposito[]): BloqueoDesactivacion {
  if (cajas.length === 0) {
    return { bloqueado: false, cajas: [] }
  }

  const tieneSesionAbierta = cajas.some((c) => c.tieneSesionAbierta)
  if (tieneSesionAbierta) {
    return { bloqueado: true, motivo: 'SESION_ABIERTA', cajas }
  }

  return { bloqueado: true, motivo: 'CAJA_SIN_SESION', cajas }
}

/**
 * Pura: reingreso de stock automatico para el flujo de NCR POS-express
 * (decision de producto #3, obs #2228 — "reversar factura del dia", el
 * cajero NUNCA elige destino). Si el deposito de ORIGEN de la venta
 * (`venta.deposito_id`) sigue activo, el stock vuelve ahi. Si fue desactivado
 * desde la venta, cae automaticamente al deposito `es_principal` ACTUAL de
 * la empresa. Si tampoco hay principal (caso borde: empresa sin deposito
 * activo configurado), retorna `null` — el caller (`crearNotaCredito`)
 * decide como manejarlo (no puede escribir un `movimientos_inventario` con
 * `deposito_id` nulo, `NOT NULL` en el schema).
 *
 * El modulo NCR administrativo (destino elegido explicitamente) NO usa esta
 * funcion — queda fuera de scope (todavia no existe, ver obs #2228).
 */
export function resolveDepositoReingresoNcr(
  origenDepositoId: string,
  origenIsActive: boolean,
  principalDepositoId: string | null
): string | null {
  return origenIsActive ? origenDepositoId : principalDepositoId
}
