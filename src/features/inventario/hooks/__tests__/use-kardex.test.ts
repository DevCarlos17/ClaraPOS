// Mockeamos `@/core/db/powersync/db` porque `registrarMovimiento` usa
// `db.writeTransaction` a nivel de modulo — sin este mock, importar
// `use-kardex.ts` construye una PowerSyncDatabase real y revienta con
// "Worker is not defined" en el entorno de test. Mismo patron que
// use-agenda-config.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    writeTransaction: vi.fn(),
  },
}))

import type { Transaction } from '@powersync/common'
import { db } from '@/core/db/powersync/db'
import { registrarMovimiento } from '../use-kardex'

const mockedDb = vi.mocked(db, true)

interface Call {
  sql: string
  params: unknown[]
}

/**
 * Simula la resolucion de deposito principal, lectura de producto y ausencia
 * de fila previa en `inventario_stock` (caso INSERT). Captura toda escritura
 * para las aserciones — verifica que `upsertStockDeposito` (wired en el paso
 * 7 de `registrarMovimiento`) escribe `inventario_stock` en la MISMA
 * transaccion que el INSERT de kardex.
 */
function mockRegistrarMovimientoTx(opts: {
  stockProductoActual: string
  inventarioStockExistente?: { id: string; cantidad_actual: string }
}) {
  const calls: Call[] = []

  mockedDb.writeTransaction.mockImplementation(async (callback) => {
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })

        if (sql.startsWith('SELECT id FROM depositos')) {
          return { rows: { length: 1, item: () => ({ id: 'dep-principal' }) } }
        }
        if (sql.startsWith('SELECT stock, costo_usd, nombre FROM productos')) {
          return {
            rows: {
              length: 1,
              item: () => ({ stock: opts.stockProductoActual, costo_usd: '5.00000000', nombre: 'Producto Test' }),
            },
          }
        }
        if (sql.startsWith('SELECT id, cantidad_actual FROM inventario_stock')) {
          const row = opts.inventarioStockExistente
          return { rows: { length: row ? 1 : 0, item: () => row } }
        }
        if (sql.startsWith('SELECT stock FROM productos')) {
          return { rows: { length: 1, item: () => ({ stock: opts.stockProductoActual }) } }
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

describe('registrarMovimiento — wiring de inventario_stock (Slice 1b, sin cambio de resolucion de deposito)', () => {
  it('entrada (E): escribe inventario_stock via upsertStockDeposito en la MISMA transaccion que el kardex, sin fila previa (INSERT)', async () => {
    const calls = mockRegistrarMovimientoTx({ stockProductoActual: '10.000' })

    await registrarMovimiento({
      producto_id: 'prod-1',
      tipo: 'E',
      cantidad: 5,
      usuario_id: 'user-1',
      empresa_id: 'emp-1',
    })

    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInsert).toBeDefined()

    const stockInsert = calls.find((c) => c.sql.startsWith('INSERT INTO inventario_stock'))
    expect(stockInsert).toBeDefined()
    expect(stockInsert!.params).toContain('5.000')
    expect(stockInsert!.params).toContain('dep-principal')

    const productoUpdate = calls.find((c) => c.sql.startsWith('UPDATE productos SET stock'))
    expect(productoUpdate).toBeDefined()
    expect(productoUpdate!.params).toContain('15.000')

    // El INSERT de kardex debe preceder al UPDATE de inventario_stock/productos — misma tx, mismo orden logico
    const stockInsertIdx = calls.indexOf(stockInsert!)
    const kardexInsertIdx = calls.indexOf(kardexInsert!)
    expect(kardexInsertIdx).toBeLessThan(stockInsertIdx)
  })

  it('salida (S): delta negativo se descuenta de una fila de inventario_stock EXISTENTE (UPDATE, no INSERT)', async () => {
    const calls = mockRegistrarMovimientoTx({
      stockProductoActual: '20.000',
      inventarioStockExistente: { id: 'stock-row-9', cantidad_actual: '20.000' },
    })

    await registrarMovimiento({
      producto_id: 'prod-1',
      tipo: 'S',
      cantidad: 7,
      usuario_id: 'user-1',
      empresa_id: 'emp-1',
    })

    const stockUpdate = calls.find((c) => c.sql.startsWith('UPDATE inventario_stock'))
    expect(stockUpdate).toBeDefined()
    expect(stockUpdate!.params).toContain('13.000')
    expect(stockUpdate!.params).toContain('stock-row-9')

    const stockInsert = calls.find((c) => c.sql.startsWith('INSERT INTO inventario_stock'))
    expect(stockInsert).toBeUndefined()
  })
})
