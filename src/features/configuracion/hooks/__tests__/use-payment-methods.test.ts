// Mockeamos `@/core/db/powersync/db` porque `createPaymentMethod` usa
// `db.writeTransaction` a nivel de modulo — sin este mock, importar
// `use-payment-methods.ts` construye una PowerSyncDatabase real y revienta
// con "Worker is not defined" en el entorno de test. Mismo patron que
// use-compras.test.ts / use-depositos.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    execute: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))

import type { Transaction } from '@powersync/web'
import { db } from '@/core/db/powersync/db'
import { createPaymentMethod, updatePaymentMethod } from '../use-payment-methods'

const mockedDb = vi.mocked(db, true)

interface Call {
  sql: string
  params: unknown[]
}

const MONEDA_ROWS: Record<string, { id: string }> = {
  USD: { id: 'moneda-usd-id' },
  VES: { id: 'moneda-bs-id' },
}

/**
 * Simula la unica `db.writeTransaction` de `createPaymentMethod`. `bancoMonedaId`
 * simula la moneda_id real del banco vinculado (fila `bancos_empresa`) — defensa
 * en profundidad (Engram qa/metodo-pago-hereda-moneda-banco/explore #2253).
 */
function mockWriteTransaction(bancoMonedaId?: string) {
  const calls: Call[] = []
  mockedDb.writeTransaction.mockImplementation(async (callback) => {
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        if (sql.startsWith('SELECT id FROM monedas')) {
          const codigo = params[0] as string
          return { rows: { length: 1, item: () => MONEDA_ROWS[codigo] } }
        }
        if (sql.startsWith('SELECT moneda_id FROM bancos_empresa')) {
          return bancoMonedaId
            ? { rows: { length: 1, item: () => ({ moneda_id: bancoMonedaId }) } }
            : { rows: { length: 0, item: () => undefined } }
        }
        return { rows: { length: 0, item: () => undefined } }
      }),
    } as unknown as Transaction
    return callback(tx)
  })
  return calls
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createPaymentMethod — defensa en profundidad: moneda debe coincidir con la del banco', () => {
  it('rechaza cuando la moneda del metodo no coincide con la moneda del banco vinculado, sin insertar', async () => {
    const calls = mockWriteTransaction('moneda-usd-id')

    await expect(
      createPaymentMethod({
        nombre: 'Transf VZLA',
        moneda: 'BS',
        tipo: 'TRANSFERENCIA',
        banco_empresa_id: 'banco-1',
        empresa_id: 'empresa-1',
        usuario_id: 'user-1',
      })
    ).rejects.toThrow('La moneda del metodo debe coincidir con la moneda del banco seleccionado')

    expect(calls.some((c) => c.sql.startsWith('INSERT INTO metodos_cobro'))).toBe(false)
  })

  it('permite y persiste cuando la moneda del metodo coincide con la moneda del banco', async () => {
    const calls = mockWriteTransaction('moneda-usd-id')

    await createPaymentMethod({
      nombre: 'Transf USD',
      moneda: 'USD',
      tipo: 'TRANSFERENCIA',
      banco_empresa_id: 'banco-1',
      empresa_id: 'empresa-1',
      usuario_id: 'user-1',
    })

    expect(calls.some((c) => c.sql.startsWith('INSERT INTO metodos_cobro'))).toBe(true)
  })

  it('sin banco (ej. EFECTIVO), no valida coincidencia y persiste normalmente', async () => {
    const calls = mockWriteTransaction()

    await createPaymentMethod({
      nombre: 'Efectivo',
      moneda: 'BS',
      tipo: 'EFECTIVO',
      empresa_id: 'empresa-1',
      usuario_id: 'user-1',
    })

    expect(calls.some((c) => c.sql.startsWith('SELECT moneda_id FROM bancos_empresa'))).toBe(false)
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO metodos_cobro'))).toBe(true)
  })

  it('escopa la consulta de moneda del banco por empresa_id (CLAUDE.md regla 11, remediacion WARNING 2)', async () => {
    const calls = mockWriteTransaction('moneda-usd-id')

    await createPaymentMethod({
      nombre: 'Transf USD',
      moneda: 'USD',
      tipo: 'TRANSFERENCIA',
      banco_empresa_id: 'banco-1',
      empresa_id: 'empresa-1',
      usuario_id: 'user-1',
    })

    const guardCall = calls.find((c) => c.sql.startsWith('SELECT moneda_id FROM bancos_empresa'))
    expect(guardCall?.sql).toMatch(/empresa_id\s*=\s*\?/)
    expect(guardCall?.params).toEqual(['banco-1', 'empresa-1'])
  })
})

/**
 * Simula las llamadas `db.execute` de `updatePaymentMethod` (no usa
 * writeTransaction). Remediacion WARNING 3 (Engram
 * qa/metodo-pago-hereda-moneda-banco/verify-report #2257): guard simetrico a
 * createPaymentMethod, pero SOLO cuando banco_empresa_id cambia a un valor
 * DISTINTO del ya persistido — nunca debe bloquear un edit que no toca el
 * banco (ej. toggle de active en un metodo legado desalineado).
 */
function mockExecuteForUpdate(opts: {
  currentRow?: { empresa_id: string; moneda_id: string; banco_empresa_id: string | null }
  bancoMonedaId?: string
}) {
  const calls: Call[] = []
  mockedDb.execute.mockImplementation((async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    if (sql.startsWith('SELECT empresa_id, moneda_id, banco_empresa_id FROM metodos_cobro')) {
      return opts.currentRow
        ? { rows: { length: 1, item: () => opts.currentRow } }
        : { rows: { length: 0, item: () => undefined } }
    }
    if (sql.startsWith('SELECT moneda_id FROM bancos_empresa')) {
      return opts.bancoMonedaId
        ? { rows: { length: 1, item: () => ({ moneda_id: opts.bancoMonedaId }) } }
        : { rows: { length: 0, item: () => undefined } }
    }
    return { rows: { length: 0, item: () => undefined } }
  }) as unknown as typeof db.execute)
  return calls
}

describe('updatePaymentMethod — remediacion WARNING 3: guard simetrico sin reintroducir el lockout', () => {
  it('permite editar (ej. active) un metodo legado con banco desalineado cuando banco_empresa_id NO cambia', async () => {
    const calls = mockExecuteForUpdate({
      currentRow: { empresa_id: 'empresa-1', moneda_id: 'moneda-bs-id', banco_empresa_id: 'banco-usd' },
      // Desalineado a proposito — NO deberia ni consultarse porque el banco no cambia.
      bancoMonedaId: 'moneda-usd-id',
    })

    await updatePaymentMethod('metodo-1', { banco_empresa_id: 'banco-usd', is_active: false })

    expect(calls.some((c) => c.sql.startsWith('SELECT moneda_id FROM bancos_empresa'))).toBe(false)
    expect(calls.some((c) => c.sql.startsWith('UPDATE metodos_cobro'))).toBe(true)
  })

  it('rechaza cuando se cambia banco_empresa_id a un banco cuya moneda no coincide con la moneda persistida', async () => {
    const calls = mockExecuteForUpdate({
      currentRow: { empresa_id: 'empresa-1', moneda_id: 'moneda-usd-id', banco_empresa_id: 'banco-old' },
      bancoMonedaId: 'moneda-bs-id',
    })

    await expect(
      updatePaymentMethod('metodo-1', { banco_empresa_id: 'banco-bs' })
    ).rejects.toThrow('La moneda del metodo debe coincidir con la moneda del banco seleccionado')

    expect(calls.some((c) => c.sql.startsWith('UPDATE metodos_cobro'))).toBe(false)
  })

  it('permite y escopa por empresa_id cuando se cambia banco_empresa_id a uno con moneda coincidente', async () => {
    const calls = mockExecuteForUpdate({
      currentRow: { empresa_id: 'empresa-1', moneda_id: 'moneda-usd-id', banco_empresa_id: 'banco-old' },
      bancoMonedaId: 'moneda-usd-id',
    })

    await updatePaymentMethod('metodo-1', { banco_empresa_id: 'banco-usd' })

    const guardCall = calls.find((c) => c.sql.startsWith('SELECT moneda_id FROM bancos_empresa'))
    expect(guardCall?.params).toEqual(['banco-usd', 'empresa-1'])
    expect(calls.some((c) => c.sql.startsWith('UPDATE metodos_cobro'))).toBe(true)
  })
})
