/**
 * Contador durable de reintentos de upload de PowerSync.
 *
 * PowerSync re-invoca `uploadData` en cada arranque de la app (el CRUD
 * queue es FIFO y persistente en SQLite), pero un contador en memoria
 * (`Map`) se resetea en cada reload de página. Eso permite que una
 * transacción que falla repetidamente por un error transitorio de red
 * jamás llegue a `MAX_UPLOAD_RETRIES` a través de reloads, bloqueando
 * la cola de sync indefinidamente.
 *
 * Este módulo persiste el conteo de reintentos por transacción en un
 * storage durable (localStorage por defecto) para que sobreviva a
 * reloads y la transacción se descarte correctamente tras N intentos
 * reales.
 */

const STORAGE_KEY = 'clarapos_upload_retry_counts'

type RetryCountMap = Record<string, number>

/** Retorna el conteo de reintentos de `txKey`, o 0 si no existe. */
export function getRetryCount(map: RetryCountMap, txKey: string): number {
  return map[txKey] ?? 0
}

/** Retorna un NUEVO mapa con el conteo de `txKey` incrementado en 1. */
export function bumpRetryCount(map: RetryCountMap, txKey: string): RetryCountMap {
  return { ...map, [txKey]: getRetryCount(map, txKey) + 1 }
}

/** Retorna un NUEVO mapa sin la entrada de `txKey` (poda — evita crecimiento sin límite). */
export function clearRetryCount(map: RetryCountMap, txKey: string): RetryCountMap {
  const { [txKey]: _removed, ...rest } = map
  return rest
}

/**
 * Wrapper durable sobre un storage tipo `Storage` (localStorage por defecto).
 * Cada método lee el mapa completo, aplica la transformación pura
 * correspondiente y persiste el resultado — no hay estado en memoria.
 */
export class UploadRetryStore {
  constructor(private readonly storage: Storage = localStorage) {}

  private readMap(): RetryCountMap {
    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw) as unknown
      return parsed && typeof parsed === 'object' ? (parsed as RetryCountMap) : {}
    } catch {
      return {}
    }
  }

  /**
   * Persiste `map` en el storage. Si `setItem` falla (cuota excedida, modo
   * privado/kiosk), degrada silenciosamente en vez de propagar la excepción:
   * el conteo de reintentos es best-effort, y una falla de escritura NUNCA
   * debe interrumpir el flujo de upload/descarte de PowerSync (ver
   * `connector.ts`, que llama a `bump()`/`clear()` antes de
   * `transaction.complete()`).
   */
  private writeMap(map: RetryCountMap): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(map))
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[upload-retry-store] No se pudo persistir el conteo de reintentos:', error)
      }
    }
  }

  /** Conteo actual de reintentos para `txKey` (0 si no hay ninguno registrado). */
  get(txKey: string): number {
    return getRetryCount(this.readMap(), txKey)
  }

  /** Incrementa y persiste el conteo de `txKey`. Retorna el nuevo valor. */
  bump(txKey: string): number {
    const updated = bumpRetryCount(this.readMap(), txKey)
    this.writeMap(updated)
    return updated[txKey]
  }

  /** Limpia el conteo persistido de `txKey` (éxito o descarte definitivo). */
  clear(txKey: string): void {
    this.writeMap(clearRetryCount(this.readMap(), txKey))
  }
}

/** Instancia compartida usada por el connector de PowerSync. */
export const uploadRetryStore = new UploadRetryStore()
