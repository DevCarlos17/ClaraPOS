import { UpdateType } from '@powersync/web'
import { uploadRetryStore } from '@/lib/upload-retry-store'

/**
 * `connector.ts` construye un `SupabaseClient` real vía `createClient` como
 * efecto secundario a nivel de módulo (`export const connector = new SupabaseConnector()`).
 * Mockeamos `createClient` para evitar tocar la red real y controlar por completo
 * las respuestas de `.from(table)...` que ejercita `uploadData`.
 */
const fakeFrom = vi.fn()

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<object>()
  return {
    ...actual,
    createClient: vi.fn(() => ({
      auth: {
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
        getSession: vi.fn(),
      },
      from: fakeFrom,
    })),
  }
})

const { SupabaseConnector } = await import('../powersync/connector')

/** Error de red transitorio tal como llega desde un 520 de Cloudflare-en-frente-de-PostgREST. */
const TRANSIENT_NETWORK_ERROR = Object.assign(new Error('Failed to fetch'), { code: '' })

function makeTransientUpdateChain() {
  return {
    update: () => ({
      eq: () => ({
        select: () => Promise.reject(TRANSIENT_NETWORK_ERROR),
      }),
    }),
  }
}

function makeSuccessfulUpdateChain() {
  return {
    update: () => ({
      eq: () => ({
        select: () => Promise.resolve({ data: [{ id: 'op-1' }], error: null }),
      }),
    }),
  }
}

/** Fake mínimo de `AbstractPowerSyncDatabase` — solo lo que `uploadData` invoca. */
function makeFakeDb(txId: string) {
  const complete = vi.fn().mockResolvedValue(undefined)
  const transaction = {
    crud: [
      {
        id: txId,
        op: UpdateType.PATCH,
        table: 'departamentos',
        opData: { nombre: 'Test' },
      },
    ],
    complete,
  }
  return {
    db: {
      getNextCrudTransaction: vi.fn().mockResolvedValue(transaction),
      getOptional: vi.fn(),
    },
    complete,
  }
}

beforeEach(() => {
  localStorage.clear()
  fakeFrom.mockReset()
})

describe('SupabaseConnector.uploadData — persistencia durable del contador de reintentos', () => {
  it('un error transitorio persiste el contador y una NUEVA instancia (simula reload) lo lee acumulado', async () => {
    fakeFrom.mockImplementation(() => makeTransientUpdateChain())

    const connectorBeforeReload = new SupabaseConnector()
    const { db: db1 } = makeFakeDb('op-1')
    await expect(connectorBeforeReload.uploadData(db1 as never)).rejects.toBe(TRANSIENT_NETWORK_ERROR)

    // Simula un reload de la app: nueva instancia del connector (estado en memoria perdido),
    // pero el storage durable (localStorage) sigue teniendo el contador.
    expect(uploadRetryStore.get('op-1')).toBe(1)

    const connectorAfterReload = new SupabaseConnector()
    const { db: db2 } = makeFakeDb('op-1')
    await expect(connectorAfterReload.uploadData(db2 as never)).rejects.toBe(TRANSIENT_NETWORK_ERROR)

    expect(uploadRetryStore.get('op-1')).toBe(2)
  })

  it('tras MAX_UPLOAD_RETRIES (5) fallos transitorios acumulados a través de reloads, descarta la transacción', async () => {
    fakeFrom.mockImplementation(() => makeTransientUpdateChain())

    const uploadFailedSpy = vi.fn()
    let lastComplete: ReturnType<typeof vi.fn> | undefined

    for (let attempt = 1; attempt <= 5; attempt++) {
      // Cada iteración simula un reload: nueva instancia, nuevo listener registrado,
      // nuevo mock de `db`/`transaction.complete` — solo localStorage persiste entre iteraciones.
      const connector = new SupabaseConnector()
      connector.registerListener({ uploadFailed: uploadFailedSpy })
      const { db, complete } = makeFakeDb('op-1')
      lastComplete = complete

      if (attempt < 5) {
        await expect(connector.uploadData(db as never)).rejects.toBe(TRANSIENT_NETWORK_ERROR)
      } else {
        // Quinto intento: se agotan los reintentos → se descarta sin volver a lanzar.
        await connector.uploadData(db as never)
      }
    }

    expect(lastComplete).toHaveBeenCalledTimes(1)
    expect(uploadFailedSpy).toHaveBeenCalledTimes(1)
    expect(uploadFailedSpy).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'departamentos', id: 'op-1', reason: 'max_retries' })
    )

    // El contador persistido se limpia tras el descarte — no debe crecer sin límite.
    expect(uploadRetryStore.get('op-1')).toBe(0)
  })

  it('una subida exitosa limpia el contador de reintentos persistido para esa transacción', async () => {
    // Primer intento falla (persiste contador = 1)...
    fakeFrom.mockImplementation(() => makeTransientUpdateChain())
    const connector1 = new SupabaseConnector()
    const { db: dbFail } = makeFakeDb('op-1')
    await expect(connector1.uploadData(dbFail as never)).rejects.toBe(TRANSIENT_NETWORK_ERROR)
    expect(uploadRetryStore.get('op-1')).toBe(1)

    // ...luego reintenta (nueva instancia, simula reload) y esta vez el servidor responde OK.
    fakeFrom.mockImplementation(() => makeSuccessfulUpdateChain())
    const connector2 = new SupabaseConnector()
    const { db: dbOk, complete } = makeFakeDb('op-1')
    await connector2.uploadData(dbOk as never)

    expect(complete).toHaveBeenCalledTimes(1)
    expect(uploadRetryStore.get('op-1')).toBe(0)
  })
})
