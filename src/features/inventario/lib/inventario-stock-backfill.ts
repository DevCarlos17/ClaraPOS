/**
 * Backfill unico, idempotente y por-dispositivo de `inventario_stock` (Slice
 * 2a — fix CRITICAL post-review).
 *
 * PROBLEMA: el read-path de ventas escopeado por deposito (Slice 2a) lee
 * `LEFT JOIN inventario_stock ... COALESCE(cantidad_actual, 0)`. Pero el
 * helper `upsertStockDeposito` (Slice 1b) solo auto-repara filas de
 * `inventario_stock` de forma PEREZOSA — al primer INGRESO/EGRESO de ese
 * (producto, deposito) DESPUES de este cambio. Un producto legado con stock
 * real en `productos.stock` pero SIN fila propia en `inventario_stock` para
 * el deposito de la caja activa se leeria como 0 y quedaria OCULTO/BLOQUEADO
 * en el POS aunque tenga stock legitimo — falso negativo financiero.
 *
 * SOLUCION: al arrancar la app (autenticado, `empresa_id` conocido),
 * reconstruir `inventario_stock` para TODA la empresa desde el kardex
 * historico via `recalcularStockDesdeKardex` (Slice 1b, sin modificar) — una
 * unica vez por dispositivo, controlado por un flag durable en
 * `localStorage` (`inventario-stock-backfill-store.ts`).
 *
 * Esta funcion NO reimplementa la agregacion — solo orquesta cuándo llamar
 * a `recalcularStockDesdeKardex` y cuándo marcar el flag. `store`/`recalcular`
 * son inyectables unicamente para tests; produccion usa los defaults reales.
 */

import { recalcularStockDesdeKardex } from './stock-deposito'
import { inventarioStockBackfillStore } from '@/lib/inventario-stock-backfill-store'

export interface BackfillStoreLike {
  yaEjecutado(): boolean
  marcarCompletado(): void
}

export interface EjecutarInventarioStockBackfillParams {
  empresaId: string
  /** Inyectable solo para tests — default: instancia real basada en localStorage. */
  store?: BackfillStoreLike
  /** Inyectable solo para tests — default: `recalcularStockDesdeKardex` real. */
  recalcular?: (params: { empresa_id: string }) => Promise<void>
}

/**
 * Ejecuta el backfill si (y solo si) el flag de este dispositivo indica que
 * todavia no corrio. Si `recalcular` falla a mitad de camino, el flag NUNCA
 * se marca como completado — el proximo arranque de la app reintenta desde
 * cero (SELECT-then-write es idempotente por naturaleza: recalcular sobre
 * datos ya correctos no los corrompe). El error se loguea pero NUNCA se
 * propaga: un fallo de backfill jamas debe bloquear el arranque de la app.
 */
export async function ejecutarInventarioStockBackfillSiNecesario(
  params: EjecutarInventarioStockBackfillParams
): Promise<void> {
  const {
    empresaId,
    store = inventarioStockBackfillStore,
    recalcular = recalcularStockDesdeKardex,
  } = params

  if (store.yaEjecutado()) return

  try {
    await recalcular({ empresa_id: empresaId })
    store.marcarCompletado()
  } catch (error) {
    console.error(
      '[inventario-stock-backfill] Fallo el backfill de inventario_stock — se reintentara en el proximo arranque:',
      error
    )
  }
}
