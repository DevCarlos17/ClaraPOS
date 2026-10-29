// `reversarAbonoDirectoDesdeTesoreria` (slice 2b-i-a, CASO SIMPLE,
// `reverso-abono-directo-tesoreria-sin-saf`) orquesta en UNA sola
// `db.writeTransaction` el egreso bancario contraparte + el reverso del/los
// pago(s) ligados via `movimientos_bancarios_pagos`, delegando el cuerpo del
// reverso de pago en `reversarPagoEnTx` (slice 2a, YA MERGEADA). Mockeamos
// `@/core/db/powersync/db` (controla `getAll`/`writeTransaction`),
// `@/features/cxc/hooks/reversa-pago-saf` (controla la deteccion SAF
// pre-tx) y `@/features/cxc/hooks/use-cxc` (espia `reversarPagoEnTx` para
// probar la DELEGACION sin re-probar su cuerpo interno, ya cubierto por
// `reversar-pago-en-tx.test.ts`) — mismo patron de aislamiento que
// `use-notas-credito.test.ts` (espiar `reversarGastoEnTx`/
// `reversarDiferencialEnTx` sin reimplementar su logica).
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    getAll: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))
vi.mock('@/features/cxc/hooks/reversa-pago-saf', () => ({
  detectarLoteSafDePago: vi.fn(),
}))
vi.mock('@/features/cxc/hooks/use-cxc', () => ({
  reversarPagoEnTx: vi.fn(async () => undefined),
}))

import type { Transaction } from '@powersync/common'
import { db } from '@/core/db/powersync/db'
import { detectarLoteSafDePago } from '@/features/cxc/hooks/reversa-pago-saf'
import { reversarPagoEnTx } from '@/features/cxc/hooks/use-cxc'
import { reversarAbonoDirectoDesdeTesoreria } from '../use-reverso-abono-directo'

const mockedDb = vi.mocked(db, true)
const mockedDetectarLoteSafDePago = vi.mocked(detectarLoteSafDePago)
const mockedReversarPagoEnTx = vi.mocked(reversarPagoEnTx)

interface Call {
  sql: string
  params: unknown[]
}

beforeEach(() => {
  vi.clearAllMocks()
})

function mockIngresoSimple(overrides: Partial<Record<string, unknown>> = {}) {
  return [
    {
      id: 'ingreso-1',
      banco_empresa_id: 'banco-1',
      tipo: 'INGRESO',
      origen: 'TRANSFERENCIA_CLIENTE',
      monto: '100.00000000',
      doc_origen_id: 'venta-1',
      doc_origen_tipo: 'PAGO_CXC',
      reversado: 0,
      ...overrides,
    },
  ]
}

function buildFakeTx(opts: {
  bancoSaldoActual: string
  movToctou?: Partial<Record<string, unknown>>
  pagoFalla?: { pagoId: string; error: Error }
}) {
  const calls: Call[] = []
  const tx = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (sql.startsWith('SELECT banco_empresa_id, monto, doc_origen_id, doc_origen_tipo, reversado')) {
        return {
          rows: {
            length: 1,
            item: () => ({
              banco_empresa_id: 'banco-1',
              monto: '100.00000000',
              doc_origen_id: 'venta-1',
              doc_origen_tipo: 'PAGO_CXC',
              reversado: 0,
              ...opts.movToctou,
            }),
          },
        }
      }
      if (sql.startsWith('SELECT saldo_actual FROM bancos_empresa')) {
        return { rows: { length: 1, item: () => ({ saldo_actual: opts.bancoSaldoActual }) } }
      }
      return { rows: { length: 0, item: () => undefined } }
    }),
  } as unknown as Transaction
  return { tx, calls }
}

function setupWriteTransaction(opts: Parameters<typeof buildFakeTx>[0]) {
  const { tx, calls } = buildFakeTx(opts)
  mockedDb.writeTransaction.mockImplementationOnce(async (callback) => callback(tx))
  return calls
}

/**
 * Mapea los params posicionales del INSERT INTO movimientos_bancarios a un
 * record { columna: valor }, leyendo la lista de columnas directamente del
 * SQL — evita que las aserciones dependan del orden exacto de columnas
 * (solo `tipo`/`origen` son literales embebidos en el SQL, no params).
 */
function parseInsertEgreso(call: Call): Record<string, unknown> {
  const match = call.sql.match(/INSERT INTO movimientos_bancarios\s*\(([^)]+)\)/)
  if (!match) throw new Error('No se pudo parsear columnas del INSERT INTO movimientos_bancarios')
  const cols = match[1]!.split(',').map((c) => c.trim())
  const literalCols = new Set(['tipo', 'origen'])
  const paramCols = cols.filter((c) => !literalCols.has(c))
  const record: Record<string, unknown> = { tipo: 'EGRESO', origen: 'REVERSO' }
  paramCols.forEach((col, idx) => {
    record[col] = call.params[idx]
  })
  return record
}

describe('reversarAbonoDirectoDesdeTesoreria — orquestador caso simple (sin SAF, slice 2b-i-a)', () => {
  it('escenario simple ($100, 1 factura, sin SAF): crea EXACTAMENTE 1 egreso, decrementa el banco, marca el ingreso reversado, y delega el reverso del pago a reversarPagoEnTx', async () => {
    mockedDb.getAll
      .mockResolvedValueOnce(mockIngresoSimple())
      .mockResolvedValueOnce([{ pago_id: 'pago-1' }])
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })
    const calls = setupWriteTransaction({ bancoSaldoActual: '500.00000000' })

    await reversarAbonoDirectoDesdeTesoreria({
      ingresoId: 'ingreso-1',
      motivo: 'Transferencia duplicada por error',
      userId: 'user-1',
      reversedByNombre: 'Cajero Uno',
      empresaId: 'emp-1',
    })

    // Exactamente 1 egreso, por el monto TOTAL del ingreso ($100), con
    // origen='REVERSO' y reverso_de=ingresoId.
    const egresoInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_bancarios'))
    expect(egresoInserts).toHaveLength(1)
    const egreso = egresoInserts[0]!
    expect(egreso.sql).toContain("'EGRESO', 'REVERSO'")
    expect(egreso.params).toContain('100.00000000') // monto = total del ingreso
    expect(egreso.params).toContain('banco-1')
    expect(egreso.params).toContain('venta-1') // doc_origen_id heredado del ingreso
    expect(egreso.params).toContain('PAGO_CXC') // doc_origen_tipo heredado
    expect(egreso.params).toContain('ingreso-1') // reverso_de
    expect(egreso.params).toContain('Transferencia duplicada por error') // descripcion = motivo
    expect(egreso.params).toContain('user-1') // created_by
    expect(egreso.params).toContain('400.00000000') // saldo_nuevo = 500 - 100

    // El egreso-reverso nace directo en Historico como Validado (nunca en
    // Pendientes, ver spec `tesoreria-reverso-abono-directo`): validado=1,
    // validado_por=userId que confirma el reverso, validado_at poblado
    // (no NULL) — mismo patron que `validarMovBancario`.
    const egresoRecord = parseInsertEgreso(egreso)
    expect(egresoRecord.validado).toBe(1)
    expect(egresoRecord.validado_por).toBe('user-1')
    expect(egresoRecord.validado_at).toBeTruthy()
    expect(typeof egresoRecord.validado_at).toBe('string')

    // bancos_empresa decrementado al saldo nuevo.
    const bancoUpdate = calls.find((c) => c.sql.startsWith('UPDATE bancos_empresa'))
    expect(bancoUpdate).toBeDefined()
    expect(bancoUpdate!.params).toEqual(['400.00000000', expect.any(String), 'banco-1', 'emp-1'])

    // El ingreso original queda reversado=1.
    const marcarReversado = calls.find((c) => c.sql.startsWith('UPDATE movimientos_bancarios SET reversado = 1'))
    expect(marcarReversado).toBeDefined()
    expect(marcarReversado!.params).toEqual(['ingreso-1', 'emp-1'])

    // Delegacion: reversarPagoEnTx se llama UNA vez, contra la MISMA tx,
    // con los params exactos (generatedLote resuelto pre-tx = false).
    expect(mockedReversarPagoEnTx).toHaveBeenCalledTimes(1)
    const [txArg, pagoParams] = mockedReversarPagoEnTx.mock.calls[0]!
    expect(txArg).toBeDefined()
    expect(pagoParams).toMatchObject({
      pagoId: 'pago-1',
      empresaId: 'emp-1',
      reversedBy: 'user-1',
      reversedByNombre: 'Cajero Uno',
      reason: 'Transferencia duplicada por error',
      generatedLote: false,
    })
    expect(typeof pagoParams.now).toBe('string')
  })

  it('SAF-block: si detectarLoteSafDePago devuelve facturasAfectadas no-vacio para el pago del puente, rechaza ANTES de abrir la tx (CERO mutacion)', async () => {
    mockedDb.getAll
      .mockResolvedValueOnce(mockIngresoSimple())
      .mockResolvedValueOnce([{ pago_id: 'pago-saf' }])
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({
      generatedLote: true,
      loteId: 'lote-1',
      montoOriginalUsd: 100,
      saldoDisponibleUsd: 40,
      montoConsumidoUsd: 60,
      facturasAfectadas: [{ ventaId: 'venta-saf', nroFactura: 'F-SAF', montoAplicadoUsd: 60 }],
    })

    await expect(
      reversarAbonoDirectoDesdeTesoreria({
        ingresoId: 'ingreso-1',
        motivo: 'Intento de reverso con SAF',
        userId: 'user-1',
        reversedByNombre: 'Cajero Uno',
        empresaId: 'emp-1',
      })
    ).rejects.toThrow(
      'Este abono genero saldo a favor consumido en otras facturas; reversar desde tesoreria no esta disponible todavia'
    )

    // CERO mutacion: la tx nunca se abrio, el pago nunca se tocó.
    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()
    expect(mockedReversarPagoEnTx).not.toHaveBeenCalled()
  })

  it('doble-reverso (ingreso, deteccion pre-tx): movimientos_bancarios.reversado=1 ya en la lectura PRE-TX -> rechaza antes de resolver el puente, cero mutacion', async () => {
    mockedDb.getAll.mockResolvedValueOnce(mockIngresoSimple({ reversado: 1 }))

    await expect(
      reversarAbonoDirectoDesdeTesoreria({
        ingresoId: 'ingreso-1',
        motivo: 'Reverso duplicado',
        userId: 'user-1',
        reversedByNombre: 'Cajero Uno',
        empresaId: 'emp-1',
      })
    ).rejects.toThrow('Este movimiento ya fue reversado')

    expect(mockedDb.getAll).toHaveBeenCalledTimes(1) // nunca llego a resolver el puente
    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()
    expect(mockedReversarPagoEnTx).not.toHaveBeenCalled()
  })

  it('doble-reverso (ingreso, TOCTOU dentro de la tx): la lectura pre-tx dice reversado=0 pero el re-SELECT dentro de la tx ve reversado=1 -> aborta ANTES de crear el egreso', async () => {
    mockedDb.getAll
      .mockResolvedValueOnce(mockIngresoSimple())
      .mockResolvedValueOnce([{ pago_id: 'pago-1' }])
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })
    const calls = setupWriteTransaction({
      bancoSaldoActual: '500.00000000',
      movToctou: { reversado: 1 },
    })

    await expect(
      reversarAbonoDirectoDesdeTesoreria({
        ingresoId: 'ingreso-1',
        motivo: 'Carrera entre dos reversos',
        userId: 'user-1',
        reversedByNombre: 'Cajero Uno',
        empresaId: 'emp-1',
      })
    ).rejects.toThrow('Este movimiento ya fue reversado')

    // Cero egreso persistido: el TOCTOU corta ANTES del INSERT.
    expect(calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_bancarios'))).toHaveLength(0)
    expect(mockedReversarPagoEnTx).not.toHaveBeenCalled()
  })

  it('rollback atomico: si reversarPagoEnTx rechaza dentro del loop, el writeTransaction completo rechaza (señal de rollback, SIN try/catch que lo absorba)', async () => {
    mockedDb.getAll
      .mockResolvedValueOnce(mockIngresoSimple())
      .mockResolvedValueOnce([{ pago_id: 'pago-roto' }])
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })
    setupWriteTransaction({ bancoSaldoActual: '500.00000000' })
    mockedReversarPagoEnTx.mockRejectedValueOnce(new Error('Pago no encontrado'))

    // El rollback FISICO de la tx (reversion del INSERT de egreso + UPDATE
    // de banco ya ejecutados en esta misma `db.writeTransaction`) ocurre a
    // nivel de wa-sqlite en produccion — este mock no simula la reversion
    // fisica, igual que el resto de los tests de rollback de este repo
    // (ver `use-notas-credito.test.ts`, "senal de rollback, SIN try/catch").
    // Lo que SI podemos probar aqui es que el throw de `reversarPagoEnTx`
    // se propaga SIN que el orquestador lo intercepte (ningun try/catch
    // alrededor del loop (iii)) — si el orquestador tragara el error, esta
    // promesa resolveria en vez de rechazar.
    await expect(
      reversarAbonoDirectoDesdeTesoreria({
        ingresoId: 'ingreso-1',
        motivo: 'Reverso que falla a mitad de camino',
        userId: 'user-1',
        reversedByNombre: 'Cajero Uno',
        empresaId: 'emp-1',
      })
    ).rejects.toThrow('Pago no encontrado')
  })

  it('aislamiento multi-tenant: todas las queries nuevas (pre-tx y dentro de la tx) filtran empresa_id', async () => {
    mockedDb.getAll
      .mockResolvedValueOnce(mockIngresoSimple())
      .mockResolvedValueOnce([{ pago_id: 'pago-1' }])
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })
    const calls = setupWriteTransaction({ bancoSaldoActual: '500.00000000' })

    await reversarAbonoDirectoDesdeTesoreria({
      ingresoId: 'ingreso-1',
      motivo: 'Chequeo multi-tenant',
      userId: 'user-1',
      reversedByNombre: 'Cajero Uno',
      empresaId: 'emp-a',
    })

    // Pre-tx: lectura del ingreso y resolucion del puente llevan empresa_id.
    const [sqlMov, paramsMov] = mockedDb.getAll.mock.calls[0]!
    expect(sqlMov).toContain('empresa_id = ?')
    expect(paramsMov).toContain('emp-a')

    const [sqlBridge, paramsBridge] = mockedDb.getAll.mock.calls[1]!
    expect(sqlBridge).toContain('mbp.empresa_id = ?')
    expect(paramsBridge).toContain('emp-a')

    expect(mockedDetectarLoteSafDePago).toHaveBeenCalledWith('emp-a', 'pago-1')

    // Dentro de la tx: TOCTOU, lectura de banco, UPDATE banco y UPDATE
    // reversado llevan empresa_id como parametro explicito.
    const toctou = calls.find((c) => c.sql.startsWith('SELECT banco_empresa_id, monto'))
    expect(toctou!.params).toContain('emp-a')

    const bancoRead = calls.find((c) => c.sql.startsWith('SELECT saldo_actual FROM bancos_empresa'))
    expect(bancoRead!.params).toContain('emp-a')

    const bancoUpdate = calls.find((c) => c.sql.startsWith('UPDATE bancos_empresa'))
    expect(bancoUpdate!.params).toContain('emp-a')

    const marcarReversado = calls.find((c) => c.sql.startsWith('UPDATE movimientos_bancarios SET reversado = 1'))
    expect(marcarReversado!.params).toContain('emp-a')
  })

  it('anti-tx-anidada: el loop invoca reversarPagoEnTx(tx, ...) contra la MISMA tx del writeTransaction del orquestador, nunca abre una segunda tx', async () => {
    mockedDb.getAll
      .mockResolvedValueOnce(mockIngresoSimple())
      .mockResolvedValueOnce([{ pago_id: 'pago-1' }])
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })
    setupWriteTransaction({ bancoSaldoActual: '500.00000000' })

    await reversarAbonoDirectoDesdeTesoreria({
      ingresoId: 'ingreso-1',
      motivo: 'Chequeo anti-tx-anidada',
      userId: 'user-1',
      reversedByNombre: 'Cajero Uno',
      empresaId: 'emp-1',
    })

    // Solo UNA invocacion de db.writeTransaction en todo el flujo (la del
    // orquestador) — reversarPagoEnTx (mockeado) nunca abre la suya.
    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)
    expect(mockedReversarPagoEnTx).toHaveBeenCalledTimes(1)
  })
})

// Slice 2b-i-b — caso GLOBAL multi-factura (tasks 6.1/6.2). El loop (iii)
// del orquestador ya es generico sobre N `pago_id` desde 2b-i-a; estos
// tests NO esperan cambios de produccion, solo prueban que el camino N>1
// realmente se ejercita: N delegaciones a reversarPagoEnTx (una por
// pago_id, con el pagoId correcto cada vez) y EXACTAMENTE 1 egreso por el
// monto TOTAL del ingreso (nunca un egreso por pago). Escenario base
// grounded contra la spec Requirement 3: ingreso `38201beb` ($2 total),
// 2 facturas `8954d635`/`ab7d1bab` ($1 cada una).
describe('reversarAbonoDirectoDesdeTesoreria — caso global multi-factura (fan-in, slice 2b-i-b)', () => {
  it('abono global 2 facturas ($2 total, $1+$1): EXACTAMENTE 1 egreso por el monto TOTAL, 2 delegaciones a reversarPagoEnTx con el pagoId correcto cada una', async () => {
    mockedDb.getAll
      .mockResolvedValueOnce(
        mockIngresoSimple({
          id: '38201beb',
          monto: '2.00000000',
          doc_origen_id: 'venta-multi',
        })
      )
      .mockResolvedValueOnce([{ pago_id: 'pago-8954d635' }, { pago_id: 'pago-ab7d1bab' }])
    mockedDetectarLoteSafDePago
      .mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })
      .mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })
    const calls = setupWriteTransaction({
      bancoSaldoActual: '500.00000000',
      movToctou: { monto: '2.00000000', doc_origen_id: 'venta-multi' },
    })

    await reversarAbonoDirectoDesdeTesoreria({
      ingresoId: '38201beb',
      motivo: 'Transferencia duplicada, abono global 2 facturas',
      userId: 'user-1',
      reversedByNombre: 'Cajero Uno',
      empresaId: 'emp-1',
    })

    // EXACTAMENTE 1 egreso, por el TOTAL ($2) — no la suma recomputada de
    // 2 egresos de $1, ni un egreso por pago.
    const egresoInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_bancarios'))
    expect(egresoInserts).toHaveLength(1)
    expect(egresoInserts[0]!.params).toContain('2.00000000')

    // El egreso-reverso del abono global tambien nace Validado (nunca
    // Pendiente) — misma regla que el caso simple.
    const egresoRecordGlobal2 = parseInsertEgreso(egresoInserts[0]!)
    expect(egresoRecordGlobal2.validado).toBe(1)
    expect(egresoRecordGlobal2.validado_por).toBe('user-1')
    expect(egresoRecordGlobal2.validado_at).toBeTruthy()

    // El banco se decrementa UNA sola vez por el total ($500 - $2 = $498),
    // nunca dos veces por $1 cada una.
    const bancoUpdate = calls.find((c) => c.sql.startsWith('UPDATE bancos_empresa'))
    expect(bancoUpdate!.params).toEqual(['498.00000000', expect.any(String), 'banco-1', 'emp-1'])

    // 2 delegaciones a reversarPagoEnTx, UNA por pago_id del puente, con
    // el pagoId EXACTO de cada factura (no colapsadas, no en orden
    // incorrecto, no se "pierde" ninguna).
    expect(mockedReversarPagoEnTx).toHaveBeenCalledTimes(2)
    const [, paramsA] = mockedReversarPagoEnTx.mock.calls[0]!
    const [, paramsB] = mockedReversarPagoEnTx.mock.calls[1]!
    expect(paramsA).toMatchObject({ pagoId: 'pago-8954d635', empresaId: 'emp-1' })
    expect(paramsB).toMatchObject({ pagoId: 'pago-ab7d1bab', empresaId: 'emp-1' })

    // El ingreso global queda reversado=1 (una sola fila, el puente no
    // genera N filas de ingreso).
    const marcarReversado = calls.find((c) => c.sql.startsWith('UPDATE movimientos_bancarios SET reversado = 1'))
    expect(marcarReversado!.params).toEqual(['38201beb', 'emp-1'])
  })

  it('abono global 3 facturas ($3 total): 3 delegaciones, 1 solo egreso, consistencia de suma (monto egreso === suma de los 3 pagos)', async () => {
    mockedDb.getAll
      .mockResolvedValueOnce(mockIngresoSimple({ id: 'ingreso-3fact', monto: '3.00000000' }))
      .mockResolvedValueOnce([{ pago_id: 'pago-A' }, { pago_id: 'pago-B' }, { pago_id: 'pago-C' }])
    mockedDetectarLoteSafDePago
      .mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })
      .mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })
      .mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })
    const calls = setupWriteTransaction({
      bancoSaldoActual: '1000.00000000',
      movToctou: { monto: '3.00000000' },
    })

    await reversarAbonoDirectoDesdeTesoreria({
      ingresoId: 'ingreso-3fact',
      motivo: 'Abono global 3 facturas',
      userId: 'user-1',
      reversedByNombre: 'Cajero Uno',
      empresaId: 'emp-1',
    })

    const egresoInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_bancarios'))
    expect(egresoInserts).toHaveLength(1)
    // Consistencia de suma: el monto del UNICO egreso es el total ($3),
    // igual a la suma de los 3 pagos individuales ($1+$1+$1), nunca
    // recomputado sumando por pago (viene directo de mov.monto).
    expect(egresoInserts[0]!.params).toContain('3.00000000')

    // El egreso-reverso del abono global de 3 facturas tambien nace
    // Validado (nunca Pendiente) — misma regla que el caso simple.
    const egresoRecordGlobal3 = parseInsertEgreso(egresoInserts[0]!)
    expect(egresoRecordGlobal3.validado).toBe(1)
    expect(egresoRecordGlobal3.validado_por).toBe('user-1')
    expect(egresoRecordGlobal3.validado_at).toBeTruthy()

    expect(mockedReversarPagoEnTx).toHaveBeenCalledTimes(3)
    const pagoIdsLlamados = mockedReversarPagoEnTx.mock.calls.map(
      (call) => (call[1] as { pagoId: string }).pagoId
    )
    expect(pagoIdsLlamados).toEqual(['pago-A', 'pago-B', 'pago-C'])
  })

  it('rollback atomico multi-pago: si el 2do de 3 reversarPagoEnTx rechaza, el 3ro NUNCA se invoca y el writeTransaction completo rechaza (sin reopens parciales)', async () => {
    mockedDb.getAll
      .mockResolvedValueOnce(mockIngresoSimple({ id: 'ingreso-3fact', monto: '3.00000000' }))
      .mockResolvedValueOnce([{ pago_id: 'pago-A' }, { pago_id: 'pago-B' }, { pago_id: 'pago-C' }])
    mockedDetectarLoteSafDePago
      .mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })
      .mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })
      .mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })
    setupWriteTransaction({ bancoSaldoActual: '1000.00000000', movToctou: { monto: '3.00000000' } })
    // pago-A resuelve bien, pago-B rechaza a mitad del loop, pago-C NUNCA
    // deberia ejecutarse (el `for...of` con `await` corta en el primer throw).
    mockedReversarPagoEnTx
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Pago no encontrado'))

    await expect(
      reversarAbonoDirectoDesdeTesoreria({
        ingresoId: 'ingreso-3fact',
        motivo: 'Abono global 3 facturas, 2do pago roto',
        userId: 'user-1',
        reversedByNombre: 'Cajero Uno',
        empresaId: 'emp-1',
      })
    ).rejects.toThrow('Pago no encontrado')

    // Solo A y B se intentaron (2 llamadas) — C jamas se invoco porque el
    // loop secuencial corta en el primer rechazo, sin "saltarse" al
    // siguiente pago silenciosamente.
    expect(mockedReversarPagoEnTx).toHaveBeenCalledTimes(2)
    const pagoIdsIntentados = mockedReversarPagoEnTx.mock.calls.map(
      (call) => (call[1] as { pagoId: string }).pagoId
    )
    expect(pagoIdsIntentados).toEqual(['pago-A', 'pago-B'])
  })
})
