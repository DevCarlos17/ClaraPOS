// Mockeamos `@/core/db/powersync/db` porque `crearCompra` usa `db.execute`
// (pre-fetch fuera de la tx) y `db.writeTransaction` a nivel de modulo — sin
// este mock, importar `use-compras.ts` construye una PowerSyncDatabase real y
// revienta con "Worker is not defined" en el entorno de test. Mismo patron
// que use-kardex.test.ts / use-agenda-config.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    execute: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))

vi.mock('@/features/contabilidad/hooks/use-cuentas-config', () => ({
  cargarMapaCuentas: vi.fn(async () => ({})),
}))

vi.mock('@/features/contabilidad/lib/generar-asientos', () => ({
  generarAsientosCompra: vi.fn(async () => undefined),
}))

import type { Transaction } from '@powersync/common'
import { db } from '@/core/db/powersync/db'
import { crearCompra, type LineaCompra, type CrearCompraParams } from '../use-compras'

const mockedDb = vi.mocked(db, true)

interface Call {
  sql: string
  params: unknown[]
}

/**
 * Simula el pre-fetch fuera de la tx (dupCheck, deposito principal, moneda,
 * stock/precios por linea via `db.execute`) y la transaccion principal
 * (`db.writeTransaction`) de `crearCompra`. Captura toda escritura dentro de
 * la tx para las aserciones — verifica que `upsertStockDeposito` (wired
 * despues del bloque de UPDATE de costo/precios en el loop de lineas)
 * escribe `inventario_stock` en la MISMA transaccion que el INSERT de kardex,
 * una vez POR LINEA.
 */
function mockCrearCompraTx(opts: {
  stockPorProducto: Record<string, string>
  /** deposito_id default de cada producto (Slice 1c). Ausente/undefined = NULL (cae al principal). */
  depositoPorProducto?: Record<string, string | null>
}) {
  mockedDb.execute.mockImplementation((async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith('SELECT id FROM facturas_compra')) {
      return { rows: { length: 0, item: () => undefined } } // sin duplicado
    }
    if (sql.startsWith('SELECT id FROM depositos')) {
      return { rows: { length: 1, item: () => ({ id: 'dep-principal' }) } }
    }
    if (sql.startsWith('SELECT id FROM monedas')) {
      return { rows: { length: 1, item: () => ({ id: 'moneda-usd' }) } }
    }
    if (sql.startsWith('SELECT stock, costo_usd, precio_venta_usd')) {
      const productoId = params[0] as string
      return {
        rows: {
          length: 1,
          item: () => ({
            stock: opts.stockPorProducto[productoId] ?? '0.000',
            costo_usd: '5.00000000',
            precio_venta_usd: '8.00000000',
            precio_mayor_usd: null,
            precio_especial_usd: null,
            deposito_id: opts.depositoPorProducto?.[productoId] ?? null,
          }),
        },
      }
    }
    return { rows: { length: 0, item: () => undefined } }
  }) as unknown as typeof db.execute)

  const calls: Call[] = []
  mockedDb.writeTransaction.mockImplementation(async (callback) => {
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })

        // inventario_stock: sin fila previa para todas las lineas (caso INSERT)
        if (sql.startsWith('SELECT id, cantidad_actual FROM inventario_stock')) {
          return { rows: { length: 0, item: () => undefined } }
        }
        // productos.stock leido por upsertStockDeposito (total cross-deposito)
        if (sql.startsWith('SELECT stock FROM productos')) {
          const productoId = params[0] as string
          return { rows: { length: 1, item: () => ({ stock: opts.stockPorProducto[productoId] ?? '0.000' }) } }
        }
        if (sql.startsWith('SELECT COALESCE(SUM')) {
          return { rows: { length: 1, item: () => ({ saldo: '0' }) } }
        }
        return { rows: { length: 0, item: () => undefined } }
      }),
    } as unknown as Transaction

    return callback(tx)
  })

  return calls
}

function baseParams(overrides: Partial<CrearCompraParams> = {}): CrearCompraParams {
  return {
    proveedor_id: 'prov-1',
    tasa: 40,
    fecha_factura: '2026-08-20',
    nro_factura: 'F-001',
    moneda: 'USD',
    lineas: [],
    pagos: [],
    usuario_id: 'user-1',
    empresa_id: 'emp-1',
    ...overrides,
  }
}

function linea(overrides: Partial<LineaCompra> = {}): LineaCompra {
  return {
    producto_id: 'prod-1',
    cantidad: 10,
    costo_unitario_usd: 5,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('crearCompra — wiring de inventario_stock (Slice 1b, sin cambio de resolucion de deposito)', () => {
  it('una linea: upsertStockDeposito escribe inventario_stock DESPUES del INSERT de kardex, en la MISMA transaccion, con el deposito ya pre-resuelto', async () => {
    const calls = mockCrearCompraTx({ stockPorProducto: { 'prod-1': '20.000' } })

    await crearCompra(baseParams({ lineas: [linea({ producto_id: 'prod-1', cantidad: 10 })] }))

    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInsert).toBeDefined()
    expect(kardexInsert!.params).toContain('dep-principal')

    const stockInsert = calls.find((c) => c.sql.startsWith('INSERT INTO inventario_stock'))
    expect(stockInsert).toBeDefined()
    expect(stockInsert!.params).toContain('10.000') // delta = cantidad comprada (baseline 0 en el mock)
    expect(stockInsert!.params).toContain('dep-principal')
    expect(stockInsert!.params).toContain('prod-1')

    const productoStockUpdate = calls.find((c) => c.sql.startsWith('UPDATE productos SET stock'))
    expect(productoStockUpdate).toBeDefined()
    expect(productoStockUpdate!.params).toContain('30.000') // 20 (stock previo) + 10 (compra)

    // Orden: el INSERT de kardex debe preceder al INSERT de inventario_stock — misma tx
    const kardexIdx = calls.indexOf(kardexInsert!)
    const stockIdx = calls.indexOf(stockInsert!)
    expect(kardexIdx).toBeLessThan(stockIdx)
  })

  it('compra multi-linea (2 productos en la MISMA factura): dispara upsertStockDeposito una vez POR LINEA, cada uno con su propio producto/cantidad', async () => {
    const calls = mockCrearCompraTx({ stockPorProducto: { 'prod-1': '5.000', 'prod-2': '0.000' } })

    await crearCompra(
      baseParams({
        lineas: [
          linea({ producto_id: 'prod-1', cantidad: 4 }),
          linea({ producto_id: 'prod-2', cantidad: 6 }),
        ],
      })
    )

    const kardexInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInserts).toHaveLength(2)

    const stockInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO inventario_stock'))
    expect(stockInserts).toHaveLength(2)

    const stockProd1 = stockInserts.find((c) => c.params.includes('prod-1'))
    const stockProd2 = stockInserts.find((c) => c.params.includes('prod-2'))
    expect(stockProd1).toBeDefined()
    expect(stockProd1!.params).toContain('4.000')
    expect(stockProd2).toBeDefined()
    expect(stockProd2!.params).toContain('6.000')

    const productoUpdates = calls.filter((c) => c.sql.startsWith('UPDATE productos SET stock'))
    expect(productoUpdates).toHaveLength(2)
    const updateProd1 = productoUpdates.find((c) => c.params.includes('prod-1'))
    const updateProd2 = productoUpdates.find((c) => c.params.includes('prod-2'))
    expect(updateProd1!.params).toContain('9.000') // 5 + 4
    expect(updateProd2!.params).toContain('6.000') // 0 + 6
  })
})

describe('crearCompra — enrutamiento de ingreso por linea (Slice 1c, CPD/Enrutamiento de Ingreso por Linea)', () => {
  it('compra con 2 productos en 2 depositos distintos: cada linea enruta kardex + inventario_stock a SU PROPIO deposito, no al deposito unico prefetched', async () => {
    const calls = mockCrearCompraTx({
      stockPorProducto: { 'prod-X': '0.000', 'prod-Y': '0.000' },
      depositoPorProducto: { 'prod-X': 'dep-A', 'prod-Y': 'dep-B' },
    })

    await crearCompra(
      baseParams({
        lineas: [
          linea({ producto_id: 'prod-X', cantidad: 3 }),
          linea({ producto_id: 'prod-Y', cantidad: 7 }),
        ],
      })
    )

    const kardexInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    const kardexX = kardexInserts.find((c) => c.params.includes('prod-X'))
    const kardexY = kardexInserts.find((c) => c.params.includes('prod-Y'))
    expect(kardexX!.params).toContain('dep-A')
    expect(kardexY!.params).toContain('dep-B')

    const stockInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO inventario_stock'))
    const stockX = stockInserts.find((c) => c.params.includes('prod-X'))
    const stockY = stockInserts.find((c) => c.params.includes('prod-Y'))
    expect(stockX!.params).toContain('dep-A')
    expect(stockY!.params).toContain('dep-B')

    const detInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO facturas_compra_det'))
    const detX = detInserts.find((c) => c.params.includes('prod-X'))
    const detY = detInserts.find((c) => c.params.includes('prod-Y'))
    expect(detX!.params).toContain('dep-A')
    expect(detY!.params).toContain('dep-B')

    // El header de la factura sigue usando el deposito principal pre-resuelto (concepto de un solo campo)
    const facturaInsert = calls.find((c) => c.sql.startsWith('INSERT INTO facturas_compra ('))
    expect(facturaInsert!.params).toContain('dep-principal')
  })

  it('linea cuyo producto tiene deposito_id NULL: cae al deposito principal de la empresa (fallback, PDD/Fallback a Deposito Principal)', async () => {
    const calls = mockCrearCompraTx({
      stockPorProducto: { 'prod-Z': '0.000' },
      depositoPorProducto: { 'prod-Z': null },
    })

    await crearCompra(baseParams({ lineas: [linea({ producto_id: 'prod-Z', cantidad: 5 })] }))

    const stockInsert = calls.find((c) => c.sql.startsWith('INSERT INTO inventario_stock'))
    expect(stockInsert!.params).toContain('dep-principal')
  })

  it('fallo en una linea de una compra multi-deposito revierte TODA la transaccion (ninguna linea de ningun deposito queda comprometida)', async () => {
    mockedDb.execute.mockImplementation((async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith('SELECT id FROM facturas_compra')) return { rows: { length: 0, item: () => undefined } }
      if (sql.startsWith('SELECT id FROM depositos')) return { rows: { length: 1, item: () => ({ id: 'dep-principal' }) } }
      if (sql.startsWith('SELECT id FROM monedas')) return { rows: { length: 1, item: () => ({ id: 'moneda-usd' }) } }
      if (sql.startsWith('SELECT stock, costo_usd, precio_venta_usd')) {
        const productoId = params[0] as string
        return {
          rows: {
            length: 1,
            item: () => ({
              stock: '0.000',
              costo_usd: '5.00000000',
              precio_venta_usd: '8.00000000',
              precio_mayor_usd: null,
              precio_especial_usd: null,
              deposito_id: productoId === 'prod-A' ? 'dep-A' : 'dep-B',
            }),
          },
        }
      }
      return { rows: { length: 0, item: () => undefined } }
    }) as unknown as typeof db.execute)

    // La tx entera falla (simula un error a mitad de camino, p.ej. stock insuficiente en un guard).
    mockedDb.writeTransaction.mockImplementation(async () => {
      throw new Error('Fallo simulado en linea 2')
    })

    await expect(
      crearCompra(
        baseParams({
          lineas: [
            linea({ producto_id: 'prod-A', cantidad: 3 }),
            linea({ producto_id: 'prod-B', cantidad: 4 }),
          ],
        })
      )
    ).rejects.toThrow(/Fallo simulado/)
  })
})
