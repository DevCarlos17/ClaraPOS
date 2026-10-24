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
import { calcularSaldoPendienteClienteNuevo } from '@/features/cxc/lib/saldo-cliente'
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
    /** `clientes.saldo_pendiente_usd` anterior (slice 1b, cxc-ledger-saldos-redesign). Default '0'. */
    clienteSaldoPendienteUsd?: string
    /** `movimientos_cuenta` SUM(SAFC)-SUM(SAF) del cliente, leido cuando `safEntry` esta presente. Default creado=0/consumido=0. */
    safCredito?: { creado: number; consumido: number }
    /**
     * Lotes SAF activos para `consumirSafLotesEnTx` (PR4, saf-snapshot-y-trazabilidad
     * Fase 4) — consumidos cuando `safEntry`/SAF-como-metodo-de-pago aplica
     * credito existente. Default: un lote unico con saldo = `safCredito`
     * disponible (creado - consumido), suficiente para no romper fixtures
     * pre-existentes que no les interesa el detalle de lotes.
     */
    safLotes?: Array<{ id: string; saldo_disponible_usd: string }>
    /**
     * `cuentas_config.cuenta_contable_id` por `clave`, leido por ABSORBER/DIFERENCIAL_FALTANTE
     * para resolver la cuenta del gasto compensatorio (con fallback cruzado entre claves).
     * Ausente/clave sin valor = sin fila (dispara `throw new Error('sin-cuenta')`).
     */
    cuentasConfig?: { gastos_generales?: string; PERDIDA_DIFERENCIAL_CAMBIARIO?: string }
    /**
     * Paso 8 (trazabilidad-pago-en-venta-simple): `banco_empresa_id`/`deposito_directo`
     * por `metodo_cobro_id`, leido por `SELECT banco_empresa_id, deposito_directo FROM
     * metodos_cobro WHERE id = ?`. Metodo ausente en el mapa = `{ banco_empresa_id: null,
     * deposito_directo: 0 }` (mismo default que el hardcode anterior — preserva
     * regresion para fixtures pre-existentes que no conocen este campo).
     */
    metodosCobro?: Record<string, { banco_empresa_id: string | null; deposito_directo: number }>
    /**
     * Paso 8, rama de deposito directo: `saldo_actual`/`moneda_id` del banco, leido por
     * `SELECT saldo_actual, moneda_id FROM bancos_empresa WHERE id = ?`.
     */
    bancosEmpresa?: Record<string, { saldo_actual: string; moneda_id: string }>
    /**
     * `codigo_iso` por `moneda_id` de banco, leido por `SELECT codigo_iso FROM monedas
     * WHERE id = ?`. Default: `'moneda-bs'` -> `'VES'`, cualquier otro id -> `'USD'`.
     */
    monedasCodigoIso?: Record<string, string>
  }

  /**
   * Simula la unica `db.writeTransaction` de `crearVenta` — captura cada
   * `tx.execute(sql, params)` para las aserciones. Mismo patron que
   * `mockCrearCompraTx` en `use-compras.test.ts`.
   */
  function mockCrearVentaTx(opts: VentaTxFixtures) {
    const calls: { sql: string; params: unknown[] }[] = []
    const { creado: safCreado = 0, consumido: safConsumido = 0 } = opts.safCredito ?? {}
    const safLotesIniciales =
      opts.safLotes ?? [{ id: 'lote-default', saldo_disponible_usd: String(Math.max(0, safCreado - safConsumido)) }]
    const safLotesState = new Map(safLotesIniciales.map((l) => [l.id, l.saldo_disponible_usd]))
    vi.mocked(db, true).writeTransaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })
          if (sql.startsWith('SELECT id, saldo_disponible_usd FROM saf_creditos_lotes')) {
            const rows = safLotesIniciales
              .filter((l) => Number(safLotesState.get(l.id) ?? '0') > 0.0000001)
              .map((l) => ({ id: l.id, saldo_disponible_usd: safLotesState.get(l.id) ?? '0' }))
            return { rows: { length: rows.length, item: (i: number) => rows[i] } }
          }
          if (sql.startsWith('UPDATE saf_creditos_lotes SET saldo_disponible_usd')) {
            safLotesState.set(params[3] as string, params[0] as string)
          }

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
            const metodoId = params[0] as string
            const row = opts.metodosCobro?.[metodoId] ?? { banco_empresa_id: null, deposito_directo: 0 }
            return { rows: { length: 1, item: () => row } }
          }
          if (sql.startsWith('SELECT saldo_actual, moneda_id FROM bancos_empresa')) {
            const bancoId = params[0] as string
            const row = opts.bancosEmpresa?.[bancoId]
            return row ? { rows: { length: 1, item: () => row } } : { rows: { length: 0, item: () => undefined } }
          }
          if (sql.startsWith('SELECT codigo_iso FROM monedas WHERE id = ?')) {
            const monedaId = params[0] as string
            const codigo = opts.monedasCodigoIso?.[monedaId] ?? (monedaId === 'moneda-bs' ? 'VES' : 'USD')
            return { rows: { length: 1, item: () => ({ codigo_iso: codigo }) } }
          }
          if (sql.startsWith('SELECT r.producto_id, r.cantidad, p.stock, p.nombre FROM recetas')) {
            const servicioId = params[0] as string
            const ingredientes = opts.recetas?.[servicioId] ?? []
            return { rows: { length: ingredientes.length, item: (i: number) => ingredientes[i] } }
          }
          if (sql.startsWith('SELECT saf_disponible FROM clientes')) {
            const { creado, consumido } = opts.safCredito ?? { creado: 0, consumido: 0 }
            const disponible = Math.max(0, creado - consumido)
            return { rows: { length: 1, item: () => ({ saf_disponible: String(disponible) }) } }
          }
          // Matchea con o sin `saldo_pendiente_usd` en la lista de columnas
          // (slice 1b, cxc-ledger-saldos-redesign) via includes en vez de
          // startsWith exacto, para no acoplar el test al orden literal.
          if (sql.startsWith('SELECT') && sql.includes('saldo_actual') && sql.includes('saf_disponible') && sql.includes('FROM clientes')) {
            const { creado, consumido } = opts.safCredito ?? { creado: 0, consumido: 0 }
            const disponible = Math.max(0, creado - consumido)
            return {
              rows: {
                length: 1,
                item: () => ({
                  saldo_actual: opts.clienteSaldoActual ?? '0',
                  saf_disponible: String(disponible),
                  saldo_pendiente_usd: opts.clienteSaldoPendienteUsd ?? '0',
                }),
              },
            }
          }
          if (sql.startsWith('SELECT') && sql.includes('saldo_actual') && sql.includes('FROM clientes')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  saldo_actual: opts.clienteSaldoActual ?? '0',
                  saldo_pendiente_usd: opts.clienteSaldoPendienteUsd ?? '0',
                }),
              },
            }
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

  /**
   * Variante STATEFUL de `mockCrearVentaTx` para el bug de doble descuento
   * de `saldo_pendiente_usd` (fix/cxc-ledger-saf-venta-doble-descuento).
   *
   * `mockCrearVentaTx` es un fixture ESTATICO: cada SELECT sobre `clientes`
   * devuelve siempre el mismo valor de `opts.clienteSaldoPendienteUsd`, sin
   * importar cuantos UPDATE clientes hayan corrido antes dentro de la MISMA
   * writeTransaction. Eso oculta el bug de staging: el bloque FAC (linea
   * ~960) escribe `saldo_pendiente_usd` neto del SAF, y el bloque SAF
   * (linea ~1014) vuelve a LEER esa misma columna — con un mock estatico,
   * el bloque SAF lee el valor ANTERIOR a la venta en vez del valor
   * recien escrito por FAC, y el doble descuento nunca se manifiesta en el
   * test.
   *
   * Esta variante mantiene un `clienteState` mutable que CADA `UPDATE
   * clientes SET ...` modifica, y que CADA `SELECT ... FROM clientes`
   * posterior lee — reproduciendo la continuidad de estado real dentro de
   * una transaccion SQLite. El resto de las ramas (productos, depositos,
   * lotes SAF, cuentas_config, etc.) son identicas a `mockCrearVentaTx`.
   */
  function mockCrearVentaTxStatefulCliente(opts: VentaTxFixtures) {
    const calls: { sql: string; params: unknown[] }[] = []
    const { creado: safCreado = 0, consumido: safConsumido = 0 } = opts.safCredito ?? {}
    const safLotesIniciales =
      opts.safLotes ?? [{ id: 'lote-default', saldo_disponible_usd: String(Math.max(0, safCreado - safConsumido)) }]
    const safLotesState = new Map(safLotesIniciales.map((l) => [l.id, l.saldo_disponible_usd]))

    const clienteState = {
      saldo_actual: opts.clienteSaldoActual ?? '0',
      saf_disponible: String(Math.max(0, safCreado - safConsumido)),
      saldo_pendiente_usd: opts.clienteSaldoPendienteUsd ?? '0',
    }

    vi.mocked(db, true).writeTransaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })
          if (sql.startsWith('SELECT id, saldo_disponible_usd FROM saf_creditos_lotes')) {
            const rows = safLotesIniciales
              .filter((l) => Number(safLotesState.get(l.id) ?? '0') > 0.0000001)
              .map((l) => ({ id: l.id, saldo_disponible_usd: safLotesState.get(l.id) ?? '0' }))
            return { rows: { length: rows.length, item: (i: number) => rows[i] } }
          }
          if (sql.startsWith('UPDATE saf_creditos_lotes SET saldo_disponible_usd')) {
            safLotesState.set(params[3] as string, params[0] as string)
          }

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
            const metodoId = params[0] as string
            const row = opts.metodosCobro?.[metodoId] ?? { banco_empresa_id: null, deposito_directo: 0 }
            return { rows: { length: 1, item: () => row } }
          }
          if (sql.startsWith('SELECT saldo_actual, moneda_id FROM bancos_empresa')) {
            const bancoId = params[0] as string
            const row = opts.bancosEmpresa?.[bancoId]
            return row ? { rows: { length: 1, item: () => row } } : { rows: { length: 0, item: () => undefined } }
          }
          if (sql.startsWith('SELECT codigo_iso FROM monedas WHERE id = ?')) {
            const monedaId = params[0] as string
            const codigo = opts.monedasCodigoIso?.[monedaId] ?? (monedaId === 'moneda-bs' ? 'VES' : 'USD')
            return { rows: { length: 1, item: () => ({ codigo_iso: codigo }) } }
          }
          if (sql.startsWith('SELECT r.producto_id, r.cantidad, p.stock, p.nombre FROM recetas')) {
            const servicioId = params[0] as string
            const ingredientes = opts.recetas?.[servicioId] ?? []
            return { rows: { length: ingredientes.length, item: (i: number) => ingredientes[i] } }
          }
          if (sql.startsWith('SELECT saf_disponible FROM clientes')) {
            return { rows: { length: 1, item: () => ({ saf_disponible: clienteState.saf_disponible }) } }
          }
          // STATEFUL (a diferencia de mockCrearVentaTx): lee el estado MUTADO
          // por el ultimo UPDATE clientes, no el fixture original.
          if (sql.startsWith('SELECT') && sql.includes('saldo_actual') && sql.includes('saf_disponible') && sql.includes('FROM clientes')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  saldo_actual: clienteState.saldo_actual,
                  saf_disponible: clienteState.saf_disponible,
                  saldo_pendiente_usd: clienteState.saldo_pendiente_usd,
                }),
              },
            }
          }
          if (sql.startsWith('SELECT') && sql.includes('saldo_actual') && sql.includes('FROM clientes')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  saldo_actual: clienteState.saldo_actual,
                  saldo_pendiente_usd: clienteState.saldo_pendiente_usd,
                }),
              },
            }
          }
          // STATEFUL: cada UPDATE clientes muta clienteState para que el
          // PROXIMO SELECT (si lo hay, dentro de la misma tx) vea el valor
          // recien escrito — esto es lo que reproduce el bug de staging.
          if (sql.startsWith('UPDATE clientes SET saldo_actual') && sql.includes('saf_disponible')) {
            clienteState.saldo_actual = params[0] as string
            clienteState.saf_disponible = params[1] as string
            clienteState.saldo_pendiente_usd = params[2] as string
          } else if (sql.startsWith('UPDATE clientes SET saldo_actual')) {
            clienteState.saldo_actual = params[0] as string
            clienteState.saldo_pendiente_usd = params[1] as string
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
    return { calls, clienteState }
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
        clienteSaldoPendienteUsd: '40.00000000',
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

      // Escritura optimista pareada de saf_disponible (SAFC suma): sin credito
      // previo (safCredito no provisto -> disponible=0), se crean 5 -> 5.
      const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET saldo_actual'))
      expect(clienteUpdate).toBeDefined()
      expect(clienteUpdate!.sql).toContain('saf_disponible')
      expect(clienteUpdate!.params).toContain(toStorageString(5))

      // wiring saldo_pendiente_usd (slice 1b, cxc-ledger-saldos-redesign):
      // SAFC (Paso B, excedente sin facturas asignadas) es no-op para deuda
      // pendiente — se escribe igual, preservando el valor anterior sin cambio.
      expect(clienteUpdate!.sql).toContain('saldo_pendiente_usd')
      const esperadoNoOp = calcularSaldoPendienteClienteNuevo('SAFC', '40.00000000', '5')
      expect(clienteUpdate!.params).toContain(toStorageString(esperadoNoOp))
      expect(toStorageString(esperadoNoOp)).toBe('40.00000000')
    })

    it('PR7 (saf-trazabilidad-pago, reemplaza PR3): inserta un pago anticipo (venta_id=NULL, metodo_cobro_id real) y el lote saf_creditos_lotes apunta origen_tipo=PAGO a ESE pago (no a la venta), anclado al SAFC, saldo_disponible_usd=monto_original_usd=remainingSaf, status=ACTIVO', async () => {
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
          pagos: [pago({ metodo_cobro_id: 'metodo-1', moneda: 'USD', monto: 15 })],
          discrepancy: {
            mode: 'SAF',
            montoUsd: 5,
            montoBs: 200,
            clienteId: 'cliente-1',
          },
        })
      )

      const safcInsert = calls.find(
        (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAFC'")
      )
      expect(safcInsert).toBeDefined()
      const safcMovId = safcInsert!.params[0] as string

      const pagoInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO pagos'))
      // El pago anticipo del excedente SAF tiene venta_id=NULL literal en el SQL
      // (a diferencia del pago principal de la venta, que liga venta_id real)
      const pagoAnticipo = pagoInserts.find((c) => /VALUES \(\?, NULL,/.test(c.sql))
      expect(pagoAnticipo).toBeDefined()
      expect(pagoAnticipo!.params).toContain('metodo-1') // metodo_cobro_id real del excedente
      const pagoAnticipoId = pagoAnticipo!.params[0] as string

      const loteInsert = calls.find((c) => c.sql.startsWith('INSERT INTO saf_creditos_lotes'))
      expect(loteInsert).toBeDefined()
      expect(loteInsert!.sql).toContain("'PAGO'")
      expect(loteInsert!.sql).not.toContain("'VENTA'")
      expect(loteInsert!.sql).toContain("'ACTIVO'")

      // movimiento_cuenta_id ancla el lote al SAFC recien insertado (coexistencia)
      expect(loteInsert!.params).toContain(safcMovId)
      // origen_id = el pago anticipo recien creado, YA NO la venta directamente
      expect(loteInsert!.params).toContain(pagoAnticipoId)
      // monto_original_usd = saldo_disponible_usd = remainingSaf ($5)
      const montoOcurrencias = loteInsert!.params.filter((p) => p === toStorageString(5))
      expect(montoOcurrencias).toHaveLength(2)
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
        clienteSaldoPendienteUsd: '15.00000000',
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

      // wiring saldo_pendiente_usd (slice 1b, cxc-ledger-saldos-redesign):
      // venta a credito (tipo FAC) aumenta la deuda pendiente del cliente.
      const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
      expect(clienteUpdate).toBeDefined()
      expect(clienteUpdate!.sql).toContain('saldo_pendiente_usd')
      // 15 (anterior) + 10 (saldoPend de esta venta) = 25
      expect(clienteUpdate!.params).toContain(toStorageString(25))
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
      // Mock STATEFUL (fix/cxc-ledger-saf-venta-doble-descuento): este
      // escenario SI dispara el bloque FAC (cierre.tipo='CREDITO' porque
      // saldoPend=$4 > 0.001, aunque el parametro `tipo` sea 'CONTADO') —
      // con el mock estatico anterior, la relectura del bloque SAF no veia
      // el efecto del UPDATE del bloque FAC y el bug de doble descuento
      // quedaba invisible para este test. El mock stateful reproduce la
      // continuidad real de la transaccion.
      const { calls } = mockCrearVentaTxStatefulCliente({
        cajaDepositoRow: { deposito_id: 'dep-caja-A' },
        principalDepositoId: 'dep-principal',
        productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
        inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
        clienteSaldoActual: '0',
        clienteSaldoPendienteUsd: '20.00000000',
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
        (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAFV',")
      )
      expect(safConsumoIdx).toBeGreaterThan(-1)
      expect(safConsumoIdx).toBeGreaterThan(ventaInsertIdx)

      // Escritura optimista pareada de saf_disponible (saf-snapshot-y-trazabilidad):
      // disponible=15 (gate), se consumen 6 -> 9. Distinguir del UPDATE del
      // bloque FAC (mismo prefijo de SQL, sin columna saf_disponible).
      const clienteUpdate = calls.find(
        (c) => c.sql.startsWith('UPDATE clientes SET saldo_actual') && c.sql.includes('saf_disponible')
      )
      expect(clienteUpdate).toBeDefined()
      expect(clienteUpdate!.params).toContain(toStorageString(9))

      // wiring saldo_pendiente_usd (slice 1b, cxc-ledger-saldos-redesign) +
      // FIX (fix/cxc-ledger-saf-venta-doble-descuento): el bloque FAC ya
      // subio la deuda de 20 (anterior) a 24 (20 + saldoPend=$4, neto del
      // SAF). El bloque SAF NO vuelve a restar los $6 de SAF aplicado —
      // esa resta YA esta reflejada en que el FAC solo sumo $4 (no $10) en
      // primer lugar. El valor final debe ser 24, NUNCA 14 (que seria el
      // resultado del doble descuento: 20 + 4 - 6 = 18, o peor, el bug
      // original de staging que ignoraba por completo el efecto del FAC).
      expect(clienteUpdate!.sql).toContain('saldo_pendiente_usd')
      expect(clienteUpdate!.params).toContain(toStorageString(24))
      expect(clienteUpdate!.params).not.toContain(toStorageString(14))
    })

    it('PR4 (saf-snapshot-y-trazabilidad): SAF como metodo de pago consume lotes FIFO — 2 filas saf_creditos_aplicaciones cuando el monto cruza 2 lotes, pareadas con el SAF recien creado', async () => {
      const calls = mockCrearVentaTx({
        cajaDepositoRow: { deposito_id: 'dep-caja-A' },
        principalDepositoId: 'dep-principal',
        productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
        inventarioStock: { 'prod-1::dep-caja-A': '10.000' },
        clienteSaldoActual: '0',
        safCredito: { creado: 15, consumido: 0 },
        safLotes: [
          { id: 'lote-viejo', saldo_disponible_usd: '4.00000000' },
          { id: 'lote-nuevo', saldo_disponible_usd: '11.00000000' },
        ],
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

      const safConsumo = calls.find(
        (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAFV',")
      )
      expect(safConsumo).toBeDefined()
      const safMovId = safConsumo!.params[0] as string

      const aplicaciones = calls.filter((c) => c.sql.startsWith('INSERT INTO saf_creditos_aplicaciones'))
      expect(aplicaciones).toHaveLength(2)

      // Columnas: id, empresa_id, cliente_id, lote_id, venta_id, movimiento_cuenta_id, monto_aplicado_usd, ...
      expect(aplicaciones[0]!.params[3]).toBe('lote-viejo')
      expect(aplicaciones[0]!.params[6]).toBe(toStorageString(4)) // lote-viejo agotado
      expect(aplicaciones[1]!.params[3]).toBe('lote-nuevo')
      expect(aplicaciones[1]!.params[6]).toBe(toStorageString(2)) // resto: 6 - 4 = 2

      const sumaAplicada = aplicaciones.reduce((acc, c) => acc + Number(c.params[6]), 0)
      expect(sumaAplicada).toBeCloseTo(6, 8)

      // Ambas aplicaciones anclan al MISMO movimiento_cuenta SAF (coexistencia)
      expect(aplicaciones[0]!.params[5]).toBe(safMovId)
      expect(aplicaciones[1]!.params[5]).toBe(safMovId)
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

  describe('cxc-sync-snapshot-redesign (CRITICAL-1): estado optimista en el INSERT de ventas', () => {
    it('CONTADO: el INSERT escribe estado = calcularEstadoVenta(saldoPendFinal=0, totalUsd, null) = "pago" — antes de este fix el estado local quedaba NULL/stuck en DEFAULT hasta el proximo sync-down', async () => {
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
      expect(ventaInsert!.sql).toContain('estado')
      // params[14]=saldo_pend_usd, params[15]=tipo se mantienen intactos: `estado`
      // se inserto justo DESPUES de `tipo` (indice 16), no reordena las columnas
      // previas — cero aserciones pre-existentes de indice necesitan cambiar.
      expect(ventaInsert!.params[14]).toBe('0.00000000')
      expect(ventaInsert!.params[15]).toBe('CONTADO')
      expect(ventaInsert!.params[16]).toBe('pago')
    })

    it('CREDITO: el INSERT escribe estado = calcularEstadoVenta(saldoPendFinal=totalUsd, totalUsd, null) = "pendiente"', async () => {
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
      expect(ventaInsert!.params[16]).toBe('pendiente')
    })
  })

  describe('BUG staging — crearVenta CREDITO + SAF duplica el descuento de saldo_pendiente_usd (fix/cxc-ledger-saf-venta-doble-descuento, CORREGIDO DE RAIZ via SAFV en fix/cxc-saf-venta-tipo-safv)', () => {
    // Escenario exacto de staging: factura CREDITO de $100, SAF aplicado
    // $50 como metodo de pago, cliente arranca con saldo_pendiente_usd=0.
    // tasa=1 para que usdToBs/bsToUsd sean identidad (sin ruido de
    // redondeo Bs) — el bug es aritmetico, no de tasa de cambio.
    //
    // Regla de negocio confirmada por el owner: "la aplicacion del SAF
    // cuenta como metodo de pago, y la deuda es el restante que hubiera
    // quedado pendiente" -> deuda real = $100 - $50 = $50.
    //
    // Bloque FAC (linea ~960 de use-ventas.ts) YA escribe la deuda NETA del
    // SAF (el POS prededuce el SAF del total facturable antes de llegar
    // aqui, via calcularCierreVentaConSaf): FAC monto=$50, no $100. El
    // bloque SAFV (linea ~1014, ANTES tipo='SAF') NO debe volver a restar
    // esos mismos $50 de saldo_pendiente_usd — la deuda ya nacio neta en el
    // FAC.
    //
    // HISTORIA: PR #249 (fix/cxc-ledger-saf-venta-doble-descuento) corrigio
    // esto SOLO en la app (pass-through local), pero datos reales de
    // staging (CLIENTE TEST 3, venta C01-000021, POSTERIOR al merge de
    // #249) confirmaron que el trigger SERVIDOR seguia corrompiendo el
    // valor: trataba CUALQUIER fila tipo='SAF' como resta de deuda, sin
    // distinguir "SAF como metodo de pago en una venta que ya nacio neta"
    // de "SAF paga una factura preexistente bruta" (flujo CxC). Este
    // archivo (fix/cxc-saf-venta-tipo-safv, migrations/0115) corrige la
    // causa raiz: el INSERT ahora usa tipo='SAFV', que el trigger trata
    // como neutral para saldo_pendiente_usd EN EL ORIGEN — ya no hay
    // carrera entre el PATCH de la app y el trigger que ganar.
    function stockFixture() {
      return {
        cajaDepositoRow: null as { deposito_id: string | null } | null,
        principalDepositoId: 'dep-principal',
        productos: { 'prod-1': { tipo: 'P', stock: '20.000', nombre: 'Producto 1', maneja_lotes: 0 } },
        inventarioStock: { 'prod-1::dep-principal': '10.000' },
      }
    }

    it('[RED->GREEN] FAC nace neto del SAF ($50, no $100) y el bloque SAF NO debe re-descontar esos $50 de saldo_pendiente_usd — el UPDATE final debe quedar en 50, NO en 0', async () => {
      const { calls, clienteState } = mockCrearVentaTxStatefulCliente({
        ...stockFixture(),
        clienteSaldoActual: '0',
        clienteSaldoPendienteUsd: '0', // cliente arranca sin deuda (staging: 0)
        safCredito: { creado: 50, consumido: 0 }, // saf_disponible = 50
      })

      await crearVenta(
        baseParams({
          tipo: 'CREDITO',
          tasa: 1,
          cliente_id: 'cliente-1',
          sesion_caja_id: null,
          lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 100 })],
          pagos: [],
          safEntry: { clienteId: 'cliente-1', montoUsd: 50 },
        })
      )

      // Invariante FAC-es-neto: el movimiento FAC registra $50 (total $100 -
      // SAF aplicado $50), NUNCA el total bruto de $100.
      const facInsert = calls.find(
        (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'FAC'")
      )
      expect(facInsert).toBeDefined()
      expect(facInsert!.params).toContain('50.00000000')
      expect(facInsert!.params).not.toContain('100.00000000')

      // El SAF SI se consume como metodo de pago (saf_disponible: 50 -> 0) —
      // esta parte del ledger ya funciona correctamente hoy. FIX (SAFV,
      // migrations/0115): el INSERT ahora usa tipo='SAFV', NO 'SAF' — el
      // trigger servidor trata 'SAFV' como neutral para saldo_pendiente_usd
      // en el origen (nunca resta), eliminando la ambiguedad de origen que
      // corrompia los datos de staging (CLIENTE TEST 3) a pesar del
      // pass-through app-side de PR #249.
      const safInsert = calls.find(
        (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAFV',")
      )
      expect(safInsert).toBeDefined()
      expect(safInsert!.params).toContain('50.00000000')

      // Ningun INSERT de este bloque usa el tipo legado 'SAF' — confirma
      // que la migracion de tipo fue completa, no un agregado parcial.
      const safLegadoInsert = calls.find(
        (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAF',")
      )
      expect(safLegadoInsert).toBeUndefined()

      const safClienteUpdate = calls.find(
        (c) => c.sql.startsWith('UPDATE clientes SET saldo_actual') && c.sql.includes('saf_disponible')
      )
      expect(safClienteUpdate).toBeDefined()
      expect(safClienteUpdate!.sql).toContain('saldo_pendiente_usd')

      // LA ASERCION QUE REPRODUCE EL BUG DE STAGING: la deuda real es $50
      // (= $100 - $50 de SAF aplicado) — NUNCA $0. El codigo actual
      // (pre-fix) escribe 0 aqui porque el bloque SAF relee el
      // saldo_pendiente_usd YA NETO ($50, escrito por el FAC de arriba
      // gracias al mock STATEFUL) y le resta $50 OTRA VEZ.
      // Columnas del UPDATE: saldo_actual, saf_disponible, saldo_pendiente_usd,
      // updated_at, id — saldo_pendiente_usd es params[2].
      expect(safClienteUpdate!.params[2]).toBe('50.00000000')
      expect(safClienteUpdate!.params[2]).not.toBe('0.00000000')

      // Estado final del cliente (helper stateful) confirma lo mismo desde
      // otro angulo: saldo_pendiente_usd termina en 50, saf_disponible en 0.
      expect(clienteState.saldo_pendiente_usd).toBe('50.00000000')
      expect(clienteState.saf_disponible).toBe('0.00000000')
    })

    it('[triangulacion] SAF cubre TODO el total ($100 total, $100 SAF disponible y aplicado): deuda final = $0, no negativa — piso en 0 preservado', async () => {
      const { clienteState } = mockCrearVentaTxStatefulCliente({
        ...stockFixture(),
        clienteSaldoActual: '0',
        clienteSaldoPendienteUsd: '0',
        safCredito: { creado: 100, consumido: 0 },
      })

      await crearVenta(
        baseParams({
          tipo: 'CREDITO',
          tasa: 1,
          cliente_id: 'cliente-1',
          sesion_caja_id: null,
          lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 100 })],
          pagos: [],
          safEntry: { clienteId: 'cliente-1', montoUsd: 100 },
        })
      )

      // SAF cubre el 100% -> saldoPend (cierre) = 0 -> cierre.tipo='CONTADO'
      // -> el bloque FAC (gateado sobre cierre.tipo==='CREDITO') NUNCA corre
      // -> saldoPendienteAntesSafVenta se queda en el fixture inicial (0).
      // El bloque SAFV SI corre (gateado solo sobre safAplicadoUsd > 0, no
      // sobre cierre.tipo) y es debt-neutral (calcularSaldoPendienteClienteNuevo
      // cae al ELSE para 'SAFV' — ver migrations/0115): escribe el mismo
      // valor anterior (0) SIN CAMBIOS, nunca resta. Mismo resultado final
      // (0) que antes del fix, pero ahora por neutralidad de origen, no por
      // un piso-en-0 de una resta que nunca debio ocurrir.
      expect(clienteState.saldo_pendiente_usd).toBe('0.00000000')
      expect(clienteState.saf_disponible).toBe('0.00000000')
    })

    it('[regression guard] venta a credito SIN SAF: el bloque FAC sigue aumentando saldo_pendiente_usd normalmente (comportamiento NO afectado por este fix)', async () => {
      const { calls, clienteState } = mockCrearVentaTxStatefulCliente({
        ...stockFixture(),
        clienteSaldoActual: '0',
        clienteSaldoPendienteUsd: '20.00000000',
      })

      await crearVenta(
        baseParams({
          tipo: 'CREDITO',
          tasa: 1,
          cliente_id: 'cliente-1',
          sesion_caja_id: null,
          lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 30 })],
          pagos: [],
        })
      )

      const safInsert = calls.find(
        (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAFV',")
      )
      expect(safInsert).toBeUndefined() // sin safEntry, no hay bloque SAFV

      const facClienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET saldo_actual'))
      expect(facClienteUpdate).toBeDefined()
      // 20 (anterior) + 30 (FAC, monto total — sin SAF que lo netee) = 50
      expect(facClienteUpdate!.params).toContain('50.00000000')
      expect(clienteState.saldo_pendiente_usd).toBe('50.00000000')
    })
  })

  describe('crearVenta — trazabilidad movimientos_bancarios_pagos (capa simple, change trazabilidad-pago-en-venta-simple)', () => {
    function pagoDirectoFixture() {
      return {
        cajaDepositoRow: { deposito_id: 'dep-caja-A' },
        principalDepositoId: 'dep-principal',
        productos: { 'prod-1': { tipo: 'P', stock: '100.000', nombre: 'Producto 1', maneja_lotes: 0 } },
        inventarioStock: { 'prod-1::dep-caja-A': '100.000' },
      }
    }

    it('pago directo simple (100% transferencia, deposito_directo=1): 1 fila puente con pago_id/monto_aplicado_usd correctos', async () => {
      const calls = mockCrearVentaTx({
        ...pagoDirectoFixture(),
        metodosCobro: { 'metodo-transferencia': { banco_empresa_id: 'banco-1', deposito_directo: 1 } },
        bancosEmpresa: { 'banco-1': { saldo_actual: '0.00000000', moneda_id: 'moneda-usd' } },
      })

      await crearVenta(
        baseParams({
          sesion_caja_id: 'sesion-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 3, precio_unitario_usd: 10 })],
          pagos: [pago({ metodo_cobro_id: 'metodo-transferencia', moneda: 'USD', monto: 30 })],
        })
      )

      const pagoInsert = calls.find((c) => c.sql.startsWith('INSERT INTO pagos'))
      expect(pagoInsert).toBeDefined()
      const pagoId = pagoInsert!.params[0] as string

      const movBancoInsert = calls.find(
        (c) => c.sql.startsWith('INSERT INTO movimientos_bancarios') && !c.sql.startsWith('INSERT INTO movimientos_bancarios_pagos')
      )
      expect(movBancoInsert).toBeDefined()
      const movBancoId = movBancoInsert!.params[0] as string

      const puenteInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_bancarios_pagos'))
      expect(puenteInserts).toHaveLength(1)
      const [id, empresaId, ingresoId, pagoIdPuente, montoAplicado] = puenteInserts[0]!.params as string[]
      expect(id).toBeTruthy()
      expect(empresaId).toBe('emp-1')
      expect(ingresoId).toBe(movBancoId)
      expect(pagoIdPuente).toBe(pagoId)
      expect(montoAplicado).toBe(toStorageString(30))
    })

    it('pago mixto (transferencia $60 + efectivo $40): exactamente 1 fila puente para el leg directo, 0 para el leg efectivo', async () => {
      const calls = mockCrearVentaTx({
        ...pagoDirectoFixture(),
        metodosCobro: {
          'metodo-transferencia': { banco_empresa_id: 'banco-1', deposito_directo: 1 },
          'metodo-efectivo': { banco_empresa_id: null, deposito_directo: 0 },
        },
        bancosEmpresa: { 'banco-1': { saldo_actual: '0.00000000', moneda_id: 'moneda-usd' } },
      })

      await crearVenta(
        baseParams({
          sesion_caja_id: 'sesion-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 10, precio_unitario_usd: 10 })],
          pagos: [
            pago({ metodo_cobro_id: 'metodo-transferencia', moneda: 'USD', monto: 60 }),
            pago({ metodo_cobro_id: 'metodo-efectivo', moneda: 'USD', monto: 40 }),
          ],
        })
      )

      const pagoInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO pagos'))
      expect(pagoInserts).toHaveLength(2)
      const pagoTransferencia = pagoInserts.find((c) => c.params.includes('metodo-transferencia'))
      expect(pagoTransferencia).toBeDefined()
      const pagoTransferenciaId = pagoTransferencia!.params[0] as string

      const puenteInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_bancarios_pagos'))
      expect(puenteInserts).toHaveLength(1)
      expect(puenteInserts[0]!.params[3]).toBe(pagoTransferenciaId)
      expect(puenteInserts[0]!.params[4]).toBe(toStorageString(60))
    })

    it('100% efectivo (deposito_directo=0): 0 filas puente, crearVenta no revienta', async () => {
      const calls = mockCrearVentaTx({
        ...pagoDirectoFixture(),
        metodosCobro: { 'metodo-efectivo': { banco_empresa_id: null, deposito_directo: 0 } },
      })

      await crearVenta(
        baseParams({
          sesion_caja_id: 'sesion-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 5, precio_unitario_usd: 10 })],
          pagos: [pago({ metodo_cobro_id: 'metodo-efectivo', moneda: 'USD', monto: 50 })],
        })
      )

      const puenteInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_bancarios_pagos'))
      expect(puenteInserts).toHaveLength(0)
      const pagoInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO pagos'))
      expect(pagoInserts).toHaveLength(1)
    })

    it('monto capeado, no recalculado (modo SAF-FACTURAS): monto_aplicado_usd del puente == pagoMontoUsd capeado de Paso 5, NO el monto crudo que Paso 8 recalcula', async () => {
      const calls = mockCrearVentaTx({
        ...pagoDirectoFixture(),
        metodosCobro: { 'metodo-transferencia': { banco_empresa_id: 'banco-1', deposito_directo: 1 } },
        bancosEmpresa: { 'banco-1': { saldo_actual: '0.00000000', moneda_id: 'moneda-usd' } },
      })

      await crearVenta(
        baseParams({
          sesion_caja_id: 'sesion-1',
          cliente_id: 'cliente-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 10 })],
          // Pago de $15 sobre una factura de $10: el excedente ($5) se desvia via
          // SAF-FACTURAS (invoiceAssignments) sin ejecutar su machinery real —
          // discrepancy.montoUsd=0 evita por completo el switch de Paso 7c (gate
          // `discrepancy.montoUsd > 0.001`), y el item de invoiceAssignments con
          // montoUsd=0.0001 (<=0.001) hace que, si el switch SI corriera, el loop
          // de Paso A lo saltee (`continue`) sin llamar aplicarPagoFacturaEnTx.
          // Solo se necesita `isSafWithAssignments=true` (longitud > 0) para que
          // Paso 5 capee pagoMontoUsd a $10 (el monto REAL insertado en pagos).
          pagos: [pago({ metodo_cobro_id: 'metodo-transferencia', moneda: 'USD', monto: 15 })],
          discrepancy: {
            mode: 'SAF',
            montoUsd: 0,
            montoBs: 0,
            clienteId: 'cliente-1',
            invoiceAssignments: [{ ventaId: 'venta-otra', nroFactura: 'F-OTRA', montoUsd: 0.0001 }],
          },
        })
      )

      const pagoInsert = calls.find((c) => c.sql.startsWith('INSERT INTO pagos'))
      expect(pagoInsert).toBeDefined()
      expect(pagoInsert!.params[7]).toBe(toStorageString(10)) // monto_usd capeado, no 15

      const movBancoInsert = calls.find(
        (c) => c.sql.startsWith('INSERT INTO movimientos_bancarios') && !c.sql.startsWith('INSERT INTO movimientos_bancarios_pagos')
      )
      expect(movBancoInsert).toBeDefined()
      // Paso 8 recalcula el monto crudo sin capear — comportamiento preexistente, sin cambios.
      expect(movBancoInsert!.params[3]).toBe(toStorageString(15))

      const puenteInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_bancarios_pagos'))
      expect(puenteInserts).toHaveLength(1)
      // El puente usa el monto CAPEADO de Paso 5 (10), no el crudo de Paso 8 (15).
      expect(puenteInserts[0]!.params[4]).toBe(toStorageString(10))
    })

    it('cap SAF a cero (branch continue de Paso 5): el leg capeado a cero no genera fila puente, pero el leg valido de la MISMA venta SI genera la suya (el indice no se desalinea)', async () => {
      const calls = mockCrearVentaTx({
        ...pagoDirectoFixture(),
        metodosCobro: {
          'metodo-transferencia': { banco_empresa_id: 'banco-1', deposito_directo: 1 },
        },
        bancosEmpresa: { 'banco-1': { saldo_actual: '0.00000000', moneda_id: 'moneda-usd' } },
      })

      await crearVenta(
        baseParams({
          sesion_caja_id: 'sesion-1',
          cliente_id: 'cliente-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 1, precio_unitario_usd: 10 })],
          // leg 0: cubre el 100% de la factura ($10) -> genera pagos+puente normal.
          // leg 1: excedente SAF ($5) sobre una factura YA cubierta -> Paso 5 capea
          // su pagoMontoUsd a 0 (totalUsd - totalAbonadoUsd = 0) -> push(null),
          // continue -> NO inserta en pagos NI en el puente. Paso 8 SI crea su
          // propio movimientos_bancarios (monto crudo sin capear, comportamiento
          // preexistente — ingreso LEGACY documentado en design.md) para AMBOS
          // legs — el punto del test es que el puente NO se crea para el leg nulo
          // y que el leg valido (indice 0) sigue correlacionando correctamente.
          pagos: [
            pago({ metodo_cobro_id: 'metodo-transferencia', moneda: 'USD', monto: 10 }),
            pago({ metodo_cobro_id: 'metodo-transferencia', moneda: 'USD', monto: 5 }),
          ],
          discrepancy: {
            mode: 'SAF',
            montoUsd: 0,
            montoBs: 0,
            clienteId: 'cliente-1',
            invoiceAssignments: [{ ventaId: 'venta-otra', nroFactura: 'F-OTRA', montoUsd: 0.0001 }],
          },
        })
      )

      const pagoInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO pagos'))
      expect(pagoInserts).toHaveLength(1) // el leg capeado a cero NUNCA inserta en pagos
      const pagoValidoId = pagoInserts[0]!.params[0] as string

      const movBancoInserts = calls.filter(
        (c) => c.sql.startsWith('INSERT INTO movimientos_bancarios') && !c.sql.startsWith('INSERT INTO movimientos_bancarios_pagos')
      )
      expect(movBancoInserts).toHaveLength(2) // Paso 8 SI crea 2 ingresos (comportamiento preexistente, sin cambios)

      const puenteInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_bancarios_pagos'))
      expect(puenteInserts).toHaveLength(1) // solo el leg valido genera puente
      expect(puenteInserts[0]!.params[2]).toBe(movBancoInserts[0]!.params[0]) // ingreso_id = el PRIMER ingreso (leg 0)
      expect(puenteInserts[0]!.params[3]).toBe(pagoValidoId)
      expect(puenteInserts[0]!.params[4]).toBe(toStorageString(10))
    })

    it('[regresion] las sentencias preexistentes de crearVenta (INSERT pagos, INSERT movimientos_bancarios, UPDATE bancos_empresa) mantienen su SQL/params exactos tras el wiring, y el puente nunca reordena nada', async () => {
      const calls = mockCrearVentaTx({
        ...pagoDirectoFixture(),
        metodosCobro: { 'metodo-transferencia': { banco_empresa_id: 'banco-1', deposito_directo: 1 } },
        bancosEmpresa: { 'banco-1': { saldo_actual: '0.00000000', moneda_id: 'moneda-usd' } },
      })

      await crearVenta(
        baseParams({
          sesion_caja_id: 'sesion-1',
          lineas: [linea({ producto_id: 'prod-1', cantidad: 3, precio_unitario_usd: 10 })],
          pagos: [pago({ metodo_cobro_id: 'metodo-transferencia', moneda: 'USD', monto: 30 })],
        })
      )

      const pagoInsert = calls.find((c) => c.sql.startsWith('INSERT INTO pagos'))
      expect(pagoInsert!.sql).toContain(
        'INSERT INTO pagos (id, venta_id, cliente_id, metodo_cobro_id, moneda_id, tasa, monto, monto_usd, referencia, sesion_caja_id, fecha, empresa_id, created_at, created_by, is_reversed)'
      )
      expect(pagoInsert!.params).toHaveLength(14)

      const movMetodoInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_metodo_cobro'))
      expect(movMetodoInsert).toBeDefined()

      const movBancoInsert = calls.find(
        (c) => c.sql.startsWith('INSERT INTO movimientos_bancarios') && !c.sql.startsWith('INSERT INTO movimientos_bancarios_pagos')
      )
      expect(movBancoInsert!.sql).toContain(
        "VALUES (?, ?, ?, 'INGRESO', 'TRANSFERENCIA_CLIENTE', ?, ?, ?, ?, 'VENTA', ?, 0, ?, ?, ?, ?)"
      )
      expect(movBancoInsert!.params).toHaveLength(12)

      const updateBancoCall = calls.find((c) => c.sql.startsWith('UPDATE bancos_empresa SET saldo_actual'))
      expect(updateBancoCall).toBeDefined()

      const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
      expect(kardexInsert).toBeDefined()

      // El puente (si existe) se inserta ESTRICTAMENTE despues del UPDATE
      // bancos_empresa — prueba de aditividad: ninguna sentencia preexistente
      // fue reordenada para insertar el puente.
      const updateBancoIdx = calls.indexOf(updateBancoCall!)
      const puenteIdx = calls.findIndex((c) => c.sql.startsWith('INSERT INTO movimientos_bancarios_pagos'))
      if (puenteIdx !== -1) {
        expect(puenteIdx).toBeGreaterThan(updateBancoIdx)
      }
    })
  })
})
