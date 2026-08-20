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
import { crearCompra, reversarCompra, type LineaCompra, type CrearCompraParams, type ReversarCompraParams } from '../use-compras'

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

// ─── reversarCompra — CRITICAL: bypasseaba upsertStockDeposito ─────────────

interface ReversarCompraFixtures {
  compra: {
    id: string
    proveedor_id: string
    nro_factura: string
    tipo: string
    status: string
    total_usd: string
    saldo_pend_usd: string
  }
  /** Cada linea trae su propio deposito_id — persistido por la compra original (Slice 1c). */
  detLineas: Array<{
    id: string
    producto_id: string
    deposito_id: string
    cantidad: string
    costo_usd_sistema: string | null
    costo_unitario_usd: string
    lote_id: string | null
  }>
  /** producto_id -> stock GLOBAL (cross-deposito) previo. */
  stockPorProducto: Record<string, string>
  /** key `${producto_id}::${deposito_id}` -> cantidad_actual previa en inventario_stock. Ausente = sin fila (baseline 0). */
  inventarioStock?: Record<string, string>
  /** Historial de kardex usado por upsertStockDeposito para reconstruir el baseline cuando NO hay fila previa en inventario_stock. */
  historialKardex?: Array<{ producto_id: string; deposito_id: string; tipo: 'E' | 'S'; cantidad: string }>
}

function mockReversarCompraTx(opts: ReversarCompraFixtures) {
  const calls: Call[] = []
  mockedDb.writeTransaction.mockImplementation(async (callback) => {
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })

        if (sql.startsWith('SELECT * FROM facturas_compra WHERE id')) {
          return { rows: { length: 1, item: () => opts.compra } }
        }
        if (sql.startsWith("SELECT COUNT(*) as cnt FROM movimientos_cuenta_proveedor")) {
          return { rows: { length: 1, item: () => ({ cnt: 0 }) } }
        }
        if (sql.startsWith('SELECT * FROM facturas_compra_det WHERE factura_compra_id')) {
          return { rows: { length: opts.detLineas.length, item: (i: number) => opts.detLineas[i] } }
        }
        if (sql.startsWith('SELECT stock, costo_usd FROM productos')) {
          const productoId = params[0] as string
          return {
            rows: {
              length: 1,
              item: () => ({ stock: opts.stockPorProducto[productoId] ?? '0.000', costo_usd: '5.00000000' }),
            },
          }
        }
        if (sql.startsWith('SELECT id, cantidad_actual FROM inventario_stock')) {
          const productoId = params[1] as string
          const depositoId = params[2] as string
          const cant = opts.inventarioStock?.[`${productoId}::${depositoId}`]
          return cant !== undefined
            ? {
                rows: {
                  length: 1,
                  item: () => ({ id: `stock-row-${productoId}-${depositoId}`, cantidad_actual: cant }),
                },
              }
            : { rows: { length: 0, item: () => undefined } }
        }
        if (sql.startsWith('SELECT producto_id, deposito_id, tipo, cantidad FROM movimientos_inventario')) {
          const historial = opts.historialKardex ?? []
          return { rows: { length: historial.length, item: (i: number) => historial[i] } }
        }
        if (sql.startsWith('SELECT stock FROM productos')) {
          const productoId = params[0] as string
          return { rows: { length: 1, item: () => ({ stock: opts.stockPorProducto[productoId] ?? '0.000' }) } }
        }
        if (sql.startsWith('SELECT saldo_actual FROM proveedores')) {
          return { rows: { length: 1, item: () => ({ saldo_actual: '0.00' }) } }
        }
        return { rows: { length: 0, item: () => undefined } }
      }),
    } as unknown as Transaction

    return callback(tx)
  })
  return calls
}

function reversarParams(overrides: Partial<ReversarCompraParams> = {}): ReversarCompraParams {
  return {
    compraId: 'compra-1',
    usuarioId: 'user-1',
    empresaId: 'emp-1',
    ...overrides,
  }
}

describe('reversarCompra — CRITICAL cerrado: inventario_stock mantenido via upsertStockDeposito (no UPDATE manual)', () => {
  it('reversa UNA linea: usa el deposito de la LINEA ORIGINAL (facturas_compra_det.deposito_id), delta NEGATIVO, y NO hay ningun UPDATE manual de productos.stock', async () => {
    const calls = mockReversarCompraTx({
      compra: {
        id: 'compra-1', proveedor_id: 'prov-1', nro_factura: 'F-001', tipo: 'CONTADO',
        status: 'PROCESADA', total_usd: '50.00', saldo_pend_usd: '0.00',
      },
      detLineas: [
        { id: 'det-1', producto_id: 'prod-1', deposito_id: 'dep-B', cantidad: '3.000', costo_usd_sistema: '5.00', costo_unitario_usd: '5.00', lote_id: null },
      ],
      stockPorProducto: { 'prod-1': '20.000' },
      inventarioStock: { 'prod-1::dep-B': '10.000' },
    })

    await reversarCompra(reversarParams())

    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInsert).toBeDefined()
    expect(kardexInsert!.params).toContain('dep-B')

    // El unico UPDATE a productos que debe quedar es el de costo_usd — el
    // stock ahora lo escribe upsertStockDeposito.
    const productoStockUpdates = calls.filter(
      (c) => c.sql.startsWith('UPDATE productos SET stock = ?, costo_usd')
    )
    expect(productoStockUpdates).toHaveLength(0)

    const costoUpdate = calls.find((c) => c.sql.startsWith('UPDATE productos SET costo_usd'))
    expect(costoUpdate).toBeDefined()

    // upsertStockDeposito: lectura de inventario_stock escopeada al deposito de la LINEA
    const stockUpsertRead = calls.find((c) => c.sql.startsWith('SELECT id, cantidad_actual FROM inventario_stock'))
    expect(stockUpsertRead).toBeDefined()
    expect(stockUpsertRead!.params).toContain('dep-B')

    // Escritura resultante: 10 (previo en dep-B) - 3 (reversado) = 7 — delta NEGATIVO
    const stockWrite = calls.find(
      (c) => c.sql.startsWith('INSERT INTO inventario_stock') || c.sql.startsWith('UPDATE inventario_stock')
    )
    expect(stockWrite).toBeDefined()
    expect(stockWrite!.params).toContain('7.000')

    // productos.stock (total cross-deposito) actualizado EXACTAMENTE UNA VEZ por upsertStockDeposito
    const productoStockUpdatesViaHelper = calls.filter((c) => c.sql.startsWith('UPDATE productos SET stock ='))
    expect(productoStockUpdatesViaHelper).toHaveLength(1)
    expect(productoStockUpdatesViaHelper[0]!.params).toContain('17.000') // 20 (global previo) - 3
  })

  it('el movimientoInventarioId pasado a upsertStockDeposito es el DEV kardex recien insertado (baseline reconstruido excluye ese mismo id)', async () => {
    const calls = mockReversarCompraTx({
      compra: {
        id: 'compra-1', proveedor_id: 'prov-1', nro_factura: 'F-001', tipo: 'CONTADO',
        status: 'PROCESADA', total_usd: '50.00', saldo_pend_usd: '0.00',
      },
      detLineas: [
        { id: 'det-1', producto_id: 'prod-1', deposito_id: 'dep-B', cantidad: '3.000', costo_usd_sistema: '5.00', costo_unitario_usd: '5.00', lote_id: null },
      ],
      stockPorProducto: { 'prod-1': '20.000' },
      // Sin fila previa en inventario_stock para prod-1::dep-B — fuerza el
      // camino de reconstruccion de baseline desde kardex. El historial
      // simula la entrada original de la compra (10 unidades) para que el
      // baseline reconstruido alcance para la reversion de 3.
      historialKardex: [{ producto_id: 'prod-1', deposito_id: 'dep-B', tipo: 'E', cantidad: '10.000' }],
    })

    await reversarCompra(reversarParams())

    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    const movId = kardexInsert!.params[0] as string
    expect(movId).toBeTruthy()

    const baselineRebuild = calls.find((c) =>
      c.sql.startsWith('SELECT producto_id, deposito_id, tipo, cantidad FROM movimientos_inventario')
    )
    expect(baselineRebuild).toBeDefined()
    expect(baselineRebuild!.params[baselineRebuild!.params.length - 1]).toBe(movId)
  })

  it('reversa MULTIPLES lineas en DEPOSITOS DISTINTOS: cada linea usa SU PROPIO deposito y su PROPIO movimientoInventarioId, sin cruzarse', async () => {
    const calls = mockReversarCompraTx({
      compra: {
        id: 'compra-1', proveedor_id: 'prov-1', nro_factura: 'F-002', tipo: 'CONTADO',
        status: 'PROCESADA', total_usd: '90.00', saldo_pend_usd: '0.00',
      },
      detLineas: [
        { id: 'det-1', producto_id: 'prod-X', deposito_id: 'dep-A', cantidad: '3.000', costo_usd_sistema: '5.00', costo_unitario_usd: '5.00', lote_id: null },
        { id: 'det-2', producto_id: 'prod-Y', deposito_id: 'dep-B', cantidad: '7.000', costo_usd_sistema: '5.00', costo_unitario_usd: '5.00', lote_id: null },
      ],
      stockPorProducto: { 'prod-X': '10.000', 'prod-Y': '20.000' },
      inventarioStock: { 'prod-X::dep-A': '5.000', 'prod-Y::dep-B': '15.000' },
    })

    await reversarCompra(reversarParams())

    const kardexInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInserts).toHaveLength(2)
    const kardexX = kardexInserts.find((c) => c.params.includes('prod-X'))
    const kardexY = kardexInserts.find((c) => c.params.includes('prod-Y'))
    expect(kardexX!.params).toContain('dep-A')
    expect(kardexY!.params).toContain('dep-B')

    const stockWrites = calls.filter(
      (c) => c.sql.startsWith('INSERT INTO inventario_stock') || c.sql.startsWith('UPDATE inventario_stock')
    )
    expect(stockWrites).toHaveLength(2)
    const stockX = stockWrites.find((c) => c.params.includes('2.000')) // 5 (dep-A) - 3
    const stockY = stockWrites.find((c) => c.params.includes('8.000')) // 15 (dep-B) - 7
    expect(stockX).toBeDefined()
    expect(stockY).toBeDefined()

    // movimientoInventarioId de cada linea no se cruza con el de la otra
    const movIdX = kardexX!.params[0] as string
    const movIdY = kardexY!.params[0] as string
    expect(movIdX).not.toBe(movIdY)

    const productoStockUpdatesViaHelper = calls.filter((c) => c.sql.startsWith('UPDATE productos SET stock ='))
    expect(productoStockUpdatesViaHelper).toHaveLength(2)
  })
})
