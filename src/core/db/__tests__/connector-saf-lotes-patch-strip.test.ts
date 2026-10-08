import { UpdateType } from '@powersync/web'

/**
 * Fase 2 de saf-snapshot-y-trazabilidad (PR2): `saf_creditos_lotes.saldo_disponible_usd`/
 * `status`/`updated_at` son gestionadas EXCLUSIVAMENTE por el trigger `consumir_saf_lote()`
 * (migrations/0105_saf_creditos_aplicaciones.sql) — el PATCH subido a Supabase NUNCA debe
 * incluirlas, mismo mecanismo ya probado para `clientes.saldo_actual`/`saf_disponible` en
 * `connector-saf-disponible-patch-strip.test.ts`.
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

function safLotesPatchOp(overrides: Partial<CrudOp['opData']> = {}): CrudOp {
  return {
    id: 'lote-1',
    op: UpdateType.PATCH,
    table: 'saf_creditos_lotes',
    opData: {
      saldo_disponible_usd: '70.00000000',
      status: 'ACTIVO',
      updated_at: '2026-10-08T10:00:00-04:00',
      ...overrides,
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  fakeFrom.mockReset()
})

describe('SupabaseConnector.uploadData — saf_creditos_lotes PATCH jamas incluye columnas gestionadas por consumir_saf_lote', () => {
  it('un consumo local que afecta saldo_disponible_usd, status Y updated_at sube el PATCH sin ninguna de las 3 (el trigger del servidor es la unica autoridad)', async () => {
    const updateSpy = vi.fn()
    fakeFrom.mockImplementation(() => ({
      update: (payload: unknown) => {
        updateSpy(payload)
        return {
          eq: () => ({
            select: () => Promise.resolve({ data: [{ id: 'lote-1' }], error: null }),
          }),
        }
      },
    }))

    const connector = new SupabaseConnector()
    const { db, complete } = makeFakeDb(safLotesPatchOp({ moneda_origen: 'USD' }))

    await connector.uploadData(db as never)

    expect(complete).toHaveBeenCalledTimes(1)
    const payload = updateSpy.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('saldo_disponible_usd')
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('updated_at')
    // El resto del payload (no gestionado por trigger) SI debe subir
    expect(payload).toHaveProperty('moneda_origen', 'USD')
  })

  it('un PATCH que SOLO toca columnas gestionadas por el trigger se omite por completo (sin llamar a Supabase)', async () => {
    const updateSpy = vi.fn()
    fakeFrom.mockImplementation(() => ({
      update: updateSpy,
    }))

    const connector = new SupabaseConnector()
    const { db, complete } = makeFakeDb(safLotesPatchOp())

    await connector.uploadData(db as never)

    expect(complete).toHaveBeenCalledTimes(1)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

describe('SupabaseConnector.uploadData — saf_creditos_aplicaciones PUT reintentado converge sin error (ON CONFLICT DO NOTHING)', () => {
  it('reintento de un PUT ya persistido en Supabase: usa upsert con ignoreDuplicates (no lanza, no duplica)', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null })
    const upsertOptionsSpy = vi.fn()
    fakeFrom.mockImplementation(() => ({
      upsert: (record: unknown, options: unknown) => {
        upsertOptionsSpy(options)
        return upsertSpy(record, options)
      },
    }))

    const connector = new SupabaseConnector()
    const uploadFailedSpy = vi.fn()
    connector.registerListener({ uploadFailed: uploadFailedSpy })
    const { db, complete } = makeFakeDb({
      id: 'aplic-1',
      op: UpdateType.PUT,
      table: 'saf_creditos_aplicaciones',
      opData: {
        empresa_id: 'emp-1',
        cliente_id: 'cli-1',
        lote_id: 'lote-1',
        venta_id: 'venta-1',
        movimiento_cuenta_id: 'mov-1',
        monto_aplicado_usd: '30.00000000',
        lote_saldo_antes_usd: '100.00000000',
        lote_saldo_despues_usd: '70.00000000',
        tasa_pago: '36.50000000',
        fecha: '2026-10-08T10:00:00-04:00',
      },
    })

    await connector.uploadData(db as never)

    expect(complete).toHaveBeenCalledTimes(1)
    expect(uploadFailedSpy).not.toHaveBeenCalled()
    expect(upsertOptionsSpy).toHaveBeenCalledWith({ ignoreDuplicates: true })
  })
})
