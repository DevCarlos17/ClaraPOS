import { UpdateType } from '@powersync/web'

/**
 * PART 1 del fix del 23505 duplicate key (`uq_stock_empresa_producto_deposito`) reportado
 * por el tester sobre `inventario-multideposito`: el PUT de `inventario_stock` debe resolver
 * por clave natural (empresa_id,producto_id,deposito_id) en vez de un upsert genérico por
 * `id`. Mismo patrón de mock que `connector-upload-retry.test.ts` — `createClient` se
 * mockea para no tocar la red real.
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

type CrudOp = {
  id: string
  op: UpdateType
  table: string
  opData: Record<string, unknown>
}

/** Fake mínimo de `AbstractPowerSyncDatabase` — solo lo que `uploadData` invoca. */
function makeFakeDb(op: CrudOp) {
  const complete = vi.fn().mockResolvedValue(undefined)
  const transaction = { crud: [op], complete }
  return {
    db: {
      getNextCrudTransaction: vi.fn().mockResolvedValue(transaction),
      getOptional: vi.fn(),
    },
    complete,
  }
}

function inventarioStockOp(overrides: Partial<CrudOp['opData']> = {}, id = 'local-uuid-1'): CrudOp {
  return {
    id,
    op: UpdateType.PUT,
    table: 'inventario_stock',
    opData: {
      empresa_id: 'emp-1',
      producto_id: 'prod-1',
      deposito_id: 'dep-1',
      cantidad_actual: '15.500',
      stock_reservado: '0.000',
      updated_at: '2026-08-20T10:00:00-04:00',
      updated_by: 'user-1',
      ...overrides,
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  fakeFrom.mockReset()
})

describe('SupabaseConnector.uploadData — inventario_stock PUT resuelve por clave natural (empresa_id,producto_id,deposito_id)', () => {
  it('ya existe una fila en Supabase con la misma clave natural (id local distinto — ej. backfill de arranque vs. compra casi simultánea): hace UPDATE por clave natural, NUNCA intenta INSERT', async () => {
    const updateSpy = vi.fn()
    const matchSpy = vi.fn()
    const insertSpy = vi.fn()
    fakeFrom.mockImplementation(() => ({
      update: (payload: unknown) => {
        updateSpy(payload)
        return {
          match: (filter: unknown) => {
            matchSpy(filter)
            return { select: () => Promise.resolve({ data: [{ id: 'fila-supabase-existente' }], error: null }) }
          },
        }
      },
      insert: insertSpy,
    }))

    const connector = new SupabaseConnector()
    const uploadFailedSpy = vi.fn()
    connector.registerListener({ uploadFailed: uploadFailedSpy })
    const { db, complete } = makeFakeDb(inventarioStockOp({ cantidad_actual: '15.500' }))

    await connector.uploadData(db as never)

    expect(complete).toHaveBeenCalledTimes(1)
    expect(uploadFailedSpy).not.toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
    expect(matchSpy).toHaveBeenCalledWith({ empresa_id: 'emp-1', producto_id: 'prod-1', deposito_id: 'dep-1' })

    const payload = updateSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(payload.cantidad_actual).toBe('15.500')
    // Columnas de clave natural NUNCA viajan en el payload de UPDATE (son el filtro del match)
    expect(payload).not.toHaveProperty('empresa_id')
    expect(payload).not.toHaveProperty('producto_id')
    expect(payload).not.toHaveProperty('deposito_id')
  })

  it('sin fila previa en Supabase para esa clave natural: UPDATE afecta 0 filas -> hace INSERT con el UUID local (primera sincronizacion real de ese producto/deposito)', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null })
    fakeFrom.mockImplementation(() => ({
      update: () => ({
        match: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
      }),
      insert: insertSpy,
    }))

    const connector = new SupabaseConnector()
    const { db, complete } = makeFakeDb(
      inventarioStockOp({ producto_id: 'prod-2', deposito_id: 'dep-2', cantidad_actual: '9.000' })
    )

    await connector.uploadData(db as never)

    expect(complete).toHaveBeenCalledTimes(1)
    expect(insertSpy).toHaveBeenCalledTimes(1)
    const insertedRecord = insertSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(insertedRecord.id).toBe('local-uuid-1')
    expect(insertedRecord.cantidad_actual).toBe('9.000')
    expect(insertedRecord.empresa_id).toBe('emp-1')
  })

  it('reproduce el escenario exacto del bug reportado por el tester: segundo PUT para la MISMA clave natural con id local distinto converge via UPDATE, en vez de lanzar 23505 y descartar la transaccion', async () => {
    // Simula: la fila YA existe en Supabase (insertada por una tx anterior — el backfill,
    // o el primer PUT de una compra multi-deposito). Antes del fix, el upsert generico por
    // `id` habria intentado un INSERT con este id local DISTINTO, chocando contra
    // `uq_stock_empresa_producto_deposito` (23505) -> uploadFailed + descarte de la tx.
    const uploadFailedSpy = vi.fn()
    fakeFrom.mockImplementation(() => ({
      update: () => ({
        match: () => ({ select: () => Promise.resolve({ data: [{ id: 'fila-de-supabase' }], error: null }) }),
      }),
      insert: vi.fn(),
    }))

    const connector = new SupabaseConnector()
    connector.registerListener({ uploadFailed: uploadFailedSpy })
    const { db, complete } = makeFakeDb(
      inventarioStockOp({ producto_id: 'prod-3', cantidad_actual: '20.000' }, 'local-uuid-compra-2')
    )

    await connector.uploadData(db as never)

    expect(complete).toHaveBeenCalledTimes(1)
    expect(uploadFailedSpy).not.toHaveBeenCalled()
  })
})
