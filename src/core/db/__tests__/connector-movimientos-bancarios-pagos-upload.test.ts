import { UpdateType } from '@powersync/web'

/**
 * `trazabilidad-ingreso-pagos-directo` (slice 0a-schema): `movimientos_bancarios_pagos`
 * entra a `IMMUTABLE_TABLES` (migrations/0117_movimientos_bancarios_pagos.sql) con el
 * mismo motivo que `pagos_aplicaciones`/`saf_creditos_aplicaciones` — 100% append-only
 * (sin policy UPDATE/DELETE, sin trigger bloqueante), pero un PUT reintentado de
 * PowerSync debe converger via `ON CONFLICT DO NOTHING` (`upsert(..., { ignoreDuplicates: true })`)
 * en vez de lanzar un error fatal al reintentar el mismo INSERT.
 *
 * Mismo patron de mock que `connector-saf-lotes-patch-strip.test.ts`.
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

/** Fake mínimo de `AbstractPowerSyncDatabase` — solo lo que `uploadData` invoca. */
function makeFakeDb(op: {
  id: string
  op: UpdateType
  table: string
  opData: Record<string, unknown>
}) {
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

beforeEach(() => {
  localStorage.clear()
  fakeFrom.mockReset()
})

describe('SupabaseConnector.uploadData — movimientos_bancarios_pagos PUT reintentado converge sin error (ON CONFLICT DO NOTHING)', () => {
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
      id: 'puente-1',
      op: UpdateType.PUT,
      table: 'movimientos_bancarios_pagos',
      opData: {
        empresa_id: 'emp-1',
        ingreso_id: 'ingreso-1',
        pago_id: 'pago-1',
        monto_aplicado_usd: '100.00000000',
        created_at: '2026-10-20T10:00:00-04:00',
        created_by: 'user-1',
      },
    })

    await connector.uploadData(db as never)

    expect(complete).toHaveBeenCalledTimes(1)
    expect(uploadFailedSpy).not.toHaveBeenCalled()
    expect(upsertOptionsSpy).toHaveBeenCalledWith({ ignoreDuplicates: true })
  })
})
