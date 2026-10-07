import { UpdateType } from '@powersync/web'

/**
 * Fase 3 de saf-snapshot-y-trazabilidad: `saf_disponible` se agrega a
 * `TRIGGER_MANAGED_PATCH_COLUMNS.clientes` (mismo mecanismo de stripping ya
 * usado para `saldo_actual`) para que el PATCH subido a Supabase NUNCA
 * incluya esta columna — el trigger `actualizar_saldo_cliente()` (migration
 * 0102) es la UNICA autoridad server-side, y un UPDATE directo sobre una
 * columna gestionada por trigger no existe como constraint bloqueante aqui,
 * pero subirla de todos modos pisaria el valor recien calculado por el
 * trigger con el valor optimista local obsoleto en la siguiente sync.
 *
 * Mismo patron de mock que `connector-inventario-stock-upsert.test.ts`.
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

function clientesPatchOp(overrides: Partial<CrudOp['opData']> = {}): CrudOp {
  return {
    id: 'cliente-1',
    op: UpdateType.PATCH,
    table: 'clientes',
    opData: {
      saldo_actual: '-50.00000000',
      saf_disponible: '50.00000000',
      updated_at: '2026-10-07T10:00:00-04:00',
      ...overrides,
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  fakeFrom.mockReset()
})

describe('SupabaseConnector.uploadData — clientes PATCH jamas incluye saf_disponible (TRIGGER_MANAGED_PATCH_COLUMNS)', () => {
  it('un cambio local que afecta saldo_actual Y saf_disponible sube el PATCH sin ninguna de las dos columnas gestionadas por trigger', async () => {
    const updateSpy = vi.fn()
    fakeFrom.mockImplementation(() => ({
      update: (payload: unknown) => {
        updateSpy(payload)
        return {
          eq: () => ({
            select: () => Promise.resolve({ data: [{ id: 'cliente-1' }], error: null }),
          }),
        }
      },
    }))

    const connector = new SupabaseConnector()
    const { db, complete } = makeFakeDb(clientesPatchOp())

    await connector.uploadData(db as never)

    expect(complete).toHaveBeenCalledTimes(1)
    const payload = updateSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('saf_disponible')
    expect(payload).not.toHaveProperty('saldo_actual')
    // El resto del payload (no gestionado por trigger) SI debe subir
    expect(payload).toHaveProperty('updated_at', '2026-10-07T10:00:00-04:00')
  })

  it('un PATCH que SOLO toca columnas gestionadas por trigger se omite por completo (sin llamar a Supabase)', async () => {
    const updateSpy = vi.fn()
    fakeFrom.mockImplementation(() => ({
      update: updateSpy,
    }))

    const connector = new SupabaseConnector()
    const soloColumnasGestionadas: CrudOp = {
      id: 'cliente-1',
      op: UpdateType.PATCH,
      table: 'clientes',
      opData: {
        saldo_actual: '-50.00000000',
        saf_disponible: '50.00000000',
      },
    }
    const { db, complete } = makeFakeDb(soloColumnasGestionadas)

    await connector.uploadData(db as never)

    expect(complete).toHaveBeenCalledTimes(1)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
