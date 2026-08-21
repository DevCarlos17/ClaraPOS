// Mockeamos `@/core/db/powersync/db` porque `aplicarAjuste`/`anularAjuste`
// usan `db.writeTransaction` a nivel de modulo — sin este mock, importar
// `use-ajustes.ts` construye una PowerSyncDatabase real y revienta con
// "Worker is not defined" en el entorno de test. Mismo patron que
// use-kardex.test.ts / use-agenda-config.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    writeTransaction: vi.fn(),
  },
}))

// `aplicarAjuste`/`anularAjuste` leen el ajuste/motivo y sus lineas via
// kysely ANTES de abrir la tx (`kysely.selectFrom(...).executeTakeFirst()` /
// `.execute()`). Mockeamos un builder encadenable minimo: cada metodo de
// filtrado retorna el mismo builder (`this`), y los dos metodos terminales
// (`executeTakeFirst`/`execute`) son los unicos que realmente resuelven un
// valor — se configuran por test.
vi.mock('@/core/db/kysely/kysely', () => {
  const builder = {
    selectFrom: vi.fn(),
    innerJoin: vi.fn(),
    select: vi.fn(),
    selectAll: vi.fn(),
    where: vi.fn(),
    executeTakeFirst: vi.fn(),
    execute: vi.fn(),
  }
  builder.selectFrom.mockReturnValue(builder)
  builder.innerJoin.mockReturnValue(builder)
  builder.select.mockReturnValue(builder)
  builder.selectAll.mockReturnValue(builder)
  builder.where.mockReturnValue(builder)
  return { kysely: builder }
})

import type { Transaction } from '@powersync/common'
import { db } from '@/core/db/powersync/db'
import { kysely } from '@/core/db/kysely/kysely'
import { aplicarAjuste, anularAjuste } from '../use-ajustes'

const mockedDb = vi.mocked(db, true)
const mockedKysely = vi.mocked(kysely, true) as unknown as {
  executeTakeFirst: ReturnType<typeof vi.fn>
  execute: ReturnType<typeof vi.fn>
}

interface Call {
  sql: string
  params: unknown[]
}

/** Ajuste + motivo (JOIN) tal como lo lee `aplicarAjuste`/`anularAjuste` via kysely. */
function mockAjusteConMotivo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aju-1',
    num_ajuste: '000001',
    status: 'BORRADOR',
    fecha: '2026-08-20',
    observaciones: null,
    nombre: 'Motivo Test',
    operacion_base: 'SUMA',
    afecta_costo: 0,
    // null = sin cuenta contable asociada: evita el bloque de gasto por linea
    // (costosEfectivos/tasa/cuenta/moneda), fuera del alcance de este test —
    // ya cubierto por otras suites de use-ajustes/gastos.
    cuentas_config_clave: null,
    ...overrides,
  }
}

function mockAjusteLinea(overrides: Record<string, unknown> = {}) {
  return {
    id: 'det-1',
    ajuste_id: 'aju-1',
    producto_id: 'prod-1',
    deposito_id: 'dep-X',
    cantidad: '8.000',
    costo_unitario: null,
    lote_id: null,
    lote_nro: null,
    lote_fecha_fab: null,
    lote_fecha_venc: null,
    created_at: '2026-08-20T10:00:00-04:00',
    created_by: 'user-1',
    ...overrides,
  }
}

/**
 * Simula la transaccion principal (`db.writeTransaction`) de
 * `aplicarAjuste`/`anularAjuste`. Captura toda escritura para las
 * aserciones — verifica que `upsertStockDeposito` escribe `inventario_stock`
 * en la MISMA transaccion que el INSERT de kardex, usando `linea.deposito_id`
 * (ya deposit-scoped desde el formulario, sin cambio de resolucion).
 */
function mockAjustesTx(opts: {
  stockPorProducto: Record<string, string>
  inventarioStockExistente?: { id: string; cantidad_actual: string }
  manejaLotes?: number
}) {
  const calls: Call[] = []
  mockedDb.writeTransaction.mockImplementation(async (callback) => {
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })

        if (sql.startsWith('SELECT stock FROM productos')) {
          const productoId = params[0] as string
          return { rows: { length: 1, item: () => ({ stock: opts.stockPorProducto[productoId] ?? '0.000' }) } }
        }
        if (sql.startsWith('SELECT id, cantidad_actual FROM inventario_stock')) {
          const row = opts.inventarioStockExistente
          return { rows: { length: row ? 1 : 0, item: () => row } }
        }
        // INSERT guardado (WHERE NOT EXISTS + RETURNING id) — simula insercion exitosa,
        // sin carrera (no hay otra escritura concurrente en estos tests).
        if (sql.startsWith('INSERT INTO inventario_stock')) {
          return { rows: { length: 1, item: () => ({ id: 'stock-insert-fake-id' }) } }
        }
        if (sql.startsWith('SELECT maneja_lotes FROM productos')) {
          return { rows: { length: 1, item: () => ({ maneja_lotes: opts.manejaLotes ?? 0 }) } }
        }
        if (sql.startsWith('SELECT lote_id FROM movimientos_inventario')) {
          return { rows: { length: 0, item: () => undefined } }
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

describe('aplicarAjuste — wiring de inventario_stock (Slice 1b, sin cambio de resolucion de deposito)', () => {
  it('operacion SUMA: upsertStockDeposito escribe inventario_stock DESPUES del INSERT de kardex, en la MISMA tx, con linea.deposito_id', async () => {
    mockedKysely.executeTakeFirst.mockResolvedValue(mockAjusteConMotivo({ operacion_base: 'SUMA' }))
    mockedKysely.execute.mockResolvedValue([
      mockAjusteLinea({ producto_id: 'prod-1', deposito_id: 'dep-X', cantidad: '8.000' }),
    ])
    const calls = mockAjustesTx({ stockPorProducto: { 'prod-1': '10.000' } })

    await aplicarAjuste('aju-1', 'emp-1', 'user-1')

    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInsert).toBeDefined()
    expect(kardexInsert!.sql).toContain("'E'") // tipo entrada, literal en la SQL (no parametrizado)

    const stockInsert = calls.find((c) => c.sql.startsWith('INSERT INTO inventario_stock'))
    expect(stockInsert).toBeDefined()
    expect(stockInsert!.params).toContain('8.000') // delta = cantidad sumada (baseline 0 en el mock)
    expect(stockInsert!.params).toContain('dep-X')
    expect(stockInsert!.params).toContain('prod-1')

    const productoUpdate = calls.find((c) => c.sql.startsWith('UPDATE productos SET stock'))
    expect(productoUpdate).toBeDefined()
    expect(productoUpdate!.params).toContain('18.000') // 10 (stock previo) + 8

    // Orden: el INSERT de kardex debe preceder al INSERT de inventario_stock — misma tx
    const kardexIdx = calls.indexOf(kardexInsert!)
    const stockIdx = calls.indexOf(stockInsert!)
    expect(kardexIdx).toBeLessThan(stockIdx)
  })

  it('operacion RESTA: upsertStockDeposito descuenta (delta negativo) sobre una fila de inventario_stock EXISTENTE (UPDATE), con linea.deposito_id', async () => {
    mockedKysely.executeTakeFirst.mockResolvedValue(mockAjusteConMotivo({ operacion_base: 'RESTA' }))
    mockedKysely.execute.mockResolvedValue([
      mockAjusteLinea({ producto_id: 'prod-2', deposito_id: 'dep-Y', cantidad: '3.000' }),
    ])
    const calls = mockAjustesTx({
      stockPorProducto: { 'prod-2': '10.000' },
      inventarioStockExistente: { id: 'stock-row-x', cantidad_actual: '10.000' },
      manejaLotes: 0,
    })

    await aplicarAjuste('aju-1', 'emp-1', 'user-1')

    const kardexInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInsert).toBeDefined()
    expect(kardexInsert!.sql).toContain("'S'") // tipo salida, literal en la SQL (no parametrizado)

    const stockUpdate = calls.find((c) => c.sql.startsWith('UPDATE inventario_stock'))
    expect(stockUpdate).toBeDefined()
    expect(stockUpdate!.params).toContain('7.000') // 10 - 3
    expect(stockUpdate!.params).toContain('stock-row-x')

    const productoUpdate = calls.find((c) => c.sql.startsWith('UPDATE productos SET stock'))
    expect(productoUpdate).toBeDefined()
    expect(productoUpdate!.params).toContain('7.000') // 10 - 3 (total tambien baja)

    const stockInsert = calls.find((c) => c.sql.startsWith('INSERT INTO inventario_stock'))
    expect(stockInsert).toBeUndefined()

    const kardexIdx = calls.indexOf(kardexInsert!)
    const stockIdx = calls.indexOf(stockUpdate!)
    expect(kardexIdx).toBeLessThan(stockIdx)
  })
})

describe('anularAjuste — wiring de inventario_stock (Slice 1b, sin cambio de resolucion de deposito)', () => {
  it('anular un ajuste SUMA (reversa = salida): upsertStockDeposito descuenta en la MISMA tx que el kardex inverso, con linea.deposito_id', async () => {
    mockedKysely.executeTakeFirst.mockResolvedValue(
      mockAjusteConMotivo({ status: 'APLICADO', operacion_base: 'SUMA' })
    )
    mockedKysely.execute.mockResolvedValue([
      mockAjusteLinea({ producto_id: 'prod-1', deposito_id: 'dep-X', cantidad: '8.000' }),
    ])
    const calls = mockAjustesTx({
      stockPorProducto: { 'prod-1': '18.000' },
      inventarioStockExistente: { id: 'stock-row-1', cantidad_actual: '18.000' },
    })

    await anularAjuste('aju-1', 'emp-1', 'user-1', 'Error de captura')

    // Reversa de SUMA = tipoInverso 'S' (salida)
    const kardexInverso = calls.find(
      (c) => c.sql.startsWith('INSERT INTO movimientos_inventario') && c.params.includes('S')
    )
    expect(kardexInverso).toBeDefined()

    const stockUpdate = calls.find((c) => c.sql.startsWith('UPDATE inventario_stock'))
    expect(stockUpdate).toBeDefined()
    expect(stockUpdate!.params).toContain('10.000') // 18 - 8
    expect(stockUpdate!.params).toContain('stock-row-1')

    const productoUpdate = calls.find((c) => c.sql.startsWith('UPDATE productos SET stock'))
    expect(productoUpdate).toBeDefined()
    expect(productoUpdate!.params).toContain('10.000')

    const kardexIdx = calls.indexOf(kardexInverso!)
    const stockIdx = calls.indexOf(stockUpdate!)
    expect(kardexIdx).toBeLessThan(stockIdx)
  })
})
