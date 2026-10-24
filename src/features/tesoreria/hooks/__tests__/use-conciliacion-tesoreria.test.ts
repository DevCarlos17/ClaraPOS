// `desconciliarMovBancario`/`desconciliarMovCajaFuerte` (change
// `split-desconciliar-reversar-historico`) son el espejo invertido de
// `validarMovBancario`/`validarMovCajaFuerte`: un UPDATE puro que vuelve
// `validado` a 0 y limpia `validado_por`/`validado_at`, sin tocar saldo,
// factura ni cliente. Mockeamos `@/core/db/powersync/db` (controla
// `writeTransaction`/`tx.execute`) con el mismo patron de
// `use-reverso-abono-directo.test.ts`.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    writeTransaction: vi.fn(),
  },
}))

import type { Transaction } from '@powersync/common'
import { db } from '@/core/db/powersync/db'
import { desconciliarMovBancario, desconciliarMovCajaFuerte } from '../use-conciliacion-tesoreria'

const mockedDb = vi.mocked(db, true)

interface Call {
  sql: string
  params: unknown[]
}

beforeEach(() => {
  vi.clearAllMocks()
})

function buildFakeTx(opts: {
  tabla: string
  mov: { validado: number; reversado: number }
}) {
  const calls: Call[] = []
  const tx = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (sql.startsWith(`SELECT validado, reversado FROM ${opts.tabla}`)) {
        return { rows: { length: 1, item: () => opts.mov } }
      }
      return { rows: { length: 0, item: () => undefined } }
    }),
  } as unknown as Transaction
  return { tx, calls }
}

function setupWriteTransaction(opts: Parameters<typeof buildFakeTx>[0]) {
  const { tx, calls } = buildFakeTx(opts)
  mockedDb.writeTransaction.mockImplementationOnce(async (callback) => callback(tx))
  return calls
}

describe('desconciliarMovBancario', () => {
  it('flip validado 1→0 + validado_por/validado_at→NULL, filtrando por id y empresa_id', async () => {
    const calls = setupWriteTransaction({
      tabla: 'movimientos_bancarios',
      mov: { validado: 1, reversado: 0 },
    })

    await desconciliarMovBancario('mov-1', 'emp-1')

    const update = calls.find((c) => c.sql.startsWith('UPDATE movimientos_bancarios'))
    expect(update).toBeDefined()
    expect(update!.sql).toContain('validado = 0')
    expect(update!.sql).toContain('validado_por = NULL')
    expect(update!.sql).toContain('validado_at = NULL')
    expect(update!.sql).toContain('WHERE id = ? AND empresa_id = ?')
    expect(update!.params).toEqual(['mov-1', 'emp-1'])
  })

  it('guard: rechaza si validado=0 ("ya está desconciliado"), sin ejecutar UPDATE', async () => {
    const calls = setupWriteTransaction({
      tabla: 'movimientos_bancarios',
      mov: { validado: 0, reversado: 0 },
    })

    await expect(desconciliarMovBancario('mov-1', 'emp-1')).rejects.toThrow(
      'ya está desconciliado'
    )

    expect(calls.filter((c) => c.sql.startsWith('UPDATE movimientos_bancarios'))).toHaveLength(0)
  })

  it('guard: rechaza si reversado=1, sin ejecutar UPDATE', async () => {
    const calls = setupWriteTransaction({
      tabla: 'movimientos_bancarios',
      mov: { validado: 1, reversado: 1 },
    })

    await expect(desconciliarMovBancario('mov-1', 'emp-1')).rejects.toThrow(
      'Este movimiento ya fue reversado'
    )

    expect(calls.filter((c) => c.sql.startsWith('UPDATE movimientos_bancarios'))).toHaveLength(0)
  })

  it('aislamiento multi-tenant: el SELECT inicial tambien filtra empresa_id', async () => {
    const calls = setupWriteTransaction({
      tabla: 'movimientos_bancarios',
      mov: { validado: 1, reversado: 0 },
    })

    await desconciliarMovBancario('mov-1', 'emp-a')

    const select = calls.find((c) => c.sql.startsWith('SELECT validado, reversado FROM movimientos_bancarios'))
    expect(select).toBeDefined()
    expect(select!.sql).toContain('WHERE id = ? AND empresa_id = ?')
    expect(select!.params).toEqual(['mov-1', 'emp-a'])
  })
})

describe('desconciliarMovCajaFuerte', () => {
  it('flip validado 1→0 + validado_por/validado_at→NULL sobre mov_caja_fuerte, filtrando por id y empresa_id', async () => {
    const calls = setupWriteTransaction({
      tabla: 'mov_caja_fuerte',
      mov: { validado: 1, reversado: 0 },
    })

    await desconciliarMovCajaFuerte('mov-cf-1', 'emp-1')

    const update = calls.find((c) => c.sql.startsWith('UPDATE mov_caja_fuerte'))
    expect(update).toBeDefined()
    expect(update!.sql).toContain('validado = 0')
    expect(update!.sql).toContain('validado_por = NULL')
    expect(update!.sql).toContain('validado_at = NULL')
    expect(update!.sql).toContain('WHERE id = ? AND empresa_id = ?')
    expect(update!.params).toEqual(['mov-cf-1', 'emp-1'])
  })

  it('guard: rechaza si validado=0 ("ya está desconciliado"), sin ejecutar UPDATE', async () => {
    const calls = setupWriteTransaction({
      tabla: 'mov_caja_fuerte',
      mov: { validado: 0, reversado: 0 },
    })

    await expect(desconciliarMovCajaFuerte('mov-cf-1', 'emp-1')).rejects.toThrow(
      'ya está desconciliado'
    )

    expect(calls.filter((c) => c.sql.startsWith('UPDATE mov_caja_fuerte'))).toHaveLength(0)
  })

  it('guard: rechaza si reversado=1, sin ejecutar UPDATE', async () => {
    const calls = setupWriteTransaction({
      tabla: 'mov_caja_fuerte',
      mov: { validado: 1, reversado: 1 },
    })

    await expect(desconciliarMovCajaFuerte('mov-cf-1', 'emp-1')).rejects.toThrow(
      'Este movimiento ya fue reversado'
    )

    expect(calls.filter((c) => c.sql.startsWith('UPDATE mov_caja_fuerte'))).toHaveLength(0)
  })
})
