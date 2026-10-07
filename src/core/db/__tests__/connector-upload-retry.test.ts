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

const { SupabaseConnector, isNoConnectivityError, FATAL_RESPONSE_CODES } = await import(
  '../powersync/connector'
)

/**
 * Fallo de conectividad real tal como lo lanza `PostgrestBuilder` cuando `fetch()`
 * rechaza (sin internet): un objeto plano, NUNCA una instancia de `Error`. `details`
 * queda poblado con el stack trace del `TypeError` original, no con un mensaje de
 * PostgREST — por eso el heuristico `hasPostgrestShape` no puede confiar en el shape.
 */
const NO_CONNECTIVITY_ERROR = {
  code: '',
  message: 'TypeError: Failed to fetch',
  details: 'TypeError: Failed to fetch\n    at foo',
  hint: '',
}

/** Variante como instancia real de `Error` — cubre el caso legado (regresion). */
const NO_CONNECTIVITY_ERROR_INSTANCE = Object.assign(new Error('Failed to fetch'), { code: '' })

/** Error transitorio CON conexión — el servidor respondió (ej. 503 upstream caído). */
const TRANSIENT_SERVER_ERROR = Object.assign(new Error('Service Unavailable'), {
  status: 503,
  details: 'upstream down',
})

/** Errores de esquema clase 42 (fatales) — PostgREST los mapea a 400/403/404, nunca a un 5xx reintentable. */
const SCHEMA_ERROR_42883 = Object.assign(new Error('function does not exist'), { code: '42883' })
const UNDEFINED_TABLE_42P01 = Object.assign(new Error('relation does not exist'), { code: '42P01' })
const UNDEFINED_COLUMN_42703 = Object.assign(new Error('column does not exist'), { code: '42703' })

/** Error transitorio CON conexión (serialization_failure) — debe seguir el camino de reintento, no el fatal. */
const TRANSIENT_SERIALIZATION_ERROR = Object.assign(new Error('could not serialize access'), {
  code: '40001',
})

function makeTransientUpdateChain(error: unknown = NO_CONNECTIVITY_ERROR) {
  return {
    update: () => ({
      eq: () => ({
        select: () => Promise.reject(error),
      }),
    }),
    // Usado por el PUT de tablas IMMUTABLE_TABLES (ej. movimientos_inventario), que
    // no pasa por el camino update/eq/select sino por upsert directo.
    upsert: () => Promise.reject(error),
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
function makeFakeDb(
  txId: string,
  opOverrides: { table?: string; op?: UpdateType; opData?: Record<string, unknown> } = {}
) {
  const complete = vi.fn().mockResolvedValue(undefined)
  const transaction = {
    crud: [
      {
        id: txId,
        op: opOverrides.op ?? UpdateType.PATCH,
        table: opOverrides.table ?? 'departamentos',
        opData: opOverrides.opData ?? { nombre: 'Test' },
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

describe('isNoConnectivityError', () => {
  it('es true para un TypeError nativo de fetch', () => {
    expect(isNoConnectivityError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('es true para un error con code vacio y mensaje de fetch (fixture real del navegador)', () => {
    expect(isNoConnectivityError(NO_CONNECTIVITY_ERROR_INSTANCE)).toBe(true)
  })

  it('es false para una respuesta real de PostgREST (status/details presentes)', () => {
    expect(
      isNoConnectivityError(Object.assign(new Error('x'), { status: 503, details: 'y' }))
    ).toBe(false)
  })

  it('es false para un error con code fatal (respuesta real del servidor)', () => {
    expect(isNoConnectivityError(Object.assign(new Error('constraint'), { code: '23505' }))).toBe(false)
  })

  it('es true para el objeto plano real de sin-conectividad (PostgrestBuilder, no es instancia de Error)', () => {
    expect(isNoConnectivityError(NO_CONNECTIVITY_ERROR)).toBe(true)
  })

  it('es true para un objeto plano con mensaje de Firefox ("NetworkError when attempting to fetch resource.")', () => {
    expect(
      isNoConnectivityError({
        code: '',
        message: 'NetworkError when attempting to fetch resource.',
        details: '',
        hint: '',
      })
    ).toBe(true)
  })

  it('es true para un objeto plano con mensaje de Safari ("Load failed")', () => {
    expect(
      isNoConnectivityError({ code: '', message: 'Load failed', details: '', hint: '' })
    ).toBe(true)
  })

  it('es false para un objeto plano fatal con code real (FK violation) aunque tenga details', () => {
    expect(
      isNoConnectivityError({
        code: '23503',
        message: 'insert or update on table violates foreign key constraint',
        details: 'Key (producto_id)=(x) is not present in table "productos".',
        hint: '',
      })
    ).toBe(false)
  })

  it('es false para un objeto plano transitorio sin substring de fetch (5xx no-JSON, ej. Internal Server Error)', () => {
    expect(
      isNoConnectivityError({
        code: '',
        message: 'Internal Server Error',
        details: '<html><body>500</body></html>',
        hint: '',
      })
    ).toBe(false)
  })
})

describe('FATAL_RESPONSE_CODES — clase 42', () => {
  it.each(['42883', '42P01', '42703', '42601', '42501'])(
    'matchea el codigo SQLSTATE clase 42 "%s"',
    (code) => {
      expect(FATAL_RESPONSE_CODES.some((regex) => regex.test(code))).toBe(true)
    }
  )

  it.each(['40001', '53300'])(
    'NO matchea el codigo transitorio "%s" (debe seguir el camino de reintento)',
    (code) => {
      expect(FATAL_RESPONSE_CODES.some((regex) => regex.test(code))).toBe(false)
    }
  )
})

describe('SupabaseConnector.uploadData — persistencia durable del contador de reintentos', () => {
  it('un error de sin-conectividad NUNCA cuenta para el contador, sin importar cuantos intentos', async () => {
    fakeFrom.mockImplementation(() => makeTransientUpdateChain(NO_CONNECTIVITY_ERROR))

    const uploadFailedSpy = vi.fn()

    for (let attempt = 1; attempt <= 10; attempt++) {
      // Cada iteración simula un reload: nueva instancia, nuevo listener registrado,
      // nuevo mock de `db`/`transaction.complete` — solo localStorage persiste entre iteraciones.
      const connector = new SupabaseConnector()
      connector.registerListener({ uploadFailed: uploadFailedSpy })
      const { db } = makeFakeDb('op-1')
      await expect(connector.uploadData(db as never)).rejects.toBe(NO_CONNECTIVITY_ERROR)
      // El contador NUNCA se incrementa: sin conectividad no es un reintento "transitorio-con-conexión".
      expect(uploadRetryStore.get('op-1')).toBe(0)
    }

    expect(uploadFailedSpy).not.toHaveBeenCalled()
  })

  it('tras MAX_UPLOAD_RETRIES (5) fallos transitorios CON conexión, descarta la transacción', async () => {
    fakeFrom.mockImplementation(() => makeTransientUpdateChain(TRANSIENT_SERVER_ERROR))

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
        await expect(connector.uploadData(db as never)).rejects.toBe(TRANSIENT_SERVER_ERROR)
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
    // Primer intento falla por sin-conectividad (contador se mantiene en 0)...
    fakeFrom.mockImplementation(() => makeTransientUpdateChain(NO_CONNECTIVITY_ERROR))
    const connector1 = new SupabaseConnector()
    const { db: dbFail } = makeFakeDb('op-1')
    await expect(connector1.uploadData(dbFail as never)).rejects.toBe(NO_CONNECTIVITY_ERROR)
    expect(uploadRetryStore.get('op-1')).toBe(0)

    // ...luego reintenta (nueva instancia, simula reload) y esta vez el servidor responde OK.
    fakeFrom.mockImplementation(() => makeSuccessfulUpdateChain())
    const connector2 = new SupabaseConnector()
    const { db: dbOk, complete } = makeFakeDb('op-1')
    await connector2.uploadData(dbOk as never)

    expect(complete).toHaveBeenCalledTimes(1)
    expect(uploadRetryStore.get('op-1')).toBe(0)
  })

  it('un insert en movimientos_inventario (kardex, tabla inmutable) permanece en cola ante sin-conectividad', async () => {
    fakeFrom.mockImplementation(() => makeTransientUpdateChain(NO_CONNECTIVITY_ERROR))

    const connector = new SupabaseConnector()
    const { db, complete } = makeFakeDb('kardex-1', {
      table: 'movimientos_inventario',
      op: UpdateType.PUT,
      opData: { producto_id: 'prod-1', cantidad: 5 },
    })

    await expect(connector.uploadData(db as never)).rejects.toBe(NO_CONNECTIVITY_ERROR)

    // El registro del Kardex NUNCA se descarta ni se cuenta como reintento transitorio:
    // queda en cola exactamente igual que cualquier otra tabla ante sin-conectividad.
    expect(complete).not.toHaveBeenCalled()
    expect(uploadRetryStore.get('kardex-1')).toBe(0)
  })
})

describe('SupabaseConnector.uploadData — errores de esquema clase 42 (fatal)', () => {
  it.each([
    ['42883', SCHEMA_ERROR_42883],
    ['42P01', UNDEFINED_TABLE_42P01],
    ['42703', UNDEFINED_COLUMN_42703],
  ])('descarta inmediatamente ante un error %s sin recorrer el camino de reintento', async (_code, fixture) => {
    fakeFrom.mockImplementation(() => makeTransientUpdateChain(fixture))

    const uploadFailedSpy = vi.fn()
    const connector = new SupabaseConnector()
    connector.registerListener({ uploadFailed: uploadFailedSpy })
    const { db, complete } = makeFakeDb('op-1')

    // No lanza: el error fatal se descarta dentro de uploadData, nunca se propaga.
    await connector.uploadData(db as never)

    expect(uploadFailedSpy).toHaveBeenCalledTimes(1)
    expect(uploadFailedSpy).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'departamentos', id: 'op-1', reason: 'db_error' })
    )
    // No cuenta como reintento transitorio: el contador nunca se incrementa.
    expect(uploadRetryStore.get('op-1')).toBe(0)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('contraste: un error transitorio de clase 40 (serialization_failure) SI sigue el camino de reintento', async () => {
    fakeFrom.mockImplementation(() => makeTransientUpdateChain(TRANSIENT_SERIALIZATION_ERROR))

    const uploadFailedSpy = vi.fn()
    const connector = new SupabaseConnector()
    connector.registerListener({ uploadFailed: uploadFailedSpy })
    const { db, complete } = makeFakeDb('op-1')

    // A diferencia de clase 42: en el primer intento NO se descarta, se relanza para reintentar.
    await expect(connector.uploadData(db as never)).rejects.toBe(TRANSIENT_SERIALIZATION_ERROR)

    expect(uploadFailedSpy).not.toHaveBeenCalled()
    expect(uploadRetryStore.get('op-1')).toBe(1)
    expect(complete).not.toHaveBeenCalled()
  })
})
