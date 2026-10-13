import { UpdateType } from '@powersync/web'

/**
 * cxc-sync-snapshot-redesign (estado-only): `ventas.estado` se agrega a
 * `TRIGGER_MANAGED_PATCH_COLUMNS.ventas` (mismo mecanismo de stripping ya
 * usado para `clientes.saldo_actual`/`saf_disponible`) para que el PATCH
 * subido a Supabase NUNCA incluya esta columna — el trigger
 * `prevent_venta_mutation()` (migration 0106) es la UNICA autoridad
 * server-side. El cliente escribe un `estado` optimista local (ver
 * `src/features/cxc/lib/estado-venta.ts`), pero esa escritura jamas debe
 * viajar al servidor: subirla pisaria el valor recien calculado por el
 * trigger con el valor optimista local obsoleto en la siguiente sync.
 *
 * Mismo patron de mock que `connector-saf-disponible-patch-strip.test.ts`.
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

function ventasPatchOp(overrides: Partial<CrudOp['opData']> = {}): CrudOp {
  return {
    id: 'venta-1',
    op: UpdateType.PATCH,
    table: 'ventas',
    opData: {
      estado: 'pago',
      saldo_pend_usd: '0',
      ...overrides,
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  fakeFrom.mockReset()
})

describe('SupabaseConnector.uploadData — ventas PATCH jamas incluye estado (TRIGGER_MANAGED_PATCH_COLUMNS)', () => {
  it('un PATCH que toca estado y saldo_pend_usd sube SOLO saldo_pend_usd (estado se omite)', async () => {
    const updateSpy = vi.fn()
    fakeFrom.mockImplementation(() => ({
      update: (payload: unknown) => {
        updateSpy(payload)
        return {
          eq: () => ({
            select: () => Promise.resolve({ data: [{ id: 'venta-1' }], error: null }),
          }),
        }
      },
    }))

    const connector = new SupabaseConnector()
    const { db, complete } = makeFakeDb(ventasPatchOp())

    await connector.uploadData(db as never)

    expect(complete).toHaveBeenCalledTimes(1)
    const payload = updateSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('estado')
    // saldo_pend_usd NO esta gestionado por trigger desde el cliente — sigue subiendo
    expect(payload).toHaveProperty('saldo_pend_usd', '0')
  })

  it('un PATCH que SOLO toca estado se omite por completo (sin llamar a Supabase)', async () => {
    const updateSpy = vi.fn()
    fakeFrom.mockImplementation(() => ({
      update: updateSpy,
    }))

    const connector = new SupabaseConnector()
    const soloEstado: CrudOp = {
      id: 'venta-1',
      op: UpdateType.PATCH,
      table: 'ventas',
      opData: {
        estado: 'pago',
      },
    }
    const { db, complete } = makeFakeDb(soloEstado)

    await connector.uploadData(db as never)

    expect(complete).toHaveBeenCalledTimes(1)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
