import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { inventarioStockBackfillStore } from '@/lib/inventario-stock-backfill-store'
import { computeBackfillGateEstado, type BackfillGateEstado } from '../lib/inventario-stock-backfill-gate'

/**
 * Store compartido (no per-componente) que expone si el POS debe gatear en
 * "Verificando inventario…" mientras el backfill de `inventario_stock`
 * corre por primera vez en este dispositivo (Slice 2a — cierre del WARNING
 * del review post-backfill).
 *
 * DISEÑO — por que un store compartido en vez de devolver el estado
 * directamente desde `useInventarioStockBackfill()` y prop-drillearlo o
 * re-invocar ese hook en `pos-terminal.tsx`:
 *   - El backfill debe correr UNA SOLA VEZ, globalmente, disparado desde
 *     `_app/route.tsx` (`AppLayout`). Si `pos-terminal.tsx` tambien llamara
 *     `useInventarioStockBackfill()` para leer su estado, su propio
 *     `useEffect` dispararia una SEGUNDA invocacion de
 *     `ejecutarInventarioStockBackfillSiNecesario` en paralelo — inofensivo
 *     por idempotencia de datos (recalcular sobre datos correctos no los
 *     corrompe) pero desperdicia trabajo y viola el requisito explicito de
 *     "un solo run global".
 *   - Prop-drilling desde `AppLayout` hasta `pos-terminal.tsx` cruzaria
 *     `Outlet`/TanStack Router, forzando pasar el estado por route context o
 *     search params — mucho mas invasivo que un selector Zustand.
 *   - Un store Zustand es el patron ya establecido en este repo para estado
 *     compartido cross-componente sin prop-drilling (`sidebar-store.ts`,
 *     `facturas-espera-store.ts`).
 *
 * `useInventarioStockBackfill()` (mount unico en `AppLayout`) es el UNICO
 * lugar que llama `marcarTerminado()`. `pos-terminal.tsx` SOLO debe usar el
 * selector de solo-lectura `useInventarioStockBackfillListo()` (ver abajo) —
 * nunca debe volver a montar `useInventarioStockBackfill()`.
 */
export interface InventarioStockBackfillGateState {
  estado: BackfillGateEstado
  /**
   * Marca la operacion de backfill como terminada (exito O fallo — el
   * orquestador nunca lanza, siempre resuelve). Llamado UNICAMENTE por
   * `useInventarioStockBackfill()`.
   */
  marcarTerminado: () => void
}

/**
 * Factory — permite crear instancias frescas del store con un `estado`
 * inicial controlado. Usado por la instancia compartida real de la app
 * (parametrizada con el flag durable real) Y por los tests (que necesitan
 * probar ambos arranques — primero y posteriores — sin tener que mockear el
 * modulo del flag entre casos).
 */
export function createInventarioStockBackfillGateStore(
  flagYaEstabaMarcado: boolean
): UseBoundStore<StoreApi<InventarioStockBackfillGateState>> {
  return create<InventarioStockBackfillGateState>((set) => ({
    estado: computeBackfillGateEstado({ flagYaEstabaMarcado, operacionTerminada: false }),
    marcarTerminado: () =>
      set({ estado: computeBackfillGateEstado({ flagYaEstabaMarcado: false, operacionTerminada: true }) }),
  }))
}

/**
 * Instancia compartida real. El `estado` inicial se computa UNA VEZ, de
 * forma SINCRONA, al cargar este modulo — es decir, ANTES del primer render
 * de cualquier componente que lo importe (incluyendo `pos-terminal.tsx`).
 * Esto es deliberado: si el `estado` inicial se calculara dentro de un
 * `useEffect` (que corre DESPUES del primer paint), el POS ya habria
 * pintado su primer frame con datos potencialmente incorrectos antes de que
 * el efecto pudiera activar el gate — exactamente la ventana de carrera que
 * este cambio busca cerrar.
 */
export const useInventarioStockBackfillGateStore = createInventarioStockBackfillGateStore(
  inventarioStockBackfillStore.yaEjecutado()
)

/**
 * Selector de SOLO LECTURA para consumidores como `pos-terminal.tsx`:
 * `true` cuando el POS puede renderizar normalmente (sin gate). Seguro de
 * montar en cualquier cantidad de componentes — nunca dispara el backfill,
 * solo se suscribe al store compartido.
 */
export function useInventarioStockBackfillListo(): boolean {
  return useInventarioStockBackfillGateStore((s) => s.estado === 'listo')
}
