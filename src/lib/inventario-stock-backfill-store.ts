/**
 * Flag durable, por dispositivo, del backfill de `inventario_stock` (Slice
 * 2a — fix CRITICAL). Ver `src/features/inventario/lib/inventario-stock-backfill.ts`
 * para la orquestacion completa.
 *
 * Mismo patron que `src/lib/upload-retry-store.ts`: wrapper sobre un storage
 * tipo `Storage` (localStorage por defecto), lectura/escritura protegidas
 * con try/catch — un fallo de storage (cuota excedida, modo privado/kiosk)
 * NUNCA debe interrumpir el flujo de la app.
 */

const STORAGE_KEY = 'clarapos_inventario_stock_backfill'

/**
 * Version actual del backfill. Si en el futuro se necesita re-ejecutar
 * (ej. un cambio de esquema en `inventario_stock`), basta con incrementarla
 * — cualquier flag persistido con una version distinta se trata como "no
 * ejecutado".
 */
const CURRENT_VERSION = 'v1'

/**
 * Decide si el backfill debe ejecutarse dado el valor crudo del flag
 * persistido. `null` (nunca corrio) y cualquier version distinta a la
 * actual (ej. flag de un esquema anterior) requieren ejecutarlo.
 */
export function debeEjecutarBackfill(flagValue: string | null): boolean {
  return flagValue !== CURRENT_VERSION
}

export class InventarioStockBackfillStore {
  constructor(private readonly storage: Storage = localStorage) {}

  /**
   * Si `getItem` falla (storage no disponible, modo privado/kiosk), degrada
   * a `null` — tratado por `debeEjecutarBackfill` como "no ejecutado", que
   * es el comportamiento mas seguro (intentar el backfill en vez de asumir
   * que ya corrio).
   */
  private readFlag(): string | null {
    try {
      return this.storage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  }

  /**
   * Si `setItem` falla, degrada silenciosamente: el flag es best-effort, y
   * una falla de escritura NUNCA debe interrumpir el flujo de la app (en el
   * peor caso, el backfill se reintenta en el proximo arranque).
   */
  private writeFlag(value: string): void {
    try {
      this.storage.setItem(STORAGE_KEY, value)
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[inventario-stock-backfill-store] No se pudo persistir el flag de backfill:', error)
      }
    }
  }

  /** `true` si el backfill ya se ejecuto en este dispositivo para la version actual. */
  yaEjecutado(): boolean {
    return !debeEjecutarBackfill(this.readFlag())
  }

  /** Marca el backfill como completado en este dispositivo. */
  marcarCompletado(): void {
    this.writeFlag(CURRENT_VERSION)
  }
}

/** Instancia compartida usada por `useInventarioStockBackfill`. */
export const inventarioStockBackfillStore = new InventarioStockBackfillStore()
