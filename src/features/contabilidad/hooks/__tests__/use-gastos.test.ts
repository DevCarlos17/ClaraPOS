// Mockeamos `@/core/db/powersync/db` porque `anularGasto`/`reversarGastoEnTx`
// usan `db.writeTransaction` a nivel de modulo — sin este mock, importar el
// archivo construye una PowerSyncDatabase real y revienta con "Worker is
// not defined" en el entorno de test. Mismo patron que
// use-notas-credito.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    execute: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/features/contabilidad/hooks/use-cuentas-config', () => ({
  cargarMapaCuentas: vi.fn(async () => ({})),
}))

// Espia usado para PROBAR el llamado a `reversarAsientos` (contra-asientos
// best-effort) sin depender de su implementacion real — mismo aislamiento
// que use-notas-credito.test.ts aplica a `generarAsientosNCR`.
const reversarAsientosSpy = vi.fn<
  (tx: Transaction, params: { empresaId: string; asientosIds: string[]; usuarioId: string }) => Promise<string[]>
>(async () => [])
vi.mock('@/features/contabilidad/lib/generar-asientos', () => ({
  generarAsientosGasto: vi.fn(async () => undefined),
  reversarAsientos: (tx: Transaction, params: { empresaId: string; asientosIds: string[]; usuarioId: string }) =>
    reversarAsientosSpy(tx, params),
  leerMonedaContable: vi.fn(async () => 'USD'),
}))
vi.mock('@/features/caja/lib/deducciones-cierre', () => ({
  construirNroGastoDeduccion: vi.fn(() => 'GTO-DED-0001'),
}))

import type { Transaction } from '@powersync/common'
import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { anularGasto, reversarGastoEnTx, useGastoAbsorcionFactura } from '../use-gastos'

const mockedDb = vi.mocked(db, true)
const mockedUseQuery = vi.mocked(useQuery)

interface Call {
  sql: string
  params: unknown[]
}

interface GastoFixtures {
  gastos: Record<string, { status: string; empresa_id: string }>
  /** Asientos PENDIENTE del gasto en `libro_contable`, consumidos por `reversarAsientos`. */
  asientos?: Array<{ id: string }>
}

/**
 * Simula la `tx` recibida por `reversarGastoEnTx` — captura cada
 * `tx.execute(sql, params)` para las aserciones. Mismo patron que
 * `mockCrearNcrTx` en use-notas-credito.test.ts, escopeado a las 3 queries
 * que `reversarGastoEnTx` realmente ejecuta.
 */
function mockTx(opts: GastoFixtures) {
  const calls: Call[] = []
  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })

    if (sql.startsWith('SELECT status, empresa_id FROM gastos')) {
      const gastoId = params[0] as string
      const gasto = opts.gastos[gastoId]
      return gasto
        ? { rows: { length: 1, item: () => gasto } }
        : { rows: { length: 0, item: () => undefined } }
    }
    if (sql.startsWith("UPDATE gastos SET status = 'ANULADO'")) {
      return { rows: { length: 0, item: () => undefined } }
    }
    if (sql.startsWith('SELECT id FROM libro_contable')) {
      const asientos = opts.asientos ?? []
      return { rows: { length: asientos.length, item: (i: number) => asientos[i] } }
    }

    return { rows: { length: 0, item: () => undefined } }
  })

  return { tx: { execute } as unknown as Transaction, calls }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reversarGastoEnTx (nc-reembolso-real-reverso-gasto: extraido verbatim de anularGasto, corre dentro de una tx existente)', () => {
  it('UPDATE gastos SET status=ANULADO cuando el gasto existe y esta REGISTRADO', async () => {
    const { tx, calls } = mockTx({
      gastos: { 'gasto-1': { status: 'REGISTRADO', empresa_id: 'emp-1' } },
    })

    await reversarGastoEnTx(tx, { gastoId: 'gasto-1' }, '2026-01-01T00:00:00')

    const update = calls.find((c) => c.sql.startsWith("UPDATE gastos SET status = 'ANULADO'"))
    expect(update).toBeDefined()
    expect(update!.params).toContain('gasto-1')
    expect(update!.params).toContain('2026-01-01T00:00:00')
  })

  it('throw "Gasto no encontrado" cuando el gastoId no existe', async () => {
    const { tx } = mockTx({ gastos: {} })

    await expect(
      reversarGastoEnTx(tx, { gastoId: 'gasto-x' }, '2026-01-01T00:00:00')
    ).rejects.toThrow('Gasto no encontrado')
  })

  it('throw "Este gasto ya fue anulado" cuando el gasto ya esta ANULADO', async () => {
    const { tx } = mockTx({
      gastos: { 'gasto-1': { status: 'ANULADO', empresa_id: 'emp-1' } },
    })

    await expect(
      reversarGastoEnTx(tx, { gastoId: 'gasto-1' }, '2026-01-01T00:00:00')
    ).rejects.toThrow('Este gasto ya fue anulado')
  })

  it('con usuarioId: busca asientos PENDIENTE de este gasto en libro_contable y llama reversarAsientos con los ids encontrados (contra-asientos, nunca borra/edita el original)', async () => {
    const { tx, calls } = mockTx({
      gastos: { 'gasto-1': { status: 'REGISTRADO', empresa_id: 'emp-1' } },
      asientos: [{ id: 'as-1' }, { id: 'as-2' }],
    })

    await reversarGastoEnTx(tx, { gastoId: 'gasto-1', usuarioId: 'user-1' }, '2026-01-01T00:00:00')

    const asientosLookup = calls.find((c) => c.sql.startsWith('SELECT id FROM libro_contable'))
    expect(asientosLookup).toBeDefined()
    expect(asientosLookup!.params).toEqual(['emp-1', 'gasto-1'])
    expect(reversarAsientosSpy).toHaveBeenCalledWith(tx, {
      empresaId: 'emp-1',
      asientosIds: ['as-1', 'as-2'],
      usuarioId: 'user-1',
    })
  })

  it('sin usuarioId: NUNCA llama reversarAsientos (contabilidad se omite, mismo comportamiento que anularGasto hoy)', async () => {
    const { tx } = mockTx({
      gastos: { 'gasto-1': { status: 'REGISTRADO', empresa_id: 'emp-1' } },
      asientos: [{ id: 'as-1' }],
    })

    await reversarGastoEnTx(tx, { gastoId: 'gasto-1' }, '2026-01-01T00:00:00')

    expect(reversarAsientosSpy).not.toHaveBeenCalled()
  })

  it('best-effort: si reversarAsientos lanza, la funcion NO revienta y el gasto ya quedo ANULADO', async () => {
    reversarAsientosSpy.mockRejectedValueOnce(new Error('fallo contable'))
    const { tx, calls } = mockTx({
      gastos: { 'gasto-1': { status: 'REGISTRADO', empresa_id: 'emp-1' } },
      asientos: [{ id: 'as-1' }],
    })

    await expect(
      reversarGastoEnTx(tx, { gastoId: 'gasto-1', usuarioId: 'user-1' }, '2026-01-01T00:00:00')
    ).resolves.toBeUndefined()

    const update = calls.find((c) => c.sql.startsWith("UPDATE gastos SET status = 'ANULADO'"))
    expect(update).toBeDefined()
  })

  it('sin asientos PENDIENTE encontrados: no llama reversarAsientos (guard length>0 antes de invocar)', async () => {
    const { tx } = mockTx({
      gastos: { 'gasto-1': { status: 'REGISTRADO', empresa_id: 'emp-1' } },
      asientos: [],
    })

    await reversarGastoEnTx(tx, { gastoId: 'gasto-1', usuarioId: 'user-1' }, '2026-01-01T00:00:00')

    expect(reversarAsientosSpy).not.toHaveBeenCalled()
  })
})

describe('anularGasto — regresion (delega en reversarGastoEnTx dentro de su propia writeTransaction, mismo comportamiento publico que antes de la extraccion)', () => {
  it('abre su propia writeTransaction y actualiza status=ANULADO', async () => {
    const { tx, calls } = mockTx({
      gastos: { 'gasto-1': { status: 'REGISTRADO', empresa_id: 'emp-1' } },
    })
    mockedDb.writeTransaction.mockImplementation(async (cb) => cb(tx))

    await anularGasto('gasto-1', 'user-1')

    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)
    const update = calls.find((c) => c.sql.startsWith("UPDATE gastos SET status = 'ANULADO'"))
    expect(update).toBeDefined()
    expect(update!.params).toContain('gasto-1')
  })

  it('rechaza con "Gasto no encontrado" (mismo mensaje que antes de la extraccion)', async () => {
    const { tx } = mockTx({ gastos: {} })
    mockedDb.writeTransaction.mockImplementation(async (cb) => cb(tx))

    await expect(anularGasto('gasto-x')).rejects.toThrow('Gasto no encontrado')
  })

  it('rechaza con "Este gasto ya fue anulado" (mismo mensaje que antes de la extraccion)', async () => {
    const { tx } = mockTx({
      gastos: { 'gasto-1': { status: 'ANULADO', empresa_id: 'emp-1' } },
    })
    mockedDb.writeTransaction.mockImplementation(async (cb) => cb(tx))

    await expect(anularGasto('gasto-1')).rejects.toThrow('Este gasto ya fue anulado')
  })

  it('con usuarioId: dispara la misma busqueda+reverso de contra-asientos que reversarGastoEnTx (delegacion real, no una copia paralela)', async () => {
    const { tx } = mockTx({
      gastos: { 'gasto-1': { status: 'REGISTRADO', empresa_id: 'emp-1' } },
      asientos: [{ id: 'as-1' }],
    })
    mockedDb.writeTransaction.mockImplementation(async (cb) => cb(tx))

    await anularGasto('gasto-1', 'user-1')

    expect(reversarAsientosSpy).toHaveBeenCalledWith(tx, {
      empresaId: 'emp-1',
      asientosIds: ['as-1'],
      usuarioId: 'user-1',
    })
  })
})

describe('useGastoAbsorcionFactura (nc-reembolso-real-reverso-gasto, Slice B: hook compartido para el desglose Pagado/Asumido)', () => {
  it('retorna el gasto de absorcion encontrado por nro_factura + empresa_id (mismo predicado de descripcion que Step C, SIN filtro status)', () => {
    mockedUseQuery.mockReturnValue({
      data: [{ id: 'gasto-1', monto_usd: '10.00', descripcion: 'ABSORCION_DIFERENCIAL_POS', status: 'REGISTRADO' }],
      isLoading: false,
    } as never)

    const { gasto, isLoading } = useGastoAbsorcionFactura('FAC-0001', 'emp-1')

    expect(isLoading).toBe(false)
    expect(gasto).toEqual({
      id: 'gasto-1',
      monto_usd: '10.00',
      descripcion: 'ABSORCION_DIFERENCIAL_POS',
      status: 'REGISTRADO',
    })
    const [sql, params] = mockedUseQuery.mock.calls[0]
    expect(sql).toContain('FROM gastos')
    expect(sql).toContain("IN ('ABSORCION_DIFERENCIAL_POS', 'DIFERENCIAL_CAMBIARIO_FALTANTE')")
    expect(sql).not.toContain("status = 'REGISTRADO'")
    expect(params).toEqual(['emp-1', 'FAC-0001'])
  })

  it('tambien retorna un gasto ANULADO (sin filtro status — el reverso ya pudo anularlo)', () => {
    mockedUseQuery.mockReturnValue({
      data: [{ id: 'gasto-1', monto_usd: '10.00', descripcion: 'DIFERENCIAL_CAMBIARIO_FALTANTE', status: 'ANULADO' }],
      isLoading: false,
    } as never)

    const { gasto } = useGastoAbsorcionFactura('FAC-0001', 'emp-1')

    expect(gasto?.status).toBe('ANULADO')
  })

  it('sin gasto asociado a la factura -> null, sin lanzar', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    const { gasto } = useGastoAbsorcionFactura('FAC-9999', 'emp-1')

    expect(gasto).toBeNull()
  })

  it('sin nroFactura o sin empresaId (null): no ejecuta query (sql vacio) y retorna null', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    const { gasto } = useGastoAbsorcionFactura(null, 'emp-1')

    expect(gasto).toBeNull()
    expect(mockedUseQuery.mock.calls[0][0]).toBe('')
  })
})
