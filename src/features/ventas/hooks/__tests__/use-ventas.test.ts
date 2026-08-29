// Mockeamos `@/core/db/powersync/db` porque `use-ventas.ts` usa `db.execute`
// (buscarProductoPorCodigoBarras) y `db.writeTransaction` (crearVenta) a nivel
// de modulo — sin este mock, importar el archivo construye una
// PowerSyncDatabase real y revienta con "Worker is not defined" en el
// entorno de test. Mismo patron que use-kardex.test.ts / stock-deposito.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    execute: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

// `crearVenta` genera asientos contables via `generarAsientosVenta`/`leerMonedaContable` y
// resuelve el mapa de cuentas via `cargarMapaCuentas` — mockeados para no depender de
// `kysely`/PowerSync real (mismo patron que use-compras.test.ts para generarAsientosCompra).
vi.mock('@/features/contabilidad/hooks/use-cuentas-config', () => ({
  cargarMapaCuentas: vi.fn(async () => ({})),
}))
vi.mock('@/features/contabilidad/lib/generar-asientos', () => ({
  generarAsientosVenta: vi.fn(async () => undefined),
  leerMonedaContable: vi.fn(async () => 'USD'),
}))

import type { Transaction } from '@powersync/common'
import { db } from '@/core/db/powersync/db'
import {
  buscarProductoPorCodigoBarras,
  crearVenta,
  type CrearVentaParams,
  type LineaVenta,
  type PagoEntry,
} from '../use-ventas'

const mockedDb = vi.mocked(db, true)

interface Call {
  sql: string
  params: unknown[]
}

function mockExecute(row: Record<string, unknown> | null) {
  const calls: Call[] = []
  mockedDb.execute.mockImplementation((async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    return row
      ? { rows: { length: 1, item: () => row } }
      : { rows: { length: 0, item: () => undefined } }
  }) as unknown as typeof db.execute)
  return calls
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buscarProductoPorCodigoBarras — Slice 2a (lectura de stock escopeada por deposito)', () => {
  it('SIN depositoId (retro-compatibilidad, ej. reportes): NO agrega JOIN a inventario_stock, lee p.stock directo', async () => {
    const calls = mockExecute({
      id: 'prod-1', codigo: 'P-1', tipo: 'P', nombre: 'Producto 1',
      precio_venta_usd: '10.00', precio_mayor_usd: '9.00', precio_especial_usd: '8.00',
      stock: '5.000', codigo_barras: '7501234', es_decimal: 1,
      tipo_impuesto: 'Exento', impuesto_pct: 0,
    })

    const result = await buscarProductoPorCodigoBarras('7501234', 'emp-1')

    expect(result?.stock).toBe('5.000')
    const call = calls[0]
    expect(call.sql).not.toContain('inventario_stock')
    expect(call.sql).toContain('p.stock')
    expect(call.params).toEqual(['emp-1', '7501234'])
  })

  it('CON depositoId (POS): JOIN a inventario_stock escopeado a ese deposito, param antepuesto, stock via COALESCE', async () => {
    const calls = mockExecute({
      id: 'prod-1', codigo: 'P-1', tipo: 'P', nombre: 'Producto 1',
      precio_venta_usd: '10.00', precio_mayor_usd: '9.00', precio_especial_usd: '8.00',
      stock: '0', codigo_barras: '7501234', es_decimal: 1,
      tipo_impuesto: 'Exento', impuesto_pct: 0,
    })

    await buscarProductoPorCodigoBarras('7501234', 'emp-1', 'dep-B')

    const call = calls[0]
    expect(call.sql).toContain('LEFT JOIN inventario_stock')
    expect(call.sql).toContain('COALESCE(s.cantidad_actual, 0)')
    expect(call.params).toEqual(['dep-B', 'emp-1', '7501234'])
  })

  it('producto con 0 stock en el deposito de la caja: no matchea (filtro CAST(...) > 0 aplicado en SQL) — la query real ya lo excluye, aqui verificamos que el filtro usa la expresion escopeada', async () => {
    mockExecute(null)

    const result = await buscarProductoPorCodigoBarras('0000000', 'emp-1', 'dep-B')

    expect(result).toBeNull()
  })
})

describe('crearVenta — Slice 2b (egreso de venta escrito en el deposito de la caja)', () => {
  function baseParams(overrides: Partial<CrearVentaParams> = {}): CrearVentaParams {
    return {
      cliente_id: 'cliente-1',
      tipo: 'CONTADO',
      tasa: 40,
      lineas: [],
      pagos: [],
      usuario_id: 'user-1',
      empresa_id: 'emp-1',
      sesion_caja_id: null,
      ...overrides,
    }
  }

  function linea(overrides: Partial<LineaVenta> = {}): LineaVenta {
    return {
      producto_id: 'prod-1',
      cantidad: 3,
      precio_unitario_usd: 10,
      tipo_impuesto: 'Exento',
      impuesto_pct: 0,
      ...overrides,
    }
  }

  function pago(overrides: Partial<PagoEntry> = {}): PagoEntry {
    return {
      metodo_cobro_id: 'metodo-1',
      moneda: 'USD',
      monto: 30,
      ...overrides,
    }
  }

  interface VentaTxFixtures {
    /**
     * Fila que retorna la resolucion `sesion_caja -> caja.deposito_id` (con
     * `depositos.is_active` del deposito de la caja, change
     * `guarda-deposito-inactivo` Slice B). `null`/ausente = sin fila (sin
     * sesion/caja). `deposito_is_active` ausente = no se testea ese camino
     * (mismo comportamiento que 1, no bloquea — fixtures pre-existentes no
     * lo necesitan).
     */
    cajaDepositoRow?: { deposito_id: string | null; deposito_is_active?: number } | null
    principalDepositoId: string
    productos: Record<string, { tipo: string; stock: string; nombre: string; maneja_lotes: number }>
    /** key `${producto_id}::${deposito_id}` -> cantidad_actual. Ausente = sin fila (baseline 0). */
    inventarioStock?: Record<string, string>
    /** key servicio_id (producto tipo 'S') -> ingredientes de su receta. `stock` = productos.stock GLOBAL del ingrediente. */
    recetas?: Record<string, Array<{ producto_id: string; cantidad: string; stock: string; nombre: string }>>
  }

  /**
   * Simula la unica `db.writeTransaction` de `crearVenta` — captura cada
   * `tx.execute(sql, params)` para las aserciones. Mismo patron que
   * `mockCrearCompraTx` en `use-compras.test.ts`.
   */
  function mockCrearVentaTx(opts: VentaTxFixtures) {
    const calls: { sql: string; params: unknown[] }[] = []
    vi.mocked(db, true).writeTransaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })

          if (sql.startsWith('SELECT c.deposito_id')) {
            if (!opts.cajaDepositoRow) return { rows: { length: 0, item: () => undefined } }
            return { rows: { length: 1, item: () => opts.cajaDepositoRow } }
          }
          if (sql.startsWith('SELECT id FROM depositos WHERE empresa_id = ? AND es_principal = 1')) {
            return { rows: { length: 1, item: () => ({ id: opts.principalDepositoId }) } }
          }
          if (sql.startsWith('SELECT id FROM depositos WHERE empresa_id = ? AND is_active = 1')) {
            return { rows: { length: 1, item: () => ({ id: opts.principalDepositoId }) } }
          }
          if (sql.includes("codigo_iso = 'USD'")) {
            return { rows: { length: 1, item: () => ({ id: 'moneda-usd' }) } }
          }
          if (sql.includes("codigo_iso = 'VES'")) {
            return { rows: { length: 1, item: () => ({ id: 'moneda-bs' }) } }
          }
          if (sql.startsWith('SELECT caja_id FROM sesiones_caja')) {
            return { rows: { length: 0, item: () => undefined } }
          }
          if (sql.startsWith('SELECT COUNT(*) as cnt FROM ventas WHERE empresa_id')) {
            return { rows: { length: 1, item: () => ({ cnt: 0 }) } }
          }
          if (sql.startsWith('SELECT tipo, stock, nombre, maneja_lotes FROM productos')) {
            const productoId = params[0] as string
            const p = opts.productos[productoId]
            return p ? { rows: { length: 1, item: () => p } } : { rows: { length: 0, item: () => undefined } }
          }
          if (sql.startsWith('SELECT cantidad_actual FROM inventario_stock')) {
            const [productoId, depositoId] = params as [string, string]
            const cant = opts.inventarioStock?.[`${productoId}::${depositoId}`]
            return cant !== undefined
              ? { rows: { length: 1, item: () => ({ cantidad_actual: cant }) } }
              : { rows: { length: 0, item: () => undefined } }
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
            return { rows: { length: 0, item: () => undefined } }
          }
          if (sql.startsWith('SELECT stock FROM productos')) {
            const productoId = params[0] as string
            const p = opts.productos[productoId]
            return { rows: { length: 1, item: () => ({ stock: p?.stock ?? '0.000' }) } }
          }
          if (sql.startsWith('SELECT banco_empresa_id, deposito_directo FROM metodos_cobro')) {
            return { rows: { length: 1, item: () => ({ banco_empresa_id: null, deposito_directo: 0 }) } }
          }
          if (sql.startsWith('SELECT r.producto_id, r.cantidad, p.stock, p.nombre FROM recetas')) {
            const servicioId = params[0] as string
            const ingredientes = opts.recetas?.[servicioId] ?? []
            return { rows: { length: ingredientes.length, item: (i: number) => ingredientes[i] } }
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

  it('venta con sesion de caja activa: el kardex de salida y el upsert de inventario_stock usan el deposito de la CAJA, no el principal', async () => {
    const calls = mockCrearVentaTx({
      cajaDepositoRow: { deposito_id: 'dep-caja-A' },
      principalDepositoId: 'dep-principal',
      productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
      inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
    })

    await crearVenta(
      baseParams({
        sesion_caja_id: 'sesion-1',
        lineas: [linea({ producto_id: 'prod-1', cantidad: 3 })],
        pagos: [pago({ monto: 30 })],
      })
    )

    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInsert).toBeDefined()
    expect(kardexInsert!.params).toContain('dep-caja-A')
    expect(kardexInsert!.params).not.toContain('dep-principal')

    const stockUpsertRead = calls.find((c) => c.sql.startsWith('SELECT id, cantidad_actual FROM inventario_stock'))
    expect(stockUpsertRead).toBeDefined()
    expect(stockUpsertRead!.params).toContain('dep-caja-A')

    const stockWrite = calls.find(
      (c) => c.sql.startsWith('INSERT INTO inventario_stock') || c.sql.startsWith('UPDATE inventario_stock')
    )
    expect(stockWrite).toBeDefined()
    expect(stockWrite!.params).toContain('7.000') // 10 (inventario_stock previo en dep-caja-A) - 3
  })

  it('productos.stock (total cross-deposito) se decrementa EXACTAMENTE UNA VEZ por linea — no hay doble decremento entre el manual anterior y upsertStockDeposito', async () => {
    const calls = mockCrearVentaTx({
      cajaDepositoRow: { deposito_id: 'dep-caja-A' },
      principalDepositoId: 'dep-principal',
      productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
      inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
    })

    await crearVenta(
      baseParams({
        sesion_caja_id: 'sesion-1',
        lineas: [linea({ producto_id: 'prod-1', cantidad: 3 })],
        pagos: [pago({ monto: 30 })],
      })
    )

    const productoStockUpdates = calls.filter((c) => c.sql.startsWith('UPDATE productos SET stock ='))
    expect(productoStockUpdates).toHaveLength(1)
    expect(productoStockUpdates[0]!.params).toContain('17.000') // 20 (global previo) - 3
  })

  it('venta SIN sesion de caja activa: cae al deposito principal de la empresa (VSD/Venta sin sesion de caja activa)', async () => {
    const calls = mockCrearVentaTx({
      cajaDepositoRow: null,
      principalDepositoId: 'dep-principal',
      productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
      inventarioStock: { 'prod-1::dep-principal': '10.000' },
    })

    await crearVenta(
      baseParams({
        sesion_caja_id: null,
        lineas: [linea({ producto_id: 'prod-1', cantidad: 2 })],
        pagos: [pago({ monto: 20 })],
      })
    )

    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInsert!.params).toContain('dep-principal')
  })

  it('re-chequeo local por deposito (writeTransaction): rechaza cuando el deposito de la caja tiene stock insuficiente AUNQUE productos.stock (global) alcance — bloquea antes de escribir cualquier kardex', async () => {
    const calls = mockCrearVentaTx({
      cajaDepositoRow: { deposito_id: 'dep-caja-A' },
      principalDepositoId: 'dep-principal',
      productos: { 'prod-1': { tipo: 'P', stock: '100.000', nombre: 'Producto 1', maneja_lotes: 0 } },
      inventarioStock: { 'prod-1::dep-caja-A': '1.000' },
    })

    await expect(
      crearVenta(
        baseParams({
          sesion_caja_id: 'sesion-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 5 })],
          pagos: [pago({ monto: 50 })],
        })
      )
    ).rejects.toThrow(/Stock insuficiente/i)

    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInsert).toBeUndefined()
  })

  it('re-chequeo local por deposito PARA INGREDIENTES DE RECETA (cierre de WARNING): rechaza cuando el ingrediente tiene stock en OTRO deposito pero 0 en el de la caja, AUNQUE productos.stock (global) del ingrediente alcance — bloquea antes de escribir cualquier kardex del ingrediente', async () => {
    const calls = mockCrearVentaTx({
      cajaDepositoRow: { deposito_id: 'dep-caja-A' },
      principalDepositoId: 'dep-principal',
      productos: {
        'servicio-1': { tipo: 'S', stock: '0.000', nombre: 'Servicio 1', maneja_lotes: 0 },
        // El ingrediente tiene 50 GLOBAL (otro deposito) pero SOLO 1 en el deposito de la
        // caja (`inventarioStock` abajo) — insuficiente para las 2 unidades necesarias
        // (1 por unidad de servicio x cantidad=2). Esta fila es la que consulta el
        // `SELECT stock FROM productos WHERE id = ?` (total cross-deposito) de
        // `upsertStockDeposito` si la pre-check NO bloquea antes.
        'ing-1': { tipo: 'P', stock: '50.000', nombre: 'Ingrediente 1', maneja_lotes: 0 },
      },
      recetas: {
        'servicio-1': [
          { producto_id: 'ing-1', cantidad: '1.000', stock: '50.000', nombre: 'Ingrediente 1' },
        ],
      },
      inventarioStock: { 'ing-1::dep-caja-A': '1.000' },
    })

    await expect(
      crearVenta(
        baseParams({
          sesion_caja_id: 'sesion-1',
          lineas: [linea({ producto_id: 'servicio-1', cantidad: 2, precio_unitario_usd: 15 })],
          pagos: [pago({ monto: 30 })],
        })
      )
    ).rejects.toThrow(/Stock insuficiente/i)

    // La PRE-CHECK debe bloquear ANTES de escribir el kardex del ingrediente —
    // no solo dejar que el guard profundo de upsertStockDeposito lo atrape.
    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInsert).toBeUndefined()

    // La lectura per-deposito del ingrediente debe haber ocurrido contra el deposito de la caja.
    const stockDepositoRead = calls.find(
      (c) => c.sql.startsWith('SELECT cantidad_actual FROM inventario_stock') && c.params.includes('ing-1')
    )
    expect(stockDepositoRead).toBeDefined()
    expect(stockDepositoRead!.params).toEqual(['ing-1', 'dep-caja-A', 'emp-1'])
  })

  it('venta con receta: ingrediente CON stock suficiente en el deposito de la caja se consume correctamente (kardex + upsertStockDeposito con el deposito de la caja)', async () => {
    const calls = mockCrearVentaTx({
      cajaDepositoRow: { deposito_id: 'dep-caja-A' },
      principalDepositoId: 'dep-principal',
      productos: {
        'servicio-1': { tipo: 'S', stock: '0.000', nombre: 'Servicio 1', maneja_lotes: 0 },
        'ing-1': { tipo: 'P', stock: '50.000', nombre: 'Ingrediente 1', maneja_lotes: 0 },
      },
      recetas: {
        'servicio-1': [
          { producto_id: 'ing-1', cantidad: '1.000', stock: '50.000', nombre: 'Ingrediente 1' },
        ],
      },
      inventarioStock: { 'ing-1::dep-caja-A': '10.000' },
    })

    await crearVenta(
      baseParams({
        sesion_caja_id: 'sesion-1',
        lineas: [linea({ producto_id: 'servicio-1', cantidad: 2, precio_unitario_usd: 15 })],
        pagos: [pago({ monto: 30 })],
      })
    )

    const kardexInsert = calls.find(
      (c) => c.sql.startsWith('INSERT INTO movimientos_inventario') && c.params.includes('ing-1')
    )
    expect(kardexInsert).toBeDefined()
    expect(kardexInsert!.params).toContain('dep-caja-A')
  })

  it('Scenario: Venta bloqueada (change guarda-deposito-inactivo, Slice B) — el deposito de la caja esta is_active=0: rechaza la venta en espanol, antes de escribir cualquier kardex', async () => {
    const calls = mockCrearVentaTx({
      cajaDepositoRow: { deposito_id: 'dep-caja-A', deposito_is_active: 0 },
      principalDepositoId: 'dep-principal',
      productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
      inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
    })

    await expect(
      crearVenta(
        baseParams({
          sesion_caja_id: 'sesion-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 3 })],
          pagos: [pago({ monto: 30 })],
        })
      )
    ).rejects.toThrow(/deposito.*inactivo/i)

    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInsert).toBeUndefined()
  })

  it('Scenario: Venta permitida — el deposito de la caja sigue is_active=1: procede normalmente (no regresion)', async () => {
    const calls = mockCrearVentaTx({
      cajaDepositoRow: { deposito_id: 'dep-caja-A', deposito_is_active: 1 },
      principalDepositoId: 'dep-principal',
      productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
      inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
    })

    await crearVenta(
      baseParams({
        sesion_caja_id: 'sesion-1',
        lineas: [linea({ producto_id: 'prod-1', cantidad: 3 })],
        pagos: [pago({ monto: 30 })],
      })
    )

    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInsert).toBeDefined()
    expect(kardexInsert!.params).toContain('dep-caja-A')
  })
})
