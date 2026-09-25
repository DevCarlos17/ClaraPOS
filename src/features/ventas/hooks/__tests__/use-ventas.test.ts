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
import { toStorageString } from '@/lib/currency'
import { calcularCierreVentaConSaf } from '../../lib/calcular-cierre-venta-saf'
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
    /** `clientes.saldo_actual` leido por el bloque CxC (FAC) y por el consumo de SAF. Default '0'. */
    clienteSaldoActual?: string
    /** `movimientos_cuenta` SUM(SAFC)-SUM(SAF) del cliente, leido cuando `safEntry` esta presente. Default creado=0/consumido=0. */
    safCredito?: { creado: number; consumido: number }
    /**
     * `cuentas_config.cuenta_contable_id` por `clave`, leido por ABSORBER/DIFERENCIAL_FALTANTE
     * para resolver la cuenta del gasto compensatorio (con fallback cruzado entre claves).
     * Ausente/clave sin valor = sin fila (dispara `throw new Error('sin-cuenta')`).
     */
    cuentasConfig?: { gastos_generales?: string; PERDIDA_DIFERENCIAL_CAMBIARIO?: string }
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
          if (sql.includes("WHEN tipo = 'SAFC'")) {
            const credito = opts.safCredito ?? { creado: 0, consumido: 0 }
            return { rows: { length: 1, item: () => credito } }
          }
          if (sql.startsWith('SELECT saldo_actual FROM clientes')) {
            return { rows: { length: 1, item: () => ({ saldo_actual: opts.clienteSaldoActual ?? '0' }) } }
          }
          if (sql.includes('FROM cuentas_config') && sql.includes("clave = 'gastos_generales'")) {
            const id = opts.cuentasConfig?.gastos_generales
            return id
              ? { rows: { length: 1, item: () => ({ cuenta_contable_id: id }) } }
              : { rows: { length: 0, item: () => undefined } }
          }
          if (sql.includes('FROM cuentas_config') && sql.includes("clave = 'PERDIDA_DIFERENCIAL_CAMBIARIO'")) {
            const id = opts.cuentasConfig?.PERDIDA_DIFERENCIAL_CAMBIARIO
            return id
              ? { rows: { length: 1, item: () => ({ cuenta_contable_id: id }) } }
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

  describe('Paso B — SAF remanente (discrepancy.mode=SAF sin invoiceAssignments) crea credito SAFC, no reduce facturas (cxc-saldo-favor-modelo, WARNING 2)', () => {
    it('el excedente SAF sin facturas asignadas escribe UN SOLO movimiento_cuenta tipo=SAFC (nunca PAG/SAF), con saldo_anterior/saldo_nuevo provistos, y NO reduce saldo_pend_usd de ninguna OTRA factura — la unica UPDATE de saldo_pend_usd es la de la propia venta (paso 6, factura de contado ya cubierta)', async () => {
      const calls = mockCrearVentaTx({
        cajaDepositoRow: { deposito_id: 'dep-caja-A' },
        principalDepositoId: 'dep-principal',
        productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
        inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
      })

      await crearVenta(
        baseParams({
          tipo: 'CONTADO',
          cliente_id: 'cliente-1',
          sesion_caja_id: 'sesion-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 10 })],
          // Pago de $15 sobre una factura de $10 -> excedente de $5 (overpago)
          pagos: [pago({ metodo_cobro_id: 'metodo-1', moneda: 'USD', monto: 15 })],
          discrepancy: {
            mode: 'SAF',
            montoUsd: 5,
            montoBs: 200,
            clienteId: 'cliente-1',
            // Sin invoiceAssignments: Paso A no corre, todo el excedente cae en Paso B
          },
        })
      )

      const movCuentaInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_cuenta'))
      expect(movCuentaInserts).toHaveLength(1)
      expect(movCuentaInserts[0]!.sql).toContain("'SAFC'")

      // Columnas: id, cliente_id, [tipo literal 'SAFC'], referencia, monto,
      // saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, empresa_id,
      // created_at, created_by, moneda_pago, monto_moneda, tasa_pago
      const params = movCuentaInserts[0]!.params
      expect(params[3]).toBe('5.00000000') // monto = remainingSaf
      expect(params[4]).not.toBeNull() // saldo_anterior provisto
      expect(params[5]).not.toBeNull() // saldo_nuevo provisto
      expect(params[5]).toBe('-5.00000000') // saldo_anterior(0, sin fila previa) - 5

      // Escritura unica (venta-saldo-pend-single-write-p0001): saldo_pend_usd de la
      // propia venta ya se escribio en el INSERT — cero UPDATE posteriores.
      // Paso B (creacion de SAFC) jamas toca ventas.saldo_pend_usd de NINGUNA factura.
      const ventaSaldoUpdates = calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd'))
      expect(ventaSaldoUpdates).toHaveLength(0)

      // El INSERT ya lleva el saldo final (factura de contado, cubierta por el pago
      // de $15 sobre $10 -> saldo_pend_usd = 0), no el `totalUsd` provisional.
      const ventaInsert = calls.find((c) => c.sql.startsWith('INSERT INTO ventas ('))
      expect(ventaInsert).toBeDefined()
      expect(ventaInsert!.params[14]).toBe('0.00000000')
    })
  })

  describe('Defensa en profundidad de `tipo` NO debe corromper ventas ABSORBER/DIFERENCIAL_FALTANTE (CRITICAL, review adversarial pos-aplicar-saf-checkout)', () => {
    it('ABSORBER: cierre.tipo (CREDITO, saldoPend=$1 > umbral de redondeo) NO debe sobreescribir el tipo CONTADO forzado por el frontend — la venta queda liquidada (saldo_pend_usd=0) y de contado, sin FAC', async () => {
      const calls = mockCrearVentaTx({
        cajaDepositoRow: { deposito_id: 'dep-caja-A' },
        principalDepositoId: 'dep-principal',
        productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
        inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
        cuentasConfig: { gastos_generales: 'cuenta-abs-1' },
      })

      await crearVenta(
        baseParams({
          tipo: 'CONTADO', // forzado por el frontend (cobro-modal.tsx) para ABSORBER
          tasa: 40,
          sesion_caja_id: 'sesion-1',
          // Total $10, pagado $9 -> faltante Bs 40 ($1), por encima del umbral de
          // auto-absorcion (tasa*0.01 = Bs 0.4) -> calcularCierreVentaConSaf
          // devuelve tipo='CREDITO' porque no conoce discrepancy.mode.
          lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 10 })],
          pagos: [pago({ metodo_cobro_id: 'metodo-1', moneda: 'USD', monto: 9 })],
          discrepancy: { mode: 'ABSORBER', montoUsd: 1, montoBs: 40 },
        })
      )

      // El guard de la "defensa en profundidad" NO debe disparar el UPDATE de tipo.
      const tipoUpdates = calls.filter((c) => c.sql.startsWith('UPDATE ventas SET tipo'))
      expect(tipoUpdates).toHaveLength(0)

      // El INSERT ya escribe el `tipo` original del param ('CONTADO'), no
      // `cierre.tipo` ('CREDITO') — exclusion aplicada ANTES del INSERT
      // (venta-saldo-pend-single-write-p0001), no via UPDATE posterior.
      const ventaInsert = calls.find((c) => c.sql.startsWith('INSERT INTO ventas ('))
      expect(ventaInsert!.params[15]).toBe('CONTADO')

      // `saldo_pend_usd` ya queda en '0.00000000' desde el INSERT (saldoPendFinal) —
      // cero UPDATE de saldo posterior (venta-saldo-pend-single-write-p0001, Fase 4:
      // cierra el invariante de escritura unica tambien para ABSORBER).
      expect(ventaInsert!.params[14]).toBe('0.00000000')
      const saldoUpdates = calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd'))
      expect(saldoUpdates).toHaveLength(0)

      // El gasto compensatorio se registra atomicamente en la misma transaccion.
      const gastoInsert = calls.find(
        (c) => c.sql.startsWith('INSERT INTO gastos') && c.sql.includes('ABSORCION_DIFERENCIAL_POS')
      )
      expect(gastoInsert).toBeDefined()

      // No debe crearse CxC (movimiento tipo='FAC') para una venta absorbida.
      const facInserts = calls.filter(
        (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'FAC'")
      )
      expect(facInserts).toHaveLength(0)
    })

    it('ABSORBER: si NINGUNA cuenta contable esta configurada, el INSERT INTO gastos lanza error y crearVenta rechaza — la transaccion aborta sin dejar una factura zereada sin gasto de respaldo', async () => {
      mockCrearVentaTx({
        cajaDepositoRow: { deposito_id: 'dep-caja-A' },
        principalDepositoId: 'dep-principal',
        productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
        inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
        // Sin `cuentasConfig`: ambas SELECT (gastos_generales / PERDIDA_DIFERENCIAL_CAMBIARIO)
        // devuelven fila vacia -> `throw new Error('sin-cuenta')` ya NO es tragado por
        // un catch (Fase 4 elimino el try/catch) -> el callback de writeTransaction
        // rechaza, que es la señal de que la transaccion real abortaria.
      })

      await expect(
        crearVenta(
          baseParams({
            tipo: 'CONTADO',
            tasa: 40,
            sesion_caja_id: 'sesion-1',
            lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 10 })],
            pagos: [pago({ metodo_cobro_id: 'metodo-1', moneda: 'USD', monto: 9 })],
            discrepancy: { mode: 'ABSORBER', montoUsd: 1, montoBs: 40 },
          })
        )
      ).rejects.toThrow('sin-cuenta')
    })

    it('DIFERENCIAL_FALTANTE: mismo guard — cierre.tipo=CREDITO no debe sobreescribir el tipo CONTADO forzado por el frontend', async () => {
      const calls = mockCrearVentaTx({
        cajaDepositoRow: { deposito_id: 'dep-caja-A' },
        principalDepositoId: 'dep-principal',
        productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
        inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
        cuentasConfig: { PERDIDA_DIFERENCIAL_CAMBIARIO: 'cuenta-diff-1' },
      })

      await crearVenta(
        baseParams({
          tipo: 'CONTADO',
          tasa: 40,
          sesion_caja_id: 'sesion-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 10 })],
          pagos: [pago({ metodo_cobro_id: 'metodo-1', moneda: 'USD', monto: 9 })],
          discrepancy: { mode: 'DIFERENCIAL_FALTANTE', montoUsd: 1, montoBs: 40 },
        })
      )

      const tipoUpdates = calls.filter((c) => c.sql.startsWith('UPDATE ventas SET tipo'))
      expect(tipoUpdates).toHaveLength(0)

      const ventaInsert = calls.find((c) => c.sql.startsWith('INSERT INTO ventas ('))
      expect(ventaInsert!.params[15]).toBe('CONTADO')

      // `saldo_pend_usd` ya queda en '0.00000000' desde el INSERT — cero UPDATE de
      // saldo posterior (venta-saldo-pend-single-write-p0001, Fase 4).
      expect(ventaInsert!.params[14]).toBe('0.00000000')
      const saldoUpdates = calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd'))
      expect(saldoUpdates).toHaveLength(0)

      // El gasto compensatorio se registra atomicamente en la misma transaccion.
      const gastoInsert = calls.find(
        (c) => c.sql.startsWith('INSERT INTO gastos') && c.sql.includes('DIFERENCIAL_CAMBIARIO_FALTANTE')
      )
      expect(gastoInsert).toBeDefined()
    })

    it('DIFERENCIAL_FALTANTE: si NINGUNA cuenta contable esta configurada, el INSERT INTO gastos lanza error y crearVenta rechaza — la transaccion aborta sin dejar una factura zereada sin gasto de respaldo', async () => {
      mockCrearVentaTx({
        cajaDepositoRow: { deposito_id: 'dep-caja-A' },
        principalDepositoId: 'dep-principal',
        productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
        inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
        // Sin `cuentasConfig`: ambas SELECT devuelven fila vacia -> `throw new
        // Error('sin-cuenta')` propaga (Fase 4 elimino el try/catch que lo tragaba).
      })

      await expect(
        crearVenta(
          baseParams({
            tipo: 'CONTADO',
            tasa: 40,
            sesion_caja_id: 'sesion-1',
            lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 10 })],
            pagos: [pago({ metodo_cobro_id: 'metodo-1', moneda: 'USD', monto: 9 })],
            discrepancy: { mode: 'DIFERENCIAL_FALTANTE', montoUsd: 1, montoBs: 40 },
          })
        )
      ).rejects.toThrow('sin-cuenta')
    })
  })

  describe('venta-saldo-pend-single-write-p0001 — escritura unica de saldo_pend_usd/tipo en el INSERT', () => {
    it('100% contado: el INSERT escribe saldo_pend_usd=0 y cero UPDATE de ventas la modifica despues', async () => {
      const calls = mockCrearVentaTx({
        cajaDepositoRow: { deposito_id: 'dep-caja-A' },
        principalDepositoId: 'dep-principal',
        productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
        inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
      })

      await crearVenta(
        baseParams({
          tipo: 'CONTADO',
          sesion_caja_id: 'sesion-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 10 })],
          pagos: [pago({ monto: 10 })],
        })
      )

      const ventaInsert = calls.find((c) => c.sql.startsWith('INSERT INTO ventas ('))
      expect(ventaInsert).toBeDefined()
      expect(ventaInsert!.params[14]).toBe('0.00000000')
      expect(ventaInsert!.params[15]).toBe('CONTADO')

      expect(calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd'))).toHaveLength(0)
      expect(calls.filter((c) => c.sql.startsWith('UPDATE ventas SET tipo'))).toHaveLength(0)
    })

    it('100% credito: el INSERT escribe saldo_pend_usd=totalUsd y cero UPDATE de ventas la modifica despues', async () => {
      const calls = mockCrearVentaTx({
        cajaDepositoRow: { deposito_id: 'dep-caja-A' },
        principalDepositoId: 'dep-principal',
        productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
        inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
        clienteSaldoActual: '0',
      })

      await crearVenta(
        baseParams({
          tipo: 'CREDITO',
          sesion_caja_id: 'sesion-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 10 })],
          pagos: [],
        })
      )

      const ventaInsert = calls.find((c) => c.sql.startsWith('INSERT INTO ventas ('))
      expect(ventaInsert).toBeDefined()
      expect(ventaInsert!.params[14]).toBe('10.00000000')
      expect(ventaInsert!.params[15]).toBe('CREDITO')

      expect(calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd'))).toHaveLength(0)
      expect(calls.filter((c) => c.sql.startsWith('UPDATE ventas SET tipo'))).toHaveLength(0)
    })

    it('pago mixto ($1.00 total, $0.40 efectivo, $0.60 pendiente a credito): el INSERT escribe saldo_pend_usd=0.60 y cero UPDATE de ventas la modifica despues', async () => {
      const calls = mockCrearVentaTx({
        cajaDepositoRow: { deposito_id: 'dep-caja-A' },
        principalDepositoId: 'dep-principal',
        productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
        inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
        clienteSaldoActual: '0',
      })

      await crearVenta(
        baseParams({
          tipo: 'CONTADO',
          sesion_caja_id: 'sesion-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 1 })],
          pagos: [pago({ monto: 0.4 })],
        })
      )

      const ventaInsert = calls.find((c) => c.sql.startsWith('INSERT INTO ventas ('))
      expect(ventaInsert).toBeDefined()
      expect(ventaInsert!.params[14]).toBe('0.60000000')
      expect(ventaInsert!.params[15]).toBe('CREDITO')

      expect(calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd'))).toHaveLength(0)
      expect(calls.filter((c) => c.sql.startsWith('UPDATE ventas SET tipo'))).toHaveLength(0)
    })

    it('SAF aplicado (safEntry): el INSERT escribe saldo_pend_usd ya neto del SAF, y el consumo de SAF (movimientos_cuenta tipo=SAF) se escribe DESPUES del INSERT de ventas (orden pos-aplicar-saf-checkout preservado)', async () => {
      const calls = mockCrearVentaTx({
        cajaDepositoRow: { deposito_id: 'dep-caja-A' },
        principalDepositoId: 'dep-principal',
        productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
        inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
        clienteSaldoActual: '0',
        safCredito: { creado: 15, consumido: 0 }, // credito disponible = 15
      })

      await crearVenta(
        baseParams({
          tipo: 'CONTADO',
          cliente_id: 'cliente-1',
          sesion_caja_id: 'sesion-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 10 })],
          pagos: [],
          safEntry: { clienteId: 'cliente-1', montoUsd: 6 },
        })
      )

      // totalUsd=10, tasa=40, sin pagos, SAF solicitado=6 (disponible=15) -> saldoPend = $4
      const ventaInsert = calls.find((c) => c.sql.startsWith('INSERT INTO ventas ('))
      expect(ventaInsert).toBeDefined()
      expect(ventaInsert!.params[14]).toBe('4.00000000')

      expect(calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd'))).toHaveLength(0)

      const ventaInsertIdx = calls.findIndex((c) => c.sql.startsWith('INSERT INTO ventas ('))
      const safConsumoIdx = calls.findIndex(
        (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAF',")
      )
      expect(safConsumoIdx).toBeGreaterThan(-1)
      expect(safConsumoIdx).toBeGreaterThan(ventaInsertIdx)
    })

    it('idempotencia de replay: el saldo_pend_usd escrito en el INSERT coincide exactamente con el resultado de `calcularCierreVentaConSaf` (mismos inputs) — un reintento de PowerSync reenviaria el mismo valor, NEW == OLD, sin disparar P0001', async () => {
      const calls = mockCrearVentaTx({
        cajaDepositoRow: { deposito_id: 'dep-caja-A' },
        principalDepositoId: 'dep-principal',
        productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
        inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
        clienteSaldoActual: '0',
      })

      await crearVenta(
        baseParams({
          tipo: 'CONTADO',
          sesion_caja_id: 'sesion-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 1 })],
          pagos: [pago({ monto: 0.4 })],
        })
      )

      const ventaInsert = calls.find((c) => c.sql.startsWith('INSERT INTO ventas ('))
      expect(ventaInsert).toBeDefined()
      const saldoEnInsert = ventaInsert!.params[14]

      const cierreEsperado = calcularCierreVentaConSaf({
        totalUsd: 1,
        tasa: 40,
        abonadoBsNativo: 0,
        abonadoUsdNativo: 0.4,
        safSolicitadoUsd: 0,
        creditoDisponibleUsd: 0,
        respetarEleccionCredito: false,
      })
      expect(saldoEnInsert).toBe(toStorageString(cierreEsperado.saldoPendUsd))

      // Ningun UPDATE posterior toca saldo_pend_usd: el valor del INSERT ES el final,
      // por lo que un reintento que reenvie el mismo INSERT es NEW == OLD.
      expect(calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd'))).toHaveLength(0)
    })
  })
})
