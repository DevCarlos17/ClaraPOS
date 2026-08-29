// Mockeamos `@/core/db/powersync/db` porque `crearTraspaso` usa
// `db.writeTransaction` a nivel de modulo — sin este mock, importar
// `use-traspasos.ts` construye una PowerSyncDatabase real y revienta con
// "Worker is not defined" en el entorno de test. Mismo patron que
// use-kardex.test.ts / use-ajustes.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    writeTransaction: vi.fn(),
    getAll: vi.fn(),
  },
}))

import type { Transaction } from '@powersync/common'
import { db } from '@/core/db/powersync/db'
import { crearTraspaso } from '../use-traspasos'

const mockedDb = vi.mocked(db, true)

interface Call {
  sql: string
  params: unknown[]
}

interface StockRow {
  id: string
  cantidad_actual: string
}

/**
 * Simula la tx de `crearTraspaso`: COUNT de traspasos previos por usuario,
 * y el estado de `inventario_stock` por (producto_id, deposito_id) — la
 * MISMA fila se usa consistentemente tanto para el guard/lectura
 * (`leerStockDeposito`, prefijo `SELECT cantidad_actual FROM
 * inventario_stock`) como para la escritura (`upsertStockDeposito`, prefijo
 * `SELECT id, cantidad_actual FROM inventario_stock`) — sin fila para un
 * par (producto,deposito) es un caso legitimo (deposito que recibe ese
 * producto por primera vez): dispara el INSERT + reconstruccion de baseline
 * desde kardex (vacio en estos tests, baseline 0).
 */
function mockCrearTraspasoTx(opts: {
  countTraspasosExistente?: number
  /** key: `${producto_id}::${deposito_id}` */
  inventarioStock?: Record<string, StockRow>
}) {
  const calls: Call[] = []
  const stockMap = opts.inventarioStock ?? {}

  mockedDb.writeTransaction.mockImplementation(async (callback) => {
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })

        if (sql.startsWith('SELECT COUNT(*) AS total FROM traspasos_inventario')) {
          return { rows: { length: 1, item: () => ({ total: opts.countTraspasosExistente ?? 0 }) } }
        }
        if (sql.startsWith('SELECT cantidad_actual FROM inventario_stock')) {
          const [productoId, depositoId] = params as [string, string]
          const row = stockMap[`${productoId}::${depositoId}`]
          return { rows: { length: row ? 1 : 0, item: () => (row ? { cantidad_actual: row.cantidad_actual } : undefined) } }
        }
        if (sql.startsWith('SELECT id, cantidad_actual FROM inventario_stock')) {
          const [, productoId, depositoId] = params as [string, string, string]
          const row = stockMap[`${productoId}::${depositoId}`]
          return { rows: { length: row ? 1 : 0, item: () => row } }
        }
        // INSERT guardado (WHERE NOT EXISTS + RETURNING id) — simula insercion exitosa,
        // sin carrera (no hay otra escritura concurrente en estos tests).
        if (sql.startsWith('INSERT INTO inventario_stock')) {
          return { rows: { length: 1, item: () => ({ id: 'stock-insert-fake-id' }) } }
        }
        if (sql.startsWith('SELECT producto_id, deposito_id, tipo, cantidad FROM movimientos_inventario')) {
          // reconstruirBaselineDesdeKardex — sin historia previa en estos tests, baseline 0.
          return { rows: { length: 0, item: () => undefined } }
        }
        if (sql.startsWith('SELECT stock FROM productos WHERE id = ?')) {
          return { rows: { length: 1, item: () => ({ stock: '1000.000' }) } }
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
  // Default: ambos depositos (dep-A/dep-B, usados en todos los tests de este
  // archivo) activos — la guardia is_active no bloquea salvo que un test
  // sobre-escriba este mock explicitamente.
  mockedDb.getAll.mockResolvedValue([
    { id: 'dep-A', is_active: 1 },
    { id: 'dep-B', is_active: 1 },
  ])
})

describe('crearTraspaso — traspaso individual (TRI/Traspaso individual mueve stock A→B atomicamente)', () => {
  it('1 linea: header + 1 det + 2 kardex (S+E) + upserts de inventario_stock en AMBOS depositos, todo en una tx', async () => {
    const calls = mockCrearTraspasoTx({
      inventarioStock: {
        'prod-1::dep-A': { id: 'stock-A', cantidad_actual: '10.000' },
        // dep-B sin fila previa: primera vez que este producto entra a ese deposito.
      },
    })

    const result = await crearTraspaso({
      empresa_id: 'emp-1',
      usuario_id: 'user-1',
      deposito_origen_id: 'dep-A',
      deposito_destino_id: 'dep-B',
      lineas: [{ producto_id: 'prod-1', cantidad: 4 }],
    })

    expect(result.traspasoId).toBeDefined()
    expect(result.correlativo).toBe(1)

    const headerInsert = calls.find((c) => c.sql.startsWith('INSERT INTO traspasos_inventario\n'))
    expect(headerInsert).toBeDefined()

    const detInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO traspasos_inventario_det'))
    expect(detInserts).toHaveLength(1)
    expect(detInserts[0]!.params).toContain('prod-1')
    expect(detInserts[0]!.params).toContain('4.000')

    const kardexInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInserts).toHaveLength(2)

    const salidaKardex = kardexInserts.find((c) => c.params.includes('S'))
    const entradaKardex = kardexInserts.find((c) => c.params.includes('E'))
    expect(salidaKardex).toBeDefined()
    expect(entradaKardex).toBeDefined()
    expect(salidaKardex!.params).toContain('dep-A')
    expect(salidaKardex!.params).toContain('TRA')
    expect(entradaKardex!.params).toContain('dep-B')
    expect(entradaKardex!.params).toContain('TRA')
    // Ambas filas comparten doc_origen_id = traspasoId
    expect(salidaKardex!.params).toContain(result.traspasoId)
    expect(entradaKardex!.params).toContain(result.traspasoId)

    // Origen: fila existente (stock-A) -> UPDATE con el stock decrementado (10 - 4 = 6)
    const stockUpdateOrigen = calls.find(
      (c) => c.sql.startsWith('UPDATE inventario_stock') && c.params.includes('stock-A')
    )
    expect(stockUpdateOrigen).toBeDefined()
    expect(stockUpdateOrigen!.params).toContain('6.000')

    // Destino: sin fila previa -> INSERT con el deposito destino y cantidad 4.000 (0 + 4)
    const stockInsertDestino = calls.find(
      (c) => c.sql.startsWith('INSERT INTO inventario_stock') && c.params.includes('dep-B')
    )
    expect(stockInsertDestino).toBeDefined()
    expect(stockInsertDestino!.params).toContain('4.000')
  })

  it('movimientoInventarioId correcto por lado: la reconstruccion de baseline del deposito destino excluye el id de la fila de ENTRADA, no el de la salida', async () => {
    const calls = mockCrearTraspasoTx({
      inventarioStock: {
        'prod-1::dep-A': { id: 'stock-A', cantidad_actual: '10.000' },
        // dep-B sin fila -> upsertStockDeposito dispara reconstruirBaselineDesdeKardex, exponiendo el movimientoInventarioId excluido.
      },
    })

    await crearTraspaso({
      empresa_id: 'emp-1',
      usuario_id: 'user-1',
      deposito_origen_id: 'dep-A',
      deposito_destino_id: 'dep-B',
      lineas: [{ producto_id: 'prod-1', cantidad: 4 }],
    })

    const kardexInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    const salidaKardex = kardexInserts.find((c) => c.params.includes('S'))!
    const entradaKardex = kardexInserts.find((c) => c.params.includes('E'))!
    const movSalidaId = salidaKardex.params[0] as string
    const movEntradaId = entradaKardex.params[0] as string
    expect(movSalidaId).not.toBe(movEntradaId)

    // Solo el deposito SIN fila previa (destino) dispara la reconstruccion de baseline.
    const reconstruirCalls = calls.filter((c) =>
      c.sql.startsWith('SELECT producto_id, deposito_id, tipo, cantidad FROM movimientos_inventario')
    )
    expect(reconstruirCalls).toHaveLength(1)
    const [, , depositoExcluido, excludeId] = reconstruirCalls[0]!.params as [string, string, string, string]
    expect(depositoExcluido).toBe('dep-B')
    // El id excluido es el de la fila de ENTRADA (la que acaba de liquidar este upsert), NUNCA el de la salida.
    expect(excludeId).toBe(movEntradaId)
    expect(excludeId).not.toBe(movSalidaId)
  })
})

describe('crearTraspaso — traspaso por lote (TRI/Traspaso por Lote)', () => {
  it('3 productos: 3 det + 6 kardex pareados (3 S + 3 E) bajo un unico header, atomicamente', async () => {
    const stockRow = (id: string): StockRow => ({ id, cantidad_actual: '50.000' })
    const calls = mockCrearTraspasoTx({
      inventarioStock: {
        'prod-1::dep-A': stockRow('stock-1A'),
        'prod-2::dep-A': stockRow('stock-2A'),
        'prod-3::dep-A': stockRow('stock-3A'),
        'prod-1::dep-B': stockRow('stock-1B'),
        'prod-2::dep-B': stockRow('stock-2B'),
        'prod-3::dep-B': stockRow('stock-3B'),
      },
    })

    const result = await crearTraspaso({
      empresa_id: 'emp-1',
      usuario_id: 'user-1',
      deposito_origen_id: 'dep-A',
      deposito_destino_id: 'dep-B',
      lineas: [
        { producto_id: 'prod-1', cantidad: 2 },
        { producto_id: 'prod-2', cantidad: 3 },
        { producto_id: 'prod-3', cantidad: 5 },
      ],
    })

    const headerInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO traspasos_inventario\n'))
    expect(headerInserts).toHaveLength(1)
    expect(headerInserts[0]!.params).toContain(result.traspasoId)

    const detInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO traspasos_inventario_det'))
    expect(detInserts).toHaveLength(3)
    // Todas las lineas de detalle apuntan al mismo header
    for (const det of detInserts) {
      expect(det.params).toContain(result.traspasoId)
    }

    const kardexInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInserts).toHaveLength(6)
    const salidas = kardexInserts.filter((c) => c.params.includes('S'))
    const entradas = kardexInserts.filter((c) => c.params.includes('E'))
    expect(salidas).toHaveLength(3)
    expect(entradas).toHaveLength(3)

    // 6 upserts de inventario_stock (3 origen decrementados + 3 destino incrementados) -> 6 UPDATEs (todas las filas ya existian)
    const stockUpdates = calls.filter((c) => c.sql.startsWith('UPDATE inventario_stock'))
    expect(stockUpdates).toHaveLength(6)
  })
})

describe('crearTraspaso — correlativo por usuario (TRI/Correlativo incrementa por usuario)', () => {
  it('usuario sin traspasos previos (COUNT=0): el nuevo traspaso recibe correlativo 1', async () => {
    mockCrearTraspasoTx({
      countTraspasosExistente: 0,
      inventarioStock: { 'prod-1::dep-A': { id: 'stock-A', cantidad_actual: '10.000' } },
    })

    const result = await crearTraspaso({
      empresa_id: 'emp-1',
      usuario_id: 'user-1',
      deposito_origen_id: 'dep-A',
      deposito_destino_id: 'dep-B',
      lineas: [{ producto_id: 'prod-1', cantidad: 1 }],
    })

    expect(result.correlativo).toBe(1)
  })

  it('usuario con 3 traspasos previos (COUNT=3): el nuevo traspaso recibe correlativo 4, independiente de otros usuarios', async () => {
    const calls = mockCrearTraspasoTx({
      countTraspasosExistente: 3,
      inventarioStock: { 'prod-1::dep-A': { id: 'stock-A', cantidad_actual: '10.000' } },
    })

    const result = await crearTraspaso({
      empresa_id: 'emp-1',
      usuario_id: 'user-2',
      deposito_origen_id: 'dep-A',
      deposito_destino_id: 'dep-B',
      lineas: [{ producto_id: 'prod-1', cantidad: 1 }],
    })

    expect(result.correlativo).toBe(4)

    const countCall = calls.find((c) => c.sql.startsWith('SELECT COUNT(*) AS total FROM traspasos_inventario'))
    expect(countCall!.params).toEqual(['emp-1', 'user-2'])

    const headerInsert = calls.find((c) => c.sql.startsWith('INSERT INTO traspasos_inventario\n'))
    expect(headerInsert!.params).toContain(4)
  })
})

describe('crearTraspaso — bloqueo por stock insuficiente en origen (TRI/Traspaso bloqueado por falta de stock)', () => {
  it('linea individual con stock insuficiente en origen: rechaza y no escribe ningun kardex/detalle', async () => {
    const calls = mockCrearTraspasoTx({
      inventarioStock: { 'prod-1::dep-A': { id: 'stock-A', cantidad_actual: '2.000' } },
    })

    await expect(
      crearTraspaso({
        empresa_id: 'emp-1',
        usuario_id: 'user-1',
        deposito_origen_id: 'dep-A',
        deposito_destino_id: 'dep-B',
        lineas: [{ producto_id: 'prod-1', cantidad: 5 }],
      })
    ).rejects.toThrow(/Stock insuficiente/i)

    const kardexInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_inventario'))
    expect(kardexInserts).toHaveLength(0)
    const detInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO traspasos_inventario_det'))
    expect(detInserts).toHaveLength(0)
  })

  it('batch de 3 lineas con la linea 2 sin stock suficiente: NADA se escribe para las lineas posteriores (rollback completo, no hay commit parcial)', async () => {
    const stockRow = (id: string, cantidad: string): StockRow => ({ id, cantidad_actual: cantidad })
    const calls = mockCrearTraspasoTx({
      inventarioStock: {
        'prod-1::dep-A': stockRow('stock-1A', '50.000'), // linea 1: stock suficiente
        'prod-2::dep-A': stockRow('stock-2A', '1.000'), // linea 2: INSUFICIENTE (pide 5)
        'prod-3::dep-A': stockRow('stock-3A', '50.000'), // linea 3: nunca deberia procesarse
      },
    })

    await expect(
      crearTraspaso({
        empresa_id: 'emp-1',
        usuario_id: 'user-1',
        deposito_origen_id: 'dep-A',
        deposito_destino_id: 'dep-B',
        lineas: [
          { producto_id: 'prod-1', cantidad: 2 },
          { producto_id: 'prod-2', cantidad: 5 },
          { producto_id: 'prod-3', cantidad: 3 },
        ],
      })
    ).rejects.toThrow(/Stock insuficiente/i)

    // La linea 3 (posterior a la que fallo) jamas se alcanza dentro del loop —
    // el throw de la linea 2 interrumpe la iteracion inmediatamente.
    const referenciaLinea3 = calls.some((c) => c.params.includes('prod-3'))
    expect(referenciaLinea3).toBe(false)

    // Solo el detalle de la linea 1 (exitosa) se alcanzo a generar; la linea 2 (que fallo) y la
    // linea 3 (posterior) nunca llegan al INSERT de detalle.
    const detInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO traspasos_inventario_det'))
    expect(detInserts).toHaveLength(1)
    expect(detInserts[0]!.params).toContain('prod-1')

    // La linea 1 SI se alcanzo a ejecutar dentro del callback de la tx (JS corre secuencialmente hasta el throw),
    // pero al ser una unica `writeTransaction`, PowerSync revierte TODAS las sentencias del callback —incluida
    // la linea 1 y el header— cuando el callback rechaza. La garantia de atomicidad es de la propia `writeTransaction`,
    // no de que el mock nunca haya "visto" la sentencia.
    const kardexLinea1 = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_inventario') && c.params.includes('prod-1'))
    expect(kardexLinea1).toHaveLength(2)
  })
})

describe('crearTraspaso — deposito origen igual a destino', () => {
  it('rechaza ANTES de abrir la transaccion cuando origen === destino (rechazo temprano del lado del cliente)', async () => {
    await expect(
      crearTraspaso({
        empresa_id: 'emp-1',
        usuario_id: 'user-1',
        deposito_origen_id: 'dep-A',
        deposito_destino_id: 'dep-A',
        lineas: [{ producto_id: 'prod-1', cantidad: 1 }],
      })
    ).rejects.toThrow(/diferentes/i)

    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()
  })
})

describe('crearTraspaso — guardia is_active (Guardia is_active en Traspaso)', () => {
  it('deposito origen inactivo: rechaza en espanol ANTES de abrir la transaccion', async () => {
    mockedDb.getAll.mockResolvedValue([
      { id: 'dep-A', is_active: 0 },
      { id: 'dep-B', is_active: 1 },
    ])

    await expect(
      crearTraspaso({
        empresa_id: 'emp-1',
        usuario_id: 'user-1',
        deposito_origen_id: 'dep-A',
        deposito_destino_id: 'dep-B',
        lineas: [{ producto_id: 'prod-1', cantidad: 1 }],
      })
    ).rejects.toThrow(/origen.*inactivo/i)

    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()
  })

  it('deposito destino inactivo: rechaza en espanol ANTES de abrir la transaccion', async () => {
    mockedDb.getAll.mockResolvedValue([
      { id: 'dep-A', is_active: 1 },
      { id: 'dep-B', is_active: 0 },
    ])

    await expect(
      crearTraspaso({
        empresa_id: 'emp-1',
        usuario_id: 'user-1',
        deposito_origen_id: 'dep-A',
        deposito_destino_id: 'dep-B',
        lineas: [{ producto_id: 'prod-1', cantidad: 1 }],
      })
    ).rejects.toThrow(/destino.*inactivo/i)

    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()
  })

  it('origen y destino activos: procede normalmente, la transaccion se abre', async () => {
    mockCrearTraspasoTx({
      inventarioStock: { 'prod-1::dep-A': { id: 'stock-A', cantidad_actual: '10.000' } },
    })

    await crearTraspaso({
      empresa_id: 'emp-1',
      usuario_id: 'user-1',
      deposito_origen_id: 'dep-A',
      deposito_destino_id: 'dep-B',
      lineas: [{ producto_id: 'prod-1', cantidad: 1 }],
    })

    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)
  })
})

describe('crearTraspaso — placeholders de autorizacion (TRI/Traspaso creado sin autorizacion)', () => {
  it('autorizado_por y verificado_por se insertan como NULL literal (sin flujo de aprobacion)', async () => {
    const calls = mockCrearTraspasoTx({
      inventarioStock: { 'prod-1::dep-A': { id: 'stock-A', cantidad_actual: '10.000' } },
    })

    await crearTraspaso({
      empresa_id: 'emp-1',
      usuario_id: 'user-1',
      deposito_origen_id: 'dep-A',
      deposito_destino_id: 'dep-B',
      lineas: [{ producto_id: 'prod-1', cantidad: 1 }],
    })

    const headerInsert = calls.find((c) => c.sql.startsWith('INSERT INTO traspasos_inventario\n'))!
    expect(headerInsert.sql).toContain('autorizado_por, verificado_por')
    expect(headerInsert.sql).toMatch(/VALUES \(\?, \?, \?, \?, \?, \?, \?, NULL, NULL, \?, \?, \?\)/)
  })
})
