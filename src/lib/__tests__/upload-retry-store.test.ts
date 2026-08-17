import { UploadRetryStore, bumpRetryCount, clearRetryCount, getRetryCount } from '../upload-retry-store'

/**
 * Storage en memoria que implementa la interfaz mínima usada por UploadRetryStore
 * (getItem/setItem/removeItem), sin depender de localStorage real.
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

describe('getRetryCount (función pura)', () => {
  it('retorna 0 cuando la clave no existe en el mapa', () => {
    expect(getRetryCount({}, 'tx1')).toBe(0)
  })

  it('retorna el valor persistido cuando la clave existe', () => {
    expect(getRetryCount({ tx1: 3 }, 'tx1')).toBe(3)
  })
})

describe('bumpRetryCount (función pura)', () => {
  it('incrementa el contador de una clave nueva a 1', () => {
    expect(bumpRetryCount({}, 'tx1')).toEqual({ tx1: 1 })
  })

  it('incrementa el contador de una clave existente sin afectar otras claves', () => {
    expect(bumpRetryCount({ tx1: 2, tx2: 5 }, 'tx1')).toEqual({ tx1: 3, tx2: 5 })
  })
})

describe('clearRetryCount (función pura)', () => {
  it('elimina la clave del mapa (poda — no deja entradas residuales)', () => {
    expect(clearRetryCount({ tx1: 4, tx2: 1 }, 'tx1')).toEqual({ tx2: 1 })
  })

  it('no falla si la clave no existe', () => {
    expect(clearRetryCount({ tx2: 1 }, 'tx1')).toEqual({ tx2: 1 })
  })
})

describe('UploadRetryStore — persistencia durable entre instancias (simula reload de app)', () => {
  it('get() retorna 0 cuando no hay reintentos previos para la clave', () => {
    const store = new UploadRetryStore(createMemoryStorage())
    expect(store.get('tx1')).toBe(0)
  })

  it('bump() persiste el conteo y una NUEVA instancia sobre el mismo storage lo lee acumulado', () => {
    const sharedStorage = createMemoryStorage()

    const storeBeforeReload = new UploadRetryStore(sharedStorage)
    storeBeforeReload.bump('tx1')
    storeBeforeReload.bump('tx1')

    // Simula un reload de la app: nueva instancia, mismo storage durable subyacente.
    const storeAfterReload = new UploadRetryStore(sharedStorage)
    expect(storeAfterReload.get('tx1')).toBe(2)
  })

  it('bump() retorna el nuevo conteo tras persistirlo', () => {
    const store = new UploadRetryStore(createMemoryStorage())
    expect(store.bump('tx1')).toBe(1)
    expect(store.bump('tx1')).toBe(2)
  })

  it('clear() elimina el conteo persistido para esa clave', () => {
    const sharedStorage = createMemoryStorage()
    const store = new UploadRetryStore(sharedStorage)
    store.bump('tx1')
    store.clear('tx1')

    const storeAfterReload = new UploadRetryStore(sharedStorage)
    expect(storeAfterReload.get('tx1')).toBe(0)
  })

  it('claves distintas mantienen contadores independientes', () => {
    const store = new UploadRetryStore(createMemoryStorage())
    store.bump('tx1')
    store.bump('tx2')
    store.bump('tx2')
    expect(store.get('tx1')).toBe(1)
    expect(store.get('tx2')).toBe(2)
  })

  it('storage corrupto (JSON inválido) se trata como mapa vacío en vez de lanzar', () => {
    const storage = createMemoryStorage()
    storage.setItem('clarapos_upload_retry_counts', '{not valid json')
    const store = new UploadRetryStore(storage)
    expect(store.get('tx1')).toBe(0)
  })
})

describe('UploadRetryStore — degradación cuando el storage falla al escribir (quota excedida, modo privado/kiosk)', () => {
  /**
   * Storage cuyo setItem siempre lanza, simulando localStorage.setItem
   * fallando por QuotaExceededError o restricciones de modo privado/kiosk.
   */
  function createThrowingWriteStorage(): Storage {
    const map = new Map<string, string>()
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: () => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError')
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

  it('bump() no lanza cuando setItem falla, y get() sigue retornando un número sano', () => {
    const store = new UploadRetryStore(createThrowingWriteStorage())

    expect(() => store.bump('tx1')).not.toThrow()
    expect(store.get('tx1')).toBe(0)
  })

  it('clear() no lanza cuando setItem falla', () => {
    const store = new UploadRetryStore(createThrowingWriteStorage())

    expect(() => store.clear('tx1')).not.toThrow()
  })
})
