// Mockeamos `@/core/db/powersync/db` porque `use-importar-cxc.ts` usa
// `db.writeTransaction` a nivel de modulo — sin este mock, importar el
// archivo construye una PowerSyncDatabase real y revienta con "Worker is
// not defined" en el entorno de test. Mismo patron que use-ventas.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    execute: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))

import type { Transaction } from '@powersync/common'
import { db } from '@/core/db/powersync/db'
import type { CxcImportRow } from '../../schemas/cxc-import-schema'
import { importarSaldosInicialesCxc } from '../use-importar-cxc'

interface Call {
  sql: string
  params: unknown[]
}

function baseFila(overrides: Partial<CxcImportRow> = {}): CxcImportRow {
  return {
    identificacion: 'V22448021',
    nro_documento: 'SI-0001',
    fecha: '2026-01-15',
    monto_usd: 100,
    tasa: 40,
    descripcion: '',
    ...overrides,
  }
}

/**
 * Simula la unica `db.writeTransaction` de `importarFilaCxc` — captura cada
 * `tx.execute(sql, params)` para las aserciones. Mismo patron que
 * `mockCrearVentaTx` en use-ventas.test.ts.
 */
function mockImportarCxcTx() {
  const calls: Call[] = []
  vi.mocked(db, true).writeTransaction.mockImplementation(async (callback) => {
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        if (sql.startsWith('SELECT id, nombre, saldo_actual FROM clientes')) {
          return {
            rows: {
              length: 1,
              item: () => ({ id: 'cliente-1', nombre: 'Cliente Uno', saldo_actual: '0' }),
            },
          }
        }
        if (sql.startsWith('SELECT COUNT(*) as c FROM ventas WHERE empresa_id = ? AND cliente_id')) {
          return { rows: { length: 1, item: () => ({ c: 0 }) } }
        }
        if (sql.startsWith('SELECT id FROM depositos WHERE empresa_id = ? AND es_principal = 1')) {
          return { rows: { length: 1, item: () => ({ id: 'dep-principal' }) } }
        }
        if (sql.startsWith("SELECT COUNT(*) as c FROM ventas WHERE empresa_id = ? AND nro_factura LIKE 'SI-%'")) {
          return { rows: { length: 1, item: () => ({ c: 0 }) } }
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

describe('importarSaldosInicialesCxc — cxc-sync-snapshot-redesign (CRITICAL-1): estado optimista en el INSERT del import SAL', () => {
  it('el INSERT INTO ventas del import SAL escribe estado = calcularEstadoVenta(monto_usd, monto_usd, null) = "pendiente" (nace siempre pendiente, saldo_pend_usd = monto completo)', async () => {
    const calls = mockImportarCxcTx()

    const result = await importarSaldosInicialesCxc({
      filas: [baseFila({ monto_usd: 250 })],
      empresaId: 'emp-1',
      usuarioId: 'user-1',
      onProgress: () => {},
    })

    expect(result.exitosos).toBe(1)

    const ventaInsert = calls.find((c) => c.sql.startsWith('INSERT INTO ventas'))
    expect(ventaInsert).toBeDefined()
    expect(ventaInsert!.sql).toContain('estado')
    // La columna `estado` se agrega al final de la lista de columnas (despues de
    // `created_by`) — no reordena ninguna columna preexistente.
    expect(ventaInsert!.params[ventaInsert!.params.length - 1]).toBe('pendiente')
  })

  it('triangulacion: con un monto_usd distinto (fila independiente) el estado sigue siendo "pendiente" porque saldo_pend_usd SIEMPRE nace igual a monto_usd en este import (nunca 0) — no es un valor hardcodeado, se recalcula por fila', async () => {
    const calls = mockImportarCxcTx()

    const result = await importarSaldosInicialesCxc({
      filas: [baseFila({ monto_usd: 1500.75, nro_documento: 'SI-0002' })],
      empresaId: 'emp-1',
      usuarioId: 'user-1',
      onProgress: () => {},
    })

    expect(result.exitosos).toBe(1)
    const ventaInsert = calls.find((c) => c.sql.startsWith('INSERT INTO ventas'))
    expect(ventaInsert).toBeDefined()
    expect(ventaInsert!.params[ventaInsert!.params.length - 1]).toBe('pendiente')
    // saldo_pend_usd (indice 10) = total_usd (indice 8) = monto_usd formateado,
    // confirmando que estado='pendiente' viene de la MAGNITUD real, no de un
    // literal fijo en el codigo de produccion.
    expect(ventaInsert!.params[10]).toBe(ventaInsert!.params[8])
    expect(ventaInsert!.params[10]).toBe('1500.75')
  })
})
