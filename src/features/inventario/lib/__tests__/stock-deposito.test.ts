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
  evaluarStockDepositoSuficiente,
  leerStockDeposito,
  upsertStockDeposito,
  agregarMovimientosPorDeposito,
  calcularStockDepositoDesdeKardex,
  recalcularStockDesdeKardex,
  resolveDepositoIngreso,
  resolverDepositoPrincipalActivo,
  registrarEntradasInicialesBatch,
  ejecutarStockInicialImport,
  type MovimientoParaRecalculo,
  type EntradaInicialImport,
} from '../stock-deposito'

const mockedDb = vi.mocked(db, true)

describe('resolveDepositoIngreso (Slice 1c — enrutamiento de ingreso)', () => {
  it('producto con deposito default: usa el deposito del producto, ignora el principal', () => {
    expect(resolveDepositoIngreso('dep-producto-A', 'dep-principal')).toBe('dep-producto-A')
  })

  it('producto sin deposito default (null): cae al deposito principal de la empresa', () => {
    expect(resolveDepositoIngreso(null, 'dep-principal')).toBe('dep-principal')
  })

  it('producto y principal ambos null: retorna null (el llamador debe manejarlo)', () => {
    expect(resolveDepositoIngreso(null, null)).toBeNull()
  })
})

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

describe('evaluarStockDepositoSuficiente (cierre de WARNING — decision compartida por los re-chequeos locales de ventas: producto directo e ingrediente de receta)', () => {
  it('stock del deposito mayor que lo solicitado: suficiente', () => {
    expect(evaluarStockDepositoSuficiente(new Decimal('10.000'), new Decimal('3'))).toBe(true)
  })

  it('stock del deposito exactamente igual a lo solicitado: suficiente (limite inclusivo)', () => {
    expect(evaluarStockDepositoSuficiente(new Decimal('5.000'), new Decimal('5'))).toBe(true)
  })

  it('stock del deposito menor que lo solicitado: insuficiente', () => {
    expect(evaluarStockDepositoSuficiente(new Decimal('1.000'), new Decimal('2'))).toBe(false)
  })

  it('stock del deposito en 0 (sin fila en inventario_stock): insuficiente para cualquier cantidad positiva', () => {
    expect(evaluarStockDepositoSuficiente(new Decimal('0'), new Decimal('0.001'))).toBe(false)
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

/**
 * Fake Transaction — captures every tx.execute(sql, params) call for assertions.
 *
 * `responses` describe SELECT sources por substring (comportamiento original, sin
 * cambios). Los INSERT/UPDATE no son fuentes de lectura — devuelven éxito por defecto
 * (1 fila, vía RETURNING/rows) salvo que un test los sobre-escriba con un fake tx propio
 * (ver el describe de "carrera" mas abajo, que necesita respuestas dependientes de la
 * secuencia de llamadas y no usa este helper).
 */
function createFakeTx(responses: Record<string, unknown[]>) {
  const calls: { sql: string; params: unknown[] }[] = []
  const tx = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (!sql.trimStart().startsWith('SELECT')) {
        return { rows: { length: 1, item: () => undefined }, rowsAffected: 1 }
      }
      const key = Object.keys(responses).find((k) => sql.includes(k))
      const rows = key ? responses[key]! : []
      return {
        rows: {
          length: rows.length,
          item: (i: number) => rows[i],
        },
        rowsAffected: rows.length,
      }
    }),
  } as unknown as Transaction
  return { tx, calls }
}

describe('leerStockDeposito (cierre de WARNING — lectura compartida por los re-chequeos locales de ventas)', () => {
  it('fila existente en inventario_stock: retorna cantidad_actual como Decimal', async () => {
    const { tx, calls } = createFakeTx({
      'FROM inventario_stock': [{ cantidad_actual: '7.500' }],
    })

    const result = await leerStockDeposito(tx, 'prod-1', 'dep-A', 'emp-1')

    expect(result.toFixed(3)).toBe('7.500')
    const readCall = calls.find((c) => c.sql.startsWith('SELECT cantidad_actual FROM inventario_stock'))
    expect(readCall).toBeDefined()
    expect(readCall!.params).toEqual(['prod-1', 'dep-A', 'emp-1'])
  })

  it('sin fila en inventario_stock para ese (producto,deposito): retorna 0 (mismo criterio de baseline que upsertStockDeposito)', async () => {
    const { tx } = createFakeTx({ 'FROM inventario_stock': [] })

    const result = await leerStockDeposito(tx, 'prod-1', 'dep-A', 'emp-1')

    expect(result.toFixed(3)).toBe('0.000')
  })

  it('filtra por empresa_id en el WHERE (aislamiento multi-tenant, consistente con upsertStockDeposito)', async () => {
    const { tx, calls } = createFakeTx({
      'FROM inventario_stock': [{ cantidad_actual: '3.000' }],
    })

    await leerStockDeposito(tx, 'prod-1', 'dep-A', 'emp-2')

    const readCall = calls.find((c) => c.sql.startsWith('SELECT cantidad_actual FROM inventario_stock'))
    expect(readCall!.sql).toContain('empresa_id = ?')
    expect(readCall!.params).toEqual(['prod-1', 'dep-A', 'emp-2'])
  })
})

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

  describe('escritura local idempotente contra una carrera (PART 2 — defensa en profundidad del fix de 23505 uq_stock_empresa_producto_deposito en el connector)', () => {
    it('el INSERT guardado (WHERE NOT EXISTS) no inserta porque otra escritura ya creo la fila entre el SELECT inicial y este INSERT: NO crea una segunda fila, hace fallback SELECT+UPDATE aplicando el delta sobre el valor REAL recien observado (no sobre el baseline de kardex de la lectura inicial)', async () => {
      const calls: { sql: string; params: unknown[] }[] = []
      let selectStockCalls = 0

      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })
          const trimmed = sql.trimStart()

          if (trimmed.startsWith('SELECT id, cantidad_actual FROM inventario_stock')) {
            selectStockCalls++
            if (selectStockCalls === 1) {
              // Lectura inicial: sin fila propia todavia (dispara reconstruccion de
              // baseline via kardex y, luego, el INSERT guardado).
              return { rows: { length: 0, item: () => undefined }, rowsAffected: 0 }
            }
            // Fallback tras el INSERT guardado devolver 0 filas: otra tx ya inserto
            // la fila con este valor — la relectura debe verla.
            return {
              rows: { length: 1, item: () => ({ id: 'fila-ganadora-otra-tx', cantidad_actual: '12.000' }) },
              rowsAffected: 1,
            }
          }
          if (trimmed.startsWith('SELECT producto_id, deposito_id, tipo, cantidad FROM movimientos_inventario')) {
            // Sin historial de kardex relevante — el baseline reconstruido (irrelevante,
            // se descarta en la rama de carrera) seria 0.
            return { rows: { length: 0, item: () => undefined }, rowsAffected: 0 }
          }
          if (trimmed.startsWith('INSERT INTO inventario_stock')) {
            // WHERE NOT EXISTS no inserto nada: la fila ya existe (carrera simulada).
            return { rows: { length: 0, item: () => undefined }, rowsAffected: 0 }
          }
          if (trimmed.startsWith('UPDATE inventario_stock')) {
            return { rows: { length: 0, item: () => undefined }, rowsAffected: 1 }
          }
          if (trimmed.startsWith('SELECT stock FROM productos')) {
            return { rows: { length: 1, item: () => ({ stock: '40.000' }) }, rowsAffected: 0 }
          }
          if (trimmed.startsWith('UPDATE productos')) {
            return { rows: { length: 0, item: () => undefined }, rowsAffected: 1 }
          }
          throw new Error(`SQL no mockeado en el fake tx de carrera: ${sql}`)
        }),
      } as unknown as Transaction

      const result = await upsertStockDeposito(tx, {
        empresa_id: 'emp-1',
        producto_id: 'prod-1',
        deposito_id: 'dep-A',
        delta: new Decimal('3.000'),
        usuario_id: 'user-1',
        now: '2026-08-20T10:00:00-04:00',
        movimientoInventarioId: 'mov-race-1',
      })

      // Delta aplicado sobre el valor REAL observado en el fallback (12.000 + 3.000),
      // NO sobre el baseline reconstruido de kardex de la lectura inicial (0 + 3.000 = 3.000
      // hubiera sido el resultado incorrecto si se ignorara la carrera).
      expect(result.stockDepositoNuevo.toFixed(3)).toBe('15.000')
      expect(result.stockTotalNuevo.toFixed(3)).toBe('43.000')

      const insertCalls = calls.filter((c) => c.sql.trimStart().startsWith('INSERT INTO inventario_stock'))
      expect(insertCalls).toHaveLength(1) // Nunca reintenta el INSERT ni crea una segunda fila

      const updateStockCalls = calls.filter((c) => c.sql.trimStart().startsWith('UPDATE inventario_stock'))
      expect(updateStockCalls).toHaveLength(1)
      expect(updateStockCalls[0]!.params).toContain('15.000')
      expect(updateStockCalls[0]!.params).toContain('fila-ganadora-otra-tx')
    })

    it('INSERT guardado inserta normalmente (sin carrera): NO ejecuta el fallback SELECT+UPDATE de reconciliacion', async () => {
      const { tx, calls } = createFakeTx({
        'FROM inventario_stock': [],
        'FROM movimientos_inventario': [],
        'FROM productos': [{ stock: '10.000' }],
      })

      await upsertStockDeposito(tx, {
        empresa_id: 'emp-1',
        producto_id: 'prod-1',
        deposito_id: 'dep-A',
        delta: new Decimal('5.000'),
        usuario_id: 'user-1',
        now: '2026-08-20T10:00:00-04:00',
        movimientoInventarioId: 'mov-no-race',
      })

      // Solo el SELECT inicial (que resuelve "sin fila") ejecuta contra
      // 'SELECT id, cantidad_actual FROM inventario_stock' — el fallback de carrera
      // agregaria una SEGUNDA llamada con ese mismo prefijo.
      const stockReadCalls = calls.filter((c) =>
        c.sql.trimStart().startsWith('SELECT id, cantidad_actual FROM inventario_stock')
      )
      expect(stockReadCalls).toHaveLength(1)
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

describe('resolverDepositoPrincipalActivo (PR1 — batch de stock inicial de import)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hay deposito es_principal=1 activo: retorna su id sin consultar el fallback', async () => {
    mockedDb.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('es_principal = 1')) {
        return { rows: { length: 1, item: () => ({ id: 'dep-principal' }) } } as never
      }
      throw new Error('no deberia consultar el fallback cuando hay principal activo')
    })

    const result = await resolverDepositoPrincipalActivo('emp-1')

    expect(result).toBe('dep-principal')
  })

  it('sin principal activo pero con otro deposito activo: retorna el fallback (primer activo)', async () => {
    mockedDb.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('es_principal = 1')) {
        return { rows: { length: 0, item: () => undefined } } as never
      }
      return { rows: { length: 1, item: () => ({ id: 'dep-fallback' }) } } as never
    })

    const result = await resolverDepositoPrincipalActivo('emp-1')

    expect(result).toBe('dep-fallback')
  })

  it('sin depositos activos (ni principal ni fallback): retorna null', async () => {
    mockedDb.execute.mockResolvedValue({ rows: { length: 0, item: () => undefined } } as never)

    const result = await resolverDepositoPrincipalActivo('emp-1')

    expect(result).toBeNull()
  })
})

describe('registrarEntradasInicialesBatch (PR1 — reemplaza el loop de N `registrarMovimiento` por 1 sola writeTransaction)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function entrada(overrides: Partial<EntradaInicialImport> = {}): EntradaInicialImport {
    return { producto_id: 'prod-default', cantidad: 1, deposito_id: 'dep-A', ...overrides }
  }

  /**
   * Fake tx para el batch: responde a las queries internas de `upsertStockDeposito`
   * (SELECT/INSERT/UPDATE inventario_stock, SELECT/UPDATE productos, SELECT kardex
   * para baseline) ademas del INSERT de `movimientos_inventario` del batch mismo.
   * Mismo patron que `mockAjustesTx` en use-ajustes.test.ts.
   */
  function mockBatchTx(
    opts: { stockPorProducto?: Record<string, string>; failOnProductoId?: string } = {}
  ) {
    const calls: { sql: string; params: unknown[] }[] = []
    mockedDb.writeTransaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })

          if (
            opts.failOnProductoId &&
            sql.startsWith('INSERT INTO movimientos_inventario') &&
            params.includes(opts.failOnProductoId)
          ) {
            throw new Error(`fallo simulado al insertar movimiento de ${opts.failOnProductoId}`)
          }
          if (sql.startsWith('SELECT stock FROM productos')) {
            const productoId = params[0] as string
            return { rows: { length: 1, item: () => ({ stock: opts.stockPorProducto?.[productoId] ?? '0.000' }) } }
          }
          if (sql.startsWith('SELECT id, cantidad_actual FROM inventario_stock')) {
            return { rows: { length: 0, item: () => undefined } }
          }
          if (sql.startsWith('INSERT INTO inventario_stock')) {
            return { rows: { length: 1, item: () => ({ id: 'stock-insert-fake-id' }) } }
          }
          if (sql.includes('FROM movimientos_inventario') && sql.trimStart().startsWith('SELECT')) {
            return { rows: { length: 0, item: () => undefined } }
          }
          return { rows: { length: 0, item: () => undefined }, rowsAffected: 1 }
        }),
      } as unknown as Transaction
      return callback(tx)
    })
    return calls
  }

  it('SC1: 5 entradas con stock_inicial>0 -> UN solo db.writeTransaction, 5 filas insertadas en movimientos_inventario', async () => {
    const calls = mockBatchTx()
    const entradas = Array.from({ length: 5 }, (_, i) => entrada({ producto_id: `prod-${i}` }))

    const result = await registrarEntradasInicialesBatch({
      entradas,
      usuario_id: 'user-1',
      empresa_id: 'emp-1',
    })

    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)
    const inserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(inserts).toHaveLength(5)
    expect(result.exitosos).toBe(5)
  })

  it('SC2: forma de fila (tipo=E, origen=MAN, stock_anterior=0.000) y precision de 3 decimales (cantidad=12.5 -> 12.500), sin lote_id/tipo_salida', async () => {
    const calls = mockBatchTx()

    await registrarEntradasInicialesBatch({
      entradas: [entrada({ producto_id: 'prod-1', cantidad: 12.5 })],
      usuario_id: 'user-1',
      empresa_id: 'emp-1',
    })

    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(insert).toBeDefined()
    expect(insert!.sql).toContain("'E'")
    expect(insert!.sql).toContain("'MAN'")
    expect(insert!.sql).toContain("'0.000'")
    expect(insert!.params).toEqual([
      expect.any(String), // id
      'prod-1',
      'dep-A',
      '12.500', // cantidad
      '12.500', // stock_nuevo (stock_anterior siempre 0.000 -> stock_nuevo = cantidad)
      'INVENTARIO INICIAL',
      'user-1',
      expect.any(String), // fecha
      'emp-1',
      expect.any(String), // created_at
    ])
  })

  it('SC3: upsertStockDeposito actualiza inventario_stock y productos.stock para un producto nuevo sin fila previa', async () => {
    const calls = mockBatchTx({ stockPorProducto: { 'prod-1': '0.000' } })

    await registrarEntradasInicialesBatch({
      entradas: [entrada({ producto_id: 'prod-1', cantidad: 12.5 })],
      usuario_id: 'user-1',
      empresa_id: 'emp-1',
    })

    const stockInsert = calls.find((c) => c.sql.startsWith('INSERT INTO inventario_stock'))
    expect(stockInsert).toBeDefined()
    expect(stockInsert!.params).toContain('12.500')
    expect(stockInsert!.params).toContain('prod-1')
    expect(stockInsert!.params).toContain('dep-A')

    const productoUpdate = calls.find((c) => c.sql.startsWith('UPDATE productos SET stock'))
    expect(productoUpdate).toBeDefined()
    expect(productoUpdate!.params).toContain('12.500')
  })

  it('SC4: cada fila insertada lleva el empresa_id del usuario actual (multi-tenant)', async () => {
    const calls = mockBatchTx()

    await registrarEntradasInicialesBatch({
      entradas: [entrada({ producto_id: 'prod-1' }), entrada({ producto_id: 'prod-2' })],
      usuario_id: 'user-1',
      empresa_id: 'emp-xyz',
    })

    const inserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(inserts).toHaveLength(2)
    for (const insert of inserts) {
      expect(insert.params).toContain('emp-xyz')
    }
  })

  it('SC7: si la entrada #3 de 5 lanza, la promesa del batch rechaza y las entradas #4-5 no se procesan (todo-o-nada)', async () => {
    const calls = mockBatchTx({ failOnProductoId: 'prod-3' })
    const entradas = Array.from({ length: 5 }, (_, i) => entrada({ producto_id: `prod-${i + 1}` }))

    await expect(
      registrarEntradasInicialesBatch({ entradas, usuario_id: 'user-1', empresa_id: 'emp-1' })
    ).rejects.toThrow(/fallo simulado/)

    const inserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    // entradas 1 y 2 se insertan; la #3 se intenta y lanza; #4 y #5 nunca se procesan
    expect(inserts).toHaveLength(3)
  })

  it('SC20a (PR3b): cada entrada usa SU PROPIO deposito_id (no uno global) dentro de la MISMA writeTransaction', async () => {
    const calls = mockBatchTx()

    await registrarEntradasInicialesBatch({
      entradas: [
        entrada({ producto_id: 'prod-1', deposito_id: 'dep-X' }),
        entrada({ producto_id: 'prod-2', deposito_id: 'dep-Y' }),
      ],
      usuario_id: 'user-1',
      empresa_id: 'emp-1',
    })

    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)
    const inserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(inserts.find((c) => c.params[1] === 'prod-1')!.params[2]).toBe('dep-X')
    expect(inserts.find((c) => c.params[1] === 'prod-2')!.params[2]).toBe('dep-Y')
  })

  it('lanza si una entrada llega SIN deposito_id resuelto (invariante: el caller — ejecutarStockInicialImport o el modal — debe resolverlo antes de llamar a este helper)', async () => {
    mockBatchTx()
    const entradas: EntradaInicialImport[] = [{ producto_id: 'prod-1', cantidad: 1 }]

    await expect(
      registrarEntradasInicialesBatch({ entradas, usuario_id: 'user-1', empresa_id: 'emp-1' })
    ).rejects.toThrow(/deposito_id/)
  })
})

describe('ejecutarStockInicialImport (PR1 — orquesta resolucion de deposito + batch)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockBatchTxSimple() {
    const calls: { sql: string; params: unknown[] }[] = []
    mockedDb.writeTransaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })
          if (sql.startsWith('SELECT stock FROM productos')) {
            return { rows: { length: 1, item: () => ({ stock: '0.000' }) } }
          }
          if (sql.startsWith('SELECT id, cantidad_actual FROM inventario_stock')) {
            return { rows: { length: 0, item: () => undefined } }
          }
          if (sql.startsWith('INSERT INTO inventario_stock')) {
            return { rows: { length: 1, item: () => ({ id: 'stock-insert-fake-id' }) } }
          }
          if (sql.includes('FROM movimientos_inventario') && sql.trimStart().startsWith('SELECT')) {
            return { rows: { length: 0, item: () => undefined } }
          }
          return { rows: { length: 0, item: () => undefined }, rowsAffected: 1 }
        }),
      } as unknown as Transaction
      return callback(tx)
    })
    return calls
  }

  it('SC5: resuelve el deposito UNA sola vez para 100 entradas, y todas las filas usan el mismo deposito_id', async () => {
    mockedDb.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('es_principal = 1')) {
        return { rows: { length: 1, item: () => ({ id: 'dep-unico' }) } } as never
      }
      throw new Error('no deberia consultar el fallback cuando hay principal activo')
    })
    const calls = mockBatchTxSimple()
    const entradas: EntradaInicialImport[] = Array.from({ length: 100 }, (_, i) => ({
      producto_id: `prod-${i}`,
      cantidad: 1,
    }))

    const result = await ejecutarStockInicialImport({ entradas, empresa_id: 'emp-1', usuario_id: 'user-1' })

    expect(mockedDb.execute).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ exitosos: 100, sinDeposito: false })
    const depositoIdsUsados = new Set(
      calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_inventario')).map((c) => c.params[2])
    )
    expect(depositoIdsUsados).toEqual(new Set(['dep-unico']))
  })

  it('SC6: empresa sin depositos activos -> retorna {exitosos:0, sinDeposito:true} y db.writeTransaction nunca se invoca', async () => {
    mockedDb.execute.mockResolvedValue({ rows: { length: 0, item: () => undefined } } as never)

    const result = await ejecutarStockInicialImport({
      entradas: [{ producto_id: 'prod-1', cantidad: 5 }],
      empresa_id: 'emp-1',
      usuario_id: 'user-1',
    })

    expect(result).toEqual({ exitosos: 0, sinDeposito: true })
    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()
  })

  it('SC20 (PR3b): 3 entradas con deposito_id explicito distinto + 2 sin deposito_id -> las 3 usan su deposito explicito y las 2 usan el principal resuelto UNA sola vez', async () => {
    mockedDb.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('es_principal = 1')) {
        return { rows: { length: 1, item: () => ({ id: 'dep-principal' }) } } as never
      }
      throw new Error('no deberia consultar el fallback cuando hay principal activo')
    })
    const calls = mockBatchTxSimple()
    const entradas: EntradaInicialImport[] = [
      { producto_id: 'prod-1', cantidad: 1, deposito_id: 'dep-X' },
      { producto_id: 'prod-2', cantidad: 1, deposito_id: 'dep-Y' },
      { producto_id: 'prod-3', cantidad: 1, deposito_id: 'dep-Z' },
      { producto_id: 'prod-4', cantidad: 1 },
      { producto_id: 'prod-5', cantidad: 1 },
    ]

    const result = await ejecutarStockInicialImport({ entradas, empresa_id: 'emp-1', usuario_id: 'user-1' })

    // resolverDepositoPrincipalActivo se llama 1 sola vez (no 1 por cada entrada sin deposito_id)
    expect(mockedDb.execute).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ exitosos: 5, sinDeposito: false })

    const inserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    const depositoPorProducto = new Map(inserts.map((c) => [c.params[1] as string, c.params[2] as string]))
    expect(depositoPorProducto.get('prod-1')).toBe('dep-X')
    expect(depositoPorProducto.get('prod-2')).toBe('dep-Y')
    expect(depositoPorProducto.get('prod-3')).toBe('dep-Z')
    expect(depositoPorProducto.get('prod-4')).toBe('dep-principal')
    expect(depositoPorProducto.get('prod-5')).toBe('dep-principal')
  })

  it('SC21 (contrato): entradas sin campo deposito_id en NINGUNA -> el fallback de principal se aplica a TODAS (documenta que este helper no filtra ACTUALIZAR — responsabilidad exclusiva del caller no incluirlas)', async () => {
    mockedDb.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('es_principal = 1')) {
        return { rows: { length: 1, item: () => ({ id: 'dep-unico' }) } } as never
      }
      throw new Error('no deberia consultar el fallback cuando hay principal activo')
    })
    const calls = mockBatchTxSimple()

    await ejecutarStockInicialImport({
      entradas: [{ producto_id: 'prod-1', cantidad: 1 }],
      empresa_id: 'emp-1',
      usuario_id: 'user-1',
    })

    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(insert!.params[2]).toBe('dep-unico')
  })
})
