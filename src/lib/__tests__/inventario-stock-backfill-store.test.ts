import { InventarioStockBackfillStore, debeEjecutarBackfill } from '../inventario-stock-backfill-store'

/**
 * Storage en memoria que implementa la interfaz mínima usada por
 * InventarioStockBackfillStore (getItem/setItem), sin depender de
 * localStorage real. Mismo patron que upload-retry-store.test.ts.
 */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size
    },
  } as Storage
}

function createThrowingStorage(): Storage {
  return {
    getItem: () => {
      throw new DOMException('SecurityError', 'SecurityError')
    },
    setItem: () => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    },
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage
}

describe('debeEjecutarBackfill (función pura)', () => {
  it('flag ausente (null, primer arranque): debe ejecutar el backfill', () => {
    expect(debeEjecutarBackfill(null)).toBe(true)
  })

  it('flag con la version actual (ya corrido): NO debe re-ejecutar', () => {
    expect(debeEjecutarBackfill('v1')).toBe(false)
  })

  it('flag con una version DISTINTA (ej. de un cambio futuro de esquema): debe re-ejecutar', () => {
    expect(debeEjecutarBackfill('v0-legacy')).toBe(true)
  })
})

describe('InventarioStockBackfillStore — persistencia durable entre instancias (simula reload de app)', () => {
  it('yaEjecutado() retorna false cuando no hay flag previo (primer arranque)', () => {
    const store = new InventarioStockBackfillStore(createMemoryStorage())
    expect(store.yaEjecutado()).toBe(false)
  })

  it('marcarCompletado() persiste el flag y una NUEVA instancia sobre el mismo storage lo ve completado', () => {
    const sharedStorage = createMemoryStorage()

    const storeAntesDelReload = new InventarioStockBackfillStore(sharedStorage)
    storeAntesDelReload.marcarCompletado()

    // Simula un reload de la app: nueva instancia, mismo storage durable subyacente.
    const storeDespuesDelReload = new InventarioStockBackfillStore(sharedStorage)
    expect(storeDespuesDelReload.yaEjecutado()).toBe(true)
  })
})

describe('InventarioStockBackfillStore — degradación cuando el storage falla (modo privado/kiosk, cuota excedida)', () => {
  it('yaEjecutado() NO lanza cuando getItem falla, y retorna false (permite intentar el backfill)', () => {
    const store = new InventarioStockBackfillStore(createThrowingStorage())
    expect(() => store.yaEjecutado()).not.toThrow()
    expect(store.yaEjecutado()).toBe(false)
  })

  it('marcarCompletado() no lanza cuando setItem falla', () => {
    const store = new InventarioStockBackfillStore(createThrowingStorage())
    expect(() => store.marcarCompletado()).not.toThrow()
  })
})
