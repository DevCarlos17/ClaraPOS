// Mockeamos `@/core/db/powersync/db` porque `crearNotaCredito` usa
// `db.writeTransaction` a nivel de modulo — sin este mock, importar el
// archivo construye una PowerSyncDatabase real y revienta con "Worker is
// not defined" en el entorno de test. Mismo patron que use-ventas.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    execute: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@/features/contabilidad/hooks/use-cuentas-config', () => ({
  cargarMapaCuentas: vi.fn(async () => ({})),
}))
vi.mock('@/features/contabilidad/lib/generar-asientos', () => ({
  generarAsientosNCR: vi.fn(async () => undefined),
}))
vi.mock('@/features/cxc/hooks/use-cxc', () => ({
  reversarDiferencialEnTx: vi.fn(async () => undefined),
  useDetalleFactura: vi.fn(),
}))

import type { Transaction } from '@powersync/common'
import { db } from '@/core/db/powersync/db'
import { crearNotaCredito, type CrearNotaCreditoParams } from '../use-notas-credito'

const mockedDb = vi.mocked(db, true)

interface Call {
  sql: string
  params: unknown[]
}

interface NcrTxFixtures {
  venta: {
    id: string
    cliente_id: string
    nro_factura: string
    tasa: string
    total_usd: string
    total_bs: string
    saldo_pend_usd: string
    tipo: string
    status: string
    deposito_id: string
    /** Slice 2: sesion de caja en la que se emitio la venta original. */
    sesion_caja_id?: string | null
  }
  ventaDet: Array<{ producto_id: string; cantidad: string; lote_id: string | null }>
  productos: Record<string, { tipo: string; stock: string; nombre: string }>
  /** key `${producto_id}::${deposito_id}` -> cantidad_actual previa en inventario_stock. */
  inventarioStock?: Record<string, string>
  recetas?: Record<string, Array<{ producto_id: string; cantidad: string; stock: string; nombre: string }>>
  /**
   * Slice B (change `guarda-deposito-inactivo`): is_active de
   * `venta.deposito_id` (el deposito de ORIGEN). Default `true` — preserva el
   * comportamiento de los tests pre-existentes (reingreso siempre al origen,
   * nunca consulta el principal).
   */
  depositoOrigenIsActive?: boolean
  /** Id del deposito principal activo de la empresa — solo se consulta/usa cuando `depositoOrigenIsActive` es `false` (fallback NCR). */
  principalDepositoId?: string
  /** Slice 2: pagos NO reversados de la venta (fuente del egreso condicional + reversa). */
  pagos?: Array<{ id: string; metodo_cobro_id: string; monto: string; moneda_id: string }>
}

/**
 * Simula la unica `db.writeTransaction` de `crearNotaCredito` — captura cada
 * `tx.execute(sql, params)` para las aserciones. Mismo patron que
 * `mockCrearVentaTx` en `use-ventas.test.ts`.
 */
function mockCrearNcrTx(opts: NcrTxFixtures) {
  const calls: Call[] = []
  mockedDb.writeTransaction.mockImplementation(async (callback) => {
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })

        if (sql.startsWith('SELECT * FROM ventas WHERE id')) {
          return { rows: { length: 1, item: () => opts.venta } }
        }
        if (sql.startsWith('SELECT is_active FROM depositos WHERE id')) {
          return {
            rows: { length: 1, item: () => ({ is_active: (opts.depositoOrigenIsActive ?? true) ? 1 : 0 }) },
          }
        }
        if (sql.startsWith('SELECT id FROM depositos WHERE empresa_id = ? AND es_principal = 1')) {
          return opts.principalDepositoId
            ? { rows: { length: 1, item: () => ({ id: opts.principalDepositoId }) } }
            : { rows: { length: 0, item: () => undefined } }
        }
        if (sql.startsWith('SELECT COUNT(*) as cnt FROM notas_credito')) {
          return { rows: { length: 1, item: () => ({ cnt: 0 }) } }
        }
        if (sql.startsWith('INSERT INTO notas_credito')) {
          return { rows: { length: 0, item: () => undefined } }
        }
        if (sql.startsWith('SELECT producto_id, cantidad, lote_id FROM ventas_det')) {
          return { rows: { length: opts.ventaDet.length, item: (i: number) => opts.ventaDet[i] } }
        }
        if (sql.startsWith('SELECT tipo, stock, nombre FROM productos')) {
          const productoId = params[0] as string
          const p = opts.productos[productoId]
          return p ? { rows: { length: 1, item: () => p } } : { rows: { length: 0, item: () => undefined } }
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
        // INSERT guardado (WHERE NOT EXISTS + RETURNING id) — simula insercion exitosa,
        // sin carrera (no hay otra escritura concurrente en estos tests).
        if (sql.startsWith('INSERT INTO inventario_stock')) {
          return { rows: { length: 1, item: () => ({ id: 'stock-insert-fake-id' }) } }
        }
        if (sql.startsWith('SELECT producto_id, deposito_id, tipo, cantidad FROM movimientos_inventario')) {
          return { rows: { length: 0, item: () => undefined } }
        }
        if (sql.startsWith('SELECT stock FROM productos')) {
          const productoId = params[0] as string
          const p = opts.productos[productoId]
          return { rows: { length: 1, item: () => ({ stock: p?.stock ?? '0.000' }) } }
        }
        if (sql.startsWith('SELECT r.producto_id, r.cantidad, p.stock, p.nombre FROM recetas')) {
          const servicioId = params[0] as string
          const ingredientes = opts.recetas?.[servicioId] ?? []
          return { rows: { length: ingredientes.length, item: (i: number) => ingredientes[i] } }
        }
        if (sql.startsWith('UPDATE ventas SET status')) {
          return { rows: { length: 0, item: () => undefined } }
        }
        if (sql.startsWith('SELECT id, metodo_cobro_id, monto, moneda_id FROM pagos')) {
          const pagos = opts.pagos ?? []
          return { rows: { length: pagos.length, item: (i: number) => pagos[i] } }
        }
        if (sql.startsWith('UPDATE pagos SET is_reversed')) {
          return { rows: { length: 0, item: () => undefined } }
        }
        if (sql.startsWith('INSERT INTO movimientos_metodo_cobro')) {
          return { rows: { length: 0, item: () => undefined } }
        }

        return { rows: { length: 0, item: () => undefined } }
      }),
    } as unknown as Transaction

    return callback(tx)
  })
  return calls
}

function baseParams(overrides: Partial<CrearNotaCreditoParams> = {}): CrearNotaCreditoParams {
  return {
    venta_id: 'venta-1',
    motivo: 'Devolucion cliente',
    usuario_id: 'user-1',
    empresa_id: 'emp-1',
    entryPoint: 'TRADICIONAL',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('crearNotaCredito — Slice 4 (reingreso de stock al deposito de ORIGEN de la venta)', () => {
  it('devuelve el stock al deposito de la venta (venta.deposito_id), NO al deposito principal de la empresa', async () => {
    const calls = mockCrearNcrTx({
      venta: {
        id: 'venta-1',
        cliente_id: 'cliente-1',
        nro_factura: 'C01-000001',
        tasa: '40',
        total_usd: '30.00',
        total_bs: '1200.00',
        saldo_pend_usd: '0.00',
        tipo: 'CONTADO',
        status: 'ACTIVA',
        deposito_id: 'dep-B',
      },
      ventaDet: [{ producto_id: 'prod-1', cantidad: '3.000', lote_id: null }],
      productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1' } },
      inventarioStock: { 'prod-1::dep-B': '10.000' },
    })

    await crearNotaCredito(baseParams())

    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInsert).toBeDefined()
    expect(kardexInsert!.params).toContain('dep-B')

    const stockUpsertRead = calls.find((c) => c.sql.startsWith('SELECT id, cantidad_actual FROM inventario_stock'))
    expect(stockUpsertRead).toBeDefined()
    expect(stockUpsertRead!.params).toContain('dep-B')

    // Nunca debe consultar el deposito principal — la fuente es venta.deposito_id.
    const principalLookup = calls.find((c) => c.sql.includes('es_principal'))
    expect(principalLookup).toBeUndefined()
  })

  it('inventario_stock del deposito de origen se incrementa (delta POSITIVO) en la cantidad devuelta', async () => {
    const calls = mockCrearNcrTx({
      venta: {
        id: 'venta-1',
        cliente_id: 'cliente-1',
        nro_factura: 'C01-000001',
        tasa: '40',
        total_usd: '30.00',
        total_bs: '1200.00',
        saldo_pend_usd: '0.00',
        tipo: 'CONTADO',
        status: 'ACTIVA',
        deposito_id: 'dep-B',
      },
      ventaDet: [{ producto_id: 'prod-1', cantidad: '3.000', lote_id: null }],
      productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1' } },
      inventarioStock: { 'prod-1::dep-B': '10.000' },
    })

    await crearNotaCredito(baseParams())

    const stockWrite = calls.find(
      (c) => c.sql.startsWith('INSERT INTO inventario_stock') || c.sql.startsWith('UPDATE inventario_stock')
    )
    expect(stockWrite).toBeDefined()
    expect(stockWrite!.params).toContain('13.000') // 10 (previo en dep-B) + 3 devueltos
  })

  it('productos.stock (total cross-deposito) se incrementa EXACTAMENTE UNA VEZ — sin doble-incremento entre el manual anterior y upsertStockDeposito', async () => {
    const calls = mockCrearNcrTx({
      venta: {
        id: 'venta-1',
        cliente_id: 'cliente-1',
        nro_factura: 'C01-000001',
        tasa: '40',
        total_usd: '30.00',
        total_bs: '1200.00',
        saldo_pend_usd: '0.00',
        tipo: 'CONTADO',
        status: 'ACTIVA',
        deposito_id: 'dep-B',
      },
      ventaDet: [{ producto_id: 'prod-1', cantidad: '3.000', lote_id: null }],
      productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1' } },
      inventarioStock: { 'prod-1::dep-B': '10.000' },
    })

    await crearNotaCredito(baseParams())

    const productoStockUpdates = calls.filter((c) => c.sql.startsWith('UPDATE productos SET stock ='))
    expect(productoStockUpdates).toHaveLength(1)
    expect(productoStockUpdates[0]!.params).toContain('23.000') // 20 (global previo) + 3
  })

  it('el movimiento de kardex insertado (E, NCR) trae el movimientoInventarioId correcto a upsertStockDeposito (sin fila previa en inventario_stock, baseline reconstruido excluyendo ese mismo movimiento)', async () => {
    const calls = mockCrearNcrTx({
      venta: {
        id: 'venta-1',
        cliente_id: 'cliente-1',
        nro_factura: 'C01-000001',
        tasa: '40',
        total_usd: '30.00',
        total_bs: '1200.00',
        saldo_pend_usd: '0.00',
        tipo: 'CONTADO',
        status: 'ACTIVA',
        deposito_id: 'dep-B',
      },
      ventaDet: [{ producto_id: 'prod-1', cantidad: '3.000', lote_id: null }],
      productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1' } },
      // Sin fila previa en inventario_stock para prod-1::dep-B — fuerza el
      // camino de reconstruccion de baseline desde kardex dentro de
      // upsertStockDeposito, que EXCLUYE el movimiento recien insertado por
      // su `id` (movimientoInventarioId).
    })

    await crearNotaCredito(baseParams())

    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInsert).toBeDefined()
    const movId = kardexInsert!.params[0] as string
    expect(movId).toBeTruthy()

    const baselineRebuild = calls.find((c) =>
      c.sql.startsWith('SELECT producto_id, deposito_id, tipo, cantidad FROM movimientos_inventario')
    )
    expect(baselineRebuild).toBeDefined()
    // El baseline excluye explicitamente el movimiento recien insertado (ultimo param `id != ?`).
    expect(baselineRebuild!.params[baselineRebuild!.params.length - 1]).toBe(movId)

    // Insercion resultante en inventario_stock (sin fila previa -> INSERT), con delta +3 sobre baseline 0.
    const stockInsert = calls.find((c) => c.sql.startsWith('INSERT INTO inventario_stock'))
    expect(stockInsert).toBeDefined()
    expect(stockInsert!.params).toContain('3.000')
  })

  it('servicio con receta: reintegra el ingrediente al deposito de la venta (venta.deposito_id), no al principal', async () => {
    const calls = mockCrearNcrTx({
      venta: {
        id: 'venta-1',
        cliente_id: 'cliente-1',
        nro_factura: 'C01-000001',
        tasa: '40',
        total_usd: '30.00',
        total_bs: '1200.00',
        saldo_pend_usd: '0.00',
        tipo: 'CONTADO',
        status: 'ACTIVA',
        deposito_id: 'dep-B',
      },
      ventaDet: [{ producto_id: 'servicio-1', cantidad: '2.000', lote_id: null }],
      productos: {
        'servicio-1': { tipo: 'S', stock: '0.000', nombre: 'Servicio 1' },
        'ing-1': { tipo: 'P', stock: '50.000', nombre: 'Ingrediente 1' },
      },
      recetas: {
        'servicio-1': [{ producto_id: 'ing-1', cantidad: '1.000', stock: '50.000', nombre: 'Ingrediente 1' }],
      },
      inventarioStock: { 'ing-1::dep-B': '5.000' },
    })

    await crearNotaCredito(baseParams())

    const kardexInsert = calls.find(
      (c) => c.sql.startsWith('INSERT INTO movimientos_inventario') && c.params.includes('ing-1')
    )
    expect(kardexInsert).toBeDefined()
    expect(kardexInsert!.params).toContain('dep-B')

    const stockUpsertRead = calls.find(
      (c) => c.sql.startsWith('SELECT id, cantidad_actual FROM inventario_stock') && c.params.includes('ing-1')
    )
    expect(stockUpsertRead).toBeDefined()
    expect(stockUpsertRead!.params).toContain('dep-B')
  })
})

describe('crearNotaCredito — Slice B (change guarda-deposito-inactivo): fallback automatico al principal cuando el deposito de origen esta inactivo', () => {
  it('Scenario: Fallback automatico al principal — venta.deposito_id (dep-B) esta inactivo: reintegra al deposito PRINCIPAL actual, no al origen, sin preguntar al cajero', async () => {
    const calls = mockCrearNcrTx({
      venta: {
        id: 'venta-1',
        cliente_id: 'cliente-1',
        nro_factura: 'C01-000001',
        tasa: '40',
        total_usd: '30.00',
        total_bs: '1200.00',
        saldo_pend_usd: '0.00',
        tipo: 'CONTADO',
        status: 'ACTIVA',
        deposito_id: 'dep-B',
      },
      ventaDet: [{ producto_id: 'prod-1', cantidad: '3.000', lote_id: null }],
      productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1' } },
      inventarioStock: { 'prod-1::dep-principal-actual': '10.000' },
      depositoOrigenIsActive: false,
      principalDepositoId: 'dep-principal-actual',
    })

    await crearNotaCredito(baseParams())

    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInsert).toBeDefined()
    expect(kardexInsert!.params).toContain('dep-principal-actual')
    expect(kardexInsert!.params).not.toContain('dep-B')
  })

  it('origen inactivo y sin deposito principal configurado (caso borde): rechaza en espanol, sin escribir ningun kardex', async () => {
    mockCrearNcrTx({
      venta: {
        id: 'venta-1',
        cliente_id: 'cliente-1',
        nro_factura: 'C01-000001',
        tasa: '40',
        total_usd: '30.00',
        total_bs: '1200.00',
        saldo_pend_usd: '0.00',
        tipo: 'CONTADO',
        status: 'ACTIVA',
        deposito_id: 'dep-B',
      },
      ventaDet: [{ producto_id: 'prod-1', cantidad: '3.000', lote_id: null }],
      productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1' } },
      depositoOrigenIsActive: false,
      // Sin principalDepositoId: no hay deposito principal activo configurado.
    })

    await expect(crearNotaCredito(baseParams())).rejects.toThrow(/deposito/i)
  })
})

describe('crearNotaCredito — Slice 2 (sesion_caja_id link + Regla de Oro egreso condicional + reversa de pagos)', () => {
  function fixturesConPagos(overrides: Partial<NcrTxFixtures['venta']> = {}, pagos?: NcrTxFixtures['pagos']) {
    return {
      venta: {
        id: 'venta-1',
        cliente_id: 'cliente-1',
        nro_factura: 'C01-000001',
        tasa: '40',
        total_usd: '30.00',
        total_bs: '1200.00',
        saldo_pend_usd: '0.00',
        tipo: 'CONTADO',
        status: 'ACTIVA',
        deposito_id: 'dep-B',
        sesion_caja_id: 'sesion-activa-1',
        ...overrides,
      },
      ventaDet: [{ producto_id: 'prod-1', cantidad: '3.000', lote_id: null }],
      productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1' } },
      inventarioStock: { 'prod-1::dep-B': '10.000' },
      pagos,
    }
  }

  it('POS + venta.sesion_caja_id === sesionCajaActivaId: inserta EGRESO en movimientos_metodo_cobro (origen NCR) con el sesion_caja_id activo', async () => {
    const calls = mockCrearNcrTx(
      fixturesConPagos({ sesion_caja_id: 'sesion-activa-1' }, [
        { id: 'pago-1', metodo_cobro_id: 'metodo-efectivo', monto: '30.00', moneda_id: 'usd-id' },
      ])
    )

    await crearNotaCredito(
      baseParams({ entryPoint: 'POS', sesionCajaActivaId: 'sesion-activa-1' })
    )

    // Nota: 'EGRESO' y 'NCR' van hardcodeados como literales en el SQL
    // (VALUES (?, ?, ?, 'EGRESO', 'NCR', ...)), no como parametros bindeados
    // — se detectan via c.sql.includes(), no c.params.includes().
    const egresoInsert = calls.find(
      (c) => c.sql.startsWith('INSERT INTO movimientos_metodo_cobro') && c.sql.includes("'NCR'")
    )
    expect(egresoInsert).toBeDefined()
    expect(egresoInsert!.sql).toContain('EGRESO')
    expect(egresoInsert!.params).toContain('metodo-efectivo')
    expect(egresoInsert!.params).toContain('30.00')
    expect(egresoInsert!.params).toContain('sesion-activa-1')

    const ncrInsert = calls.find((c) => c.sql.startsWith('INSERT INTO notas_credito'))
    expect(ncrInsert).toBeDefined()
    expect(ncrInsert!.params).toContain('sesion-activa-1')
  })

  it('POS + venta.sesion_caja_id !== sesionCajaActivaId (factura de otra sesion): NO inserta egreso (defensa en profundidad)', async () => {
    const calls = mockCrearNcrTx(
      fixturesConPagos({ sesion_caja_id: 'sesion-vieja' }, [
        { id: 'pago-1', metodo_cobro_id: 'metodo-efectivo', monto: '30.00', moneda_id: 'usd-id' },
      ])
    )

    await crearNotaCredito(
      baseParams({ entryPoint: 'POS', sesionCajaActivaId: 'sesion-activa-1' })
    )

    const egresoInsert = calls.find(
      (c) => c.sql.startsWith('INSERT INTO movimientos_metodo_cobro') && c.sql.includes("'NCR'")
    )
    expect(egresoInsert).toBeUndefined()
  })

  it('Tradicional: NO inserta egreso aunque haya pagos, y notas_credito.sesion_caja_id queda NULL', async () => {
    const calls = mockCrearNcrTx(
      fixturesConPagos({ sesion_caja_id: 'sesion-vieja' }, [
        { id: 'pago-1', metodo_cobro_id: 'metodo-efectivo', monto: '30.00', moneda_id: 'usd-id' },
      ])
    )

    await crearNotaCredito(baseParams({ entryPoint: 'TRADICIONAL' }))

    const egresoInsert = calls.find(
      (c) => c.sql.startsWith('INSERT INTO movimientos_metodo_cobro') && c.sql.includes("'NCR'")
    )
    expect(egresoInsert).toBeUndefined()

    const ncrInsert = calls.find((c) => c.sql.startsWith('INSERT INTO notas_credito'))
    expect(ncrInsert).toBeDefined()
    expect(ncrInsert!.params).toContain(null)
  })

  it('multiples metodos de pago: inserta UN egreso POR metodo (per-method), cada uno con su metodo_cobro_id y monto nativo', async () => {
    const calls = mockCrearNcrTx(
      fixturesConPagos({ sesion_caja_id: 'sesion-activa-1' }, [
        { id: 'pago-1', metodo_cobro_id: 'metodo-efectivo', monto: '10.00', moneda_id: 'usd-id' },
        { id: 'pago-2', metodo_cobro_id: 'metodo-tarjeta', monto: '800.00', moneda_id: 'bs-id' },
      ])
    )

    await crearNotaCredito(
      baseParams({ entryPoint: 'POS', sesionCajaActivaId: 'sesion-activa-1' })
    )

    const egresos = calls.filter(
      (c) => c.sql.startsWith('INSERT INTO movimientos_metodo_cobro') && c.sql.includes("'NCR'")
    )
    expect(egresos).toHaveLength(2)
    expect(egresos.some((c) => c.params.includes('metodo-efectivo') && c.params.includes('10.00'))).toBe(true)
    expect(egresos.some((c) => c.params.includes('metodo-tarjeta') && c.params.includes('800.00'))).toBe(true)
  })

  it('marca is_reversed=1 para los pagos no reversados de la venta (NC tipo TOTAL)', async () => {
    const calls = mockCrearNcrTx(
      fixturesConPagos({ sesion_caja_id: 'sesion-activa-1' }, [
        { id: 'pago-1', metodo_cobro_id: 'metodo-efectivo', monto: '30.00', moneda_id: 'usd-id' },
      ])
    )

    await crearNotaCredito(
      baseParams({ entryPoint: 'POS', sesionCajaActivaId: 'sesion-activa-1' })
    )

    const reversa = calls.find((c) => c.sql.startsWith('UPDATE pagos SET is_reversed'))
    expect(reversa).toBeDefined()
    expect(reversa!.params).toContain('venta-1')
  })

  it('sin pagos pendientes de reversar: no inserta egresos y no revienta (reversa is un no-op)', async () => {
    const calls = mockCrearNcrTx(fixturesConPagos({ sesion_caja_id: 'sesion-activa-1' }, []))

    await crearNotaCredito(
      baseParams({ entryPoint: 'POS', sesionCajaActivaId: 'sesion-activa-1' })
    )

    const egresoInsert = calls.find(
      (c) => c.sql.startsWith('INSERT INTO movimientos_metodo_cobro') && c.sql.includes("'NCR'")
    )
    expect(egresoInsert).toBeUndefined()

    const reversa = calls.find((c) => c.sql.startsWith('UPDATE pagos SET is_reversed'))
    expect(reversa).toBeDefined()
  })
})
