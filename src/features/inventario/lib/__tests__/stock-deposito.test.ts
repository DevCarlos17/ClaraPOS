// Mockeamos `@/core/db/powersync/db` porque `recalcularStockDesdeKardex` lo
// usa a nivel de modulo (db.execute + db.writeTransaction) — sin este mock,
// importar `stock-deposito.ts` construye una PowerSyncDatabase real (falla
// con "Worker is not defined" en el entorno de test, sin instancia wa-sqlite).
// Mismo patron que use-agenda-config.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    execute: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))

import Decimal from 'decimal.js'
import type { Transaction } from '@powersync/common'
import { db } from '@/core/db/powersync/db'
import {
  computeStockDelta,
  upsertStockDeposito,
  agregarMovimientosPorDeposito,
  calcularStockDepositoDesdeKardex,
  recalcularStockDesdeKardex,
  type MovimientoParaRecalculo,
} from '../stock-deposito'

const mockedDb = vi.mocked(db, true)

describe('computeStockDelta', () => {
  it('entrada (delta positivo): suma exacta sin drift de punto flotante (0.125 + 0.125 = 0.250)', () => {
    const result = computeStockDelta(new Decimal('0.125'), new Decimal('0.125'))
    expect(result.toFixed(3)).toBe('0.250')
  })

  it('salida (delta negativo) que deja stock positivo: resta correctamente', () => {
    const result = computeStockDelta(new Decimal('10'), new Decimal('-3'))
    expect(result.toFixed(3)).toBe('7.000')
  })

  it('salida que deja stock exactamente en cero: permitido (no negativo)', () => {
    const result = computeStockDelta(new Decimal('5'), new Decimal('-5'))
    expect(result.toFixed(3)).toBe('0.000')
  })

  it('salida que dejaria stock negativo: lanza error y NO retorna', () => {
    expect(() => computeStockDelta(new Decimal('2'), new Decimal('-3'))).toThrow(/insuficiente/i)
  })
})

describe('agregarMovimientosPorDeposito', () => {
  function mov(overrides: Partial<MovimientoParaRecalculo> = {}): MovimientoParaRecalculo {
    return {
      producto_id: 'prod-1',
      deposito_id: 'dep-A',
      tipo: 'E',
      cantidad: '1.000',
      ...overrides,
    }
  }

  it('array vacio: retorna []', () => {
    expect(agregarMovimientosPorDeposito([])).toEqual([])
  })

  it('entradas y salidas mixtas del mismo producto/deposito: neto correcto', () => {
    const result = agregarMovimientosPorDeposito([
      mov({ tipo: 'E', cantidad: '10.000' }),
      mov({ tipo: 'S', cantidad: '3.000' }),
      mov({ tipo: 'E', cantidad: '2.000' }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.producto_id).toBe('prod-1')
    expect(result[0]!.deposito_id).toBe('dep-A')
    expect(result[0]!.cantidad.toFixed(3)).toBe('9.000')
  })

  it('mismo producto en 2 depositos distintos: agrupa por (producto,deposito) por separado', () => {
    const result = agregarMovimientosPorDeposito([
      mov({ deposito_id: 'dep-A', tipo: 'E', cantidad: '10.000' }),
      mov({ deposito_id: 'dep-B', tipo: 'E', cantidad: '5.000' }),
      mov({ deposito_id: 'dep-B', tipo: 'S', cantidad: '2.000' }),
    ])
    expect(result).toHaveLength(2)
    const depA = result.find((r) => r.deposito_id === 'dep-A')
    const depB = result.find((r) => r.deposito_id === 'dep-B')
    expect(depA?.cantidad.toFixed(3)).toBe('10.000')
    expect(depB?.cantidad.toFixed(3)).toBe('3.000')
  })
})

describe('calcularStockDepositoDesdeKardex (Correction 2 — reconstruye baseline de UN (producto,deposito) desde kardex)', () => {
  function mov(overrides: Partial<MovimientoParaRecalculo> = {}): MovimientoParaRecalculo {
    return {
      producto_id: 'prod-1',
      deposito_id: 'dep-A',
      tipo: 'E',
      cantidad: '1.000',
      ...overrides,
    }
  }

  it('sin movimientos: retorna 0', () => {
    const result = calcularStockDepositoDesdeKardex([], 'prod-1', 'dep-A')
    expect(result.toFixed(3)).toBe('0.000')
  })

  it('suma solo las filas del (producto,deposito) exacto, ignora otras combinaciones presentes en el listado', () => {
    const result = calcularStockDepositoDesdeKardex(
      [
        mov({ producto_id: 'prod-1', deposito_id: 'dep-A', tipo: 'E', cantidad: '10.000' }),
        mov({ producto_id: 'prod-1', deposito_id: 'dep-A', tipo: 'S', cantidad: '3.000' }),
        // Ruido: mismo producto, OTRO deposito — debe ignorarse
        mov({ producto_id: 'prod-1', deposito_id: 'dep-B', tipo: 'E', cantidad: '999.000' }),
        // Ruido: OTRO producto, mismo deposito — debe ignorarse
        mov({ producto_id: 'prod-2', deposito_id: 'dep-A', tipo: 'E', cantidad: '999.000' }),
      ],
      'prod-1',
      'dep-A'
    )
    expect(result.toFixed(3)).toBe('7.000')
  })

  it('entrada suma (E) y salida resta (S) — signos correctos', () => {
    const result = calcularStockDepositoDesdeKardex(
      [mov({ tipo: 'E', cantidad: '5.000' }), mov({ tipo: 'S', cantidad: '5.000' })],
      'prod-1',
      'dep-A'
    )
    expect(result.toFixed(3)).toBe('0.000')
  })
})

/** Fake Transaction — captures every tx.execute(sql, params) call for assertions. */
function createFakeTx(responses: Record<string, unknown[]>) {
  const calls: { sql: string; params: unknown[] }[] = []
  const tx = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      const key = Object.keys(responses).find((k) => sql.includes(k))
      const rows = key ? responses[key]! : []
      return {
        rows: {
          length: rows.length,
          item: (i: number) => rows[i],
        },
      }
    }),
  } as unknown as Transaction
  return { tx, calls }
}

describe('upsertStockDeposito', () => {
  it('sin fila previa en inventario_stock Y sin historial de kardex para ese par: baseline reconstruido es 0 (equivalente al comportamiento previo cuando no hay historia)', async () => {
    const { tx, calls } = createFakeTx({
      'FROM inventario_stock': [],
      'FROM movimientos_inventario': [],
      'FROM productos': [{ stock: '5.000' }],
    })

    const result = await upsertStockDeposito(tx, {
      empresa_id: 'emp-1',
      producto_id: 'prod-1',
      deposito_id: 'dep-A',
      delta: new Decimal('4.000'),
      usuario_id: 'user-1',
      now: '2026-08-19T10:00:00-04:00',
      movimientoInventarioId: 'mov-actual-1',
    })

    expect(result.stockDepositoNuevo.toFixed(3)).toBe('4.000')
    expect(result.stockTotalNuevo.toFixed(3)).toBe('9.000')

    const insertCall = calls.find((c) => c.sql.startsWith('INSERT INTO inventario_stock'))
    expect(insertCall).toBeDefined()
    expect(insertCall!.params).toContain('4.000')

    const updateProductoCall = calls.find((c) => c.sql.startsWith('UPDATE productos'))
    expect(updateProductoCall).toBeDefined()
    expect(updateProductoCall!.params).toContain('9.000')
  })

  it('con fila previa en inventario_stock: hace UPDATE acumulando el delta sobre la cantidad existente (NO consulta kardex)', async () => {
    const { tx, calls } = createFakeTx({
      'FROM inventario_stock': [{ id: 'stock-row-1', cantidad_actual: '10.000' }],
      'FROM productos': [{ stock: '25.000' }],
    })

    const result = await upsertStockDeposito(tx, {
      empresa_id: 'emp-1',
      producto_id: 'prod-1',
      deposito_id: 'dep-A',
      delta: new Decimal('-6.000'),
      usuario_id: 'user-1',
      now: '2026-08-19T10:00:00-04:00',
      movimientoInventarioId: 'mov-actual-2',
    })

    expect(result.stockDepositoNuevo.toFixed(3)).toBe('4.000')
    expect(result.stockTotalNuevo.toFixed(3)).toBe('19.000')

    const updateStockCall = calls.find((c) => c.sql.startsWith('UPDATE inventario_stock'))
    expect(updateStockCall).toBeDefined()
    expect(updateStockCall!.params).toContain('4.000')
    expect(updateStockCall!.params).toContain('stock-row-1')

    const kardexQuery = calls.find((c) => c.sql.includes('FROM movimientos_inventario'))
    expect(kardexQuery).toBeUndefined()
  })

  it('delta que dejaria el deposito en negativo (fila existente): lanza y no ejecuta ningun INSERT/UPDATE sobre inventario_stock', async () => {
    const { tx, calls } = createFakeTx({
      'FROM inventario_stock': [{ id: 'stock-row-1', cantidad_actual: '2.000' }],
      'FROM productos': [{ stock: '50.000' }],
    })

    await expect(
      upsertStockDeposito(tx, {
        empresa_id: 'emp-1',
        producto_id: 'prod-1',
        deposito_id: 'dep-A',
        delta: new Decimal('-3.000'),
        usuario_id: 'user-1',
        now: '2026-08-19T10:00:00-04:00',
        movimientoInventarioId: 'mov-actual-3',
      })
    ).rejects.toThrow(/insuficiente/i)

    const mutatingCalls = calls.filter(
      (c) => c.sql.startsWith('INSERT INTO inventario_stock') || c.sql.startsWith('UPDATE inventario_stock')
    )
    expect(mutatingCalls).toHaveLength(0)
  })

  describe('fila ausente en inventario_stock CON historial de kardex (Correction 2 — legacy-zero-baseline hazard)', () => {
    it('reconstruye el baseline sumando el kardex del (producto,deposito), EXCLUYENDO el movimiento actual por id, y aplica el delta sobre ese baseline (10 - 3 = 7, no bloqueado)', async () => {
      const { tx, calls } = createFakeTx({
        'FROM inventario_stock': [],
        'FROM movimientos_inventario': [
          { producto_id: 'prod-1', deposito_id: 'dep-A', tipo: 'E', cantidad: '10.000' },
        ],
        'FROM productos': [{ stock: '40.000' }],
      })

      const result = await upsertStockDeposito(tx, {
        empresa_id: 'emp-1',
        producto_id: 'prod-1',
        deposito_id: 'dep-A',
        delta: new Decimal('-3.000'),
        usuario_id: 'user-1',
        now: '2026-08-19T10:00:00-04:00',
        movimientoInventarioId: 'mov-actual-id',
      })

      expect(result.stockDepositoNuevo.toFixed(3)).toBe('7.000')

      const kardexCall = calls.find((c) => c.sql.includes('FROM movimientos_inventario'))
      expect(kardexCall).toBeDefined()
      // La exclusion por id es lo que evita contar dos veces el movimiento que esta
      // liquidando esta misma llamada (ya insertado en la MISMA tx, antes de esta
      // llamada, por convencion en todos los write-paths).
      expect(kardexCall!.sql).toContain('id !=')
      expect(kardexCall!.params).toContain('mov-actual-id')

      const insertCall = calls.find((c) => c.sql.startsWith('INSERT INTO inventario_stock'))
      expect(insertCall!.params).toContain('7.000')
    })

    it('fila ausente + baseline de kardex insuficiente para el delta: lanza correctamente (2 - 3 < 0)', async () => {
      const { tx, calls } = createFakeTx({
        'FROM inventario_stock': [],
        'FROM movimientos_inventario': [
          { producto_id: 'prod-1', deposito_id: 'dep-A', tipo: 'E', cantidad: '2.000' },
        ],
        'FROM productos': [{ stock: '40.000' }],
      })

      await expect(
        upsertStockDeposito(tx, {
          empresa_id: 'emp-1',
          producto_id: 'prod-1',
          deposito_id: 'dep-A',
          delta: new Decimal('-3.000'),
          usuario_id: 'user-1',
          now: '2026-08-19T10:00:00-04:00',
          movimientoInventarioId: 'mov-actual-id',
        })
      ).rejects.toThrow(/insuficiente/i)

      const mutatingCalls = calls.filter(
        (c) => c.sql.startsWith('INSERT INTO inventario_stock') || c.sql.startsWith('UPDATE inventario_stock')
      )
      expect(mutatingCalls).toHaveLength(0)
    })

    it('entrada (delta positivo) sobre fila ausente con historial de kardex: reconstruye y suma (5 + 2 = 7)', async () => {
      const { tx } = createFakeTx({
        'FROM inventario_stock': [],
        'FROM movimientos_inventario': [
          { producto_id: 'prod-1', deposito_id: 'dep-A', tipo: 'E', cantidad: '8.000' },
          { producto_id: 'prod-1', deposito_id: 'dep-A', tipo: 'S', cantidad: '3.000' },
        ],
        'FROM productos': [{ stock: '40.000' }],
      })

      const result = await upsertStockDeposito(tx, {
        empresa_id: 'emp-1',
        producto_id: 'prod-1',
        deposito_id: 'dep-A',
        delta: new Decimal('2.000'),
        usuario_id: 'user-1',
        now: '2026-08-19T10:00:00-04:00',
        movimientoInventarioId: 'mov-actual-id',
      })

      expect(result.stockDepositoNuevo.toFixed(3)).toBe('7.000')
    })
  })
})

describe('recalcularStockDesdeKardex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reconstruye inventario_stock desde kardex mixto E/S en 2 depositos, coincide exactamente', async () => {
    const movimientos = [
      { producto_id: 'prod-1', deposito_id: 'dep-A', tipo: 'E', cantidad: '20.000' },
      { producto_id: 'prod-1', deposito_id: 'dep-A', tipo: 'S', cantidad: '5.000' },
      { producto_id: 'prod-1', deposito_id: 'dep-B', tipo: 'E', cantidad: '8.000' },
    ]
    mockedDb.execute.mockResolvedValue({
      rows: { length: movimientos.length, item: (i: number) => movimientos[i] },
    } as never)

    const writes: { sql: string; params: unknown[] }[] = []
    mockedDb.writeTransaction.mockImplementation(async (callback) => {
      const fakeTx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          writes.push({ sql, params })
          // Simula que ninguna fila de inventario_stock existe todavia (caso repair total)
          if (sql.startsWith('SELECT id FROM inventario_stock')) {
            return { rows: { length: 0, item: () => undefined } }
          }
          return { rows: { length: 0, item: () => undefined } }
        }),
      } as unknown as Transaction
      return callback(fakeTx)
    })

    await recalcularStockDesdeKardex({ empresa_id: 'emp-1' })

    const insertDepA = writes.find(
      (w) => w.sql.startsWith('INSERT INTO inventario_stock') && w.params.includes('dep-A')
    )
    const insertDepB = writes.find(
      (w) => w.sql.startsWith('INSERT INTO inventario_stock') && w.params.includes('dep-B')
    )
    expect(insertDepA?.params).toContain('15.000')
    expect(insertDepB?.params).toContain('8.000')

    const updateProducto = writes.find((w) => w.sql.startsWith('UPDATE productos'))
    expect(updateProducto?.params).toContain('23.000')
  })

  it('sin movimientos: no escribe nada en inventario_stock ni en productos', async () => {
    mockedDb.execute.mockResolvedValue({
      rows: { length: 0, item: () => undefined },
    } as never)

    const writes: { sql: string }[] = []
    mockedDb.writeTransaction.mockImplementation(async (callback) => {
      const fakeTx = {
        execute: vi.fn(async (sql: string) => {
          writes.push({ sql })
          return { rows: { length: 0, item: () => undefined } }
        }),
      } as unknown as Transaction
      return callback(fakeTx)
    })

    await recalcularStockDesdeKardex({ empresa_id: 'emp-1', producto_id: 'prod-sin-movimientos' })

    expect(writes).toHaveLength(0)
  })
})
