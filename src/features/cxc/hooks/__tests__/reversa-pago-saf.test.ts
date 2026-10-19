// `detectarLoteSafDePago` es PURA LECTURA (slice 3b-i de
// cxc-ledger-saldos-redesign) — usa `db.getAll` directo (sin
// `db.writeTransaction`), mismo patron que los reportes de solo-lectura en
// `cxc-reportes-general.tsx`/`cxc-cliente-reporte.tsx`. Mockeamos el modulo
// completo para controlar las 2 queries (lote + aplicaciones) sin una
// PowerSyncDatabase real.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    getAll: vi.fn(),
  },
}))

import type { Transaction } from '@powersync/common'
import { db } from '@/core/db/powersync/db'
import { toStorageString } from '@/lib/currency'
import { calcularSaldoPendienteClienteNuevo, calcularSafDisponibleNuevo } from '@/features/cxc/lib/saldo-cliente'
import { detectarLoteSafDePago, reversarPagoSafEnTx } from '../reversa-pago-saf'

const mockedGetAll = vi.mocked(db.getAll)

interface Call {
  sql: string
  params: unknown[]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('detectarLoteSafDePago — deteccion de lote SAF generado por un pago (read-only)', () => {
  it('escenario: el pago NO genero ningun lote SAF', async () => {
    mockedGetAll.mockResolvedValueOnce([])

    const resultado = await detectarLoteSafDePago('emp-1', 'pago-sin-lote')

    expect(resultado.generatedLote).toBe(false)
    expect(resultado.facturasAfectadas).toEqual([])
    expect(resultado.loteId).toBeUndefined()
    expect(resultado.montoConsumidoUsd).toBeUndefined()

    // La query de aplicaciones NUNCA debe dispararse si no hubo lote.
    expect(mockedGetAll).toHaveBeenCalledTimes(1)
    const [sqlLote, paramsLote] = mockedGetAll.mock.calls[0]!
    expect(sqlLote).toContain('FROM saf_creditos_lotes')
    expect(sqlLote).toContain("origen_tipo = 'PAGO'")
    expect(paramsLote).toEqual(['pago-sin-lote', 'emp-1'])
  })

  it('escenario: lote generado pero intacto (consumo cero)', async () => {
    mockedGetAll
      .mockResolvedValueOnce([
        { id: 'lote-1', monto_original_usd: '100.00000000', saldo_disponible_usd: '100.00000000' },
      ])
      .mockResolvedValueOnce([])

    const resultado = await detectarLoteSafDePago('emp-1', 'pago-intacto')

    expect(resultado.generatedLote).toBe(true)
    expect(resultado.loteId).toBe('lote-1')
    expect(resultado.montoOriginalUsd).toBe(100)
    expect(resultado.saldoDisponibleUsd).toBe(100)
    expect(resultado.montoConsumidoUsd).toBe(0)
    expect(resultado.facturasAfectadas).toEqual([])
  })

  it('escenario: lote parcialmente consumido ($60 de $100, 1 factura)', async () => {
    mockedGetAll
      .mockResolvedValueOnce([
        { id: 'lote-2', monto_original_usd: '100.00000000', saldo_disponible_usd: '40.00000000' },
      ])
      .mockResolvedValueOnce([
        { venta_id: 'venta-1', nro_factura: 'F-001', monto_aplicado_usd: '60.00000000' },
      ])

    const resultado = await detectarLoteSafDePago('emp-1', 'pago-parcial')

    expect(resultado.generatedLote).toBe(true)
    expect(resultado.montoConsumidoUsd).toBe(60)
    expect(resultado.facturasAfectadas).toEqual([
      { ventaId: 'venta-1', nroFactura: 'F-001', montoAplicadoUsd: 60 },
    ])

    const [sqlAplicaciones, paramsAplicaciones] = mockedGetAll.mock.calls[1]!
    expect(sqlAplicaciones).toContain('FROM saf_creditos_aplicaciones')
    expect(sqlAplicaciones).toContain('JOIN ventas')
    expect(paramsAplicaciones).toEqual(['lote-2', 'emp-1'])
  })

  it('escenario: lote totalmente consumido ($100 = $60+$40) a traves de 2 ventas', async () => {
    mockedGetAll
      .mockResolvedValueOnce([
        { id: 'lote-3', monto_original_usd: '100.00000000', saldo_disponible_usd: '0.00000000' },
      ])
      .mockResolvedValueOnce([
        { venta_id: 'venta-1', nro_factura: 'F-001', monto_aplicado_usd: '60.00000000' },
        { venta_id: 'venta-2', nro_factura: 'F-002', monto_aplicado_usd: '40.00000000' },
      ])

    const resultado = await detectarLoteSafDePago('emp-1', 'pago-total')

    expect(resultado.generatedLote).toBe(true)
    expect(resultado.montoConsumidoUsd).toBe(100)
    expect(resultado.facturasAfectadas).toHaveLength(2)
    expect(resultado.facturasAfectadas).toEqual([
      { ventaId: 'venta-1', nroFactura: 'F-001', montoAplicadoUsd: 60 },
      { ventaId: 'venta-2', nroFactura: 'F-002', montoAplicadoUsd: 40 },
    ])
  })

  it('aislamiento multi-tenant: un pago_id de empresa A nunca expone el lote de empresa B', async () => {
    // El mock simula el comportamiento real de SQLite/Postgres: el WHERE
    // filtra por empresa_id, asi que si se consulta con la empresa
    // equivocada, la fila nunca aparece aunque el pago_id "adivinado" matchee.
    mockedGetAll.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (typeof sql === 'string' && sql.includes('FROM saf_creditos_lotes')) {
        const [origenId, empresaId] = params as [string, string]
        if (origenId === 'pago-empresa-a' && empresaId === 'emp-a') {
          return [{ id: 'lote-a', monto_original_usd: '100.00000000', saldo_disponible_usd: '100.00000000' }]
        }
        return []
      }
      return []
    })

    const resultadoCorrecto = await detectarLoteSafDePago('emp-a', 'pago-empresa-a')
    expect(resultadoCorrecto.generatedLote).toBe(true)
    expect(resultadoCorrecto.loteId).toBe('lote-a')

    const resultadoCruzado = await detectarLoteSafDePago('emp-b', 'pago-empresa-a')
    expect(resultadoCruzado.generatedLote).toBe(false)
    expect(resultadoCruzado.facturasAfectadas).toEqual([])

    // Ambas queries (lote + aplicaciones, cuando aplica) deben llevar
    // empresa_id como parametro — no-negociable, ver spec Requirement
    // "Multitenant isolation".
    for (const [sql, params] of mockedGetAll.mock.calls) {
      if (typeof sql === 'string' && sql.includes('FROM saf_creditos_lotes')) {
        expect(sql).toContain('AND empresa_id = ?')
        expect(params).toHaveLength(2)
      }
      if (typeof sql === 'string' && sql.includes('FROM saf_creditos_aplicaciones')) {
        expect(sql).toContain('empresa_id = ?')
      }
    }
  })

  it('aislamiento multi-tenant: la query de aplicaciones tambien filtra empresa_id (consumo del lote no cruza empresas)', async () => {
    mockedGetAll.mockImplementation(async (sql: unknown) => {
      if (typeof sql === 'string' && sql.includes('FROM saf_creditos_lotes')) {
        return [{ id: 'lote-1', monto_original_usd: '100', saldo_disponible_usd: '40' }] as never
      }
      if (typeof sql === 'string' && sql.includes('FROM saf_creditos_aplicaciones')) {
        return [{ venta_id: 'v1', nro_factura: 'F-001', monto_aplicado_usd: '60' }] as never
      }
      return [] as never
    })

    await detectarLoteSafDePago('emp-a', 'pago-con-lote')

    const callAplicaciones = mockedGetAll.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM saf_creditos_aplicaciones')
    )
    expect(callAplicaciones).toBeDefined()
    const [sqlAplic, paramsAplic] = callAplicaciones!
    expect(sqlAplic).toContain('empresa_id = ?')
    // params: [lote_id, empresa_id]
    expect(paramsAplic).toContain('emp-a')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// reversarPagoSafEnTx — COMPENSACION (slice 3b-ii de cxc-ledger-saldos-
// redesign). A diferencia de `detectarLoteSafDePago` (solo lectura, usa
// `db.getAll`), esta funcion MUTA dentro de la `tx` del llamador (recibida,
// nunca abre su propia `db.writeTransaction` — mismo patron que
// `consumirSafLotesEnTx`/`reversarDiferencialEnTx` en use-cxc.ts). Mock de
// `tx.execute` local, SIN pasar por `db.getAll` (esta funcion no usa el
// modulo `db` en absoluto).
// ─────────────────────────────────────────────────────────────────────────

describe('reversarPagoSafEnTx — compensacion sin mutar filas historicas (slice 3b-ii)', () => {
  function makeTx(opts: {
    lote?: { id: string; monto_original_usd: string; saldo_disponible_usd: string }
    aplicaciones?: Array<{ venta_id: string; nro_factura: string; monto_aplicado_usd: string }>
    saldoActual: string
    saldoPendienteUsd?: string
    safDisponible?: string
  }) {
    const calls: Call[] = []
    const aplicaciones = opts.aplicaciones ?? []
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        if (sql.includes('FROM saf_creditos_lotes') && sql.includes("origen_tipo = 'PAGO'")) {
          return opts.lote
            ? { rows: { length: 1, item: () => opts.lote } }
            : { rows: { length: 0, item: () => undefined } }
        }
        if (sql.includes('FROM saf_creditos_aplicaciones')) {
          return { rows: { length: aplicaciones.length, item: (i: number) => aplicaciones[i] } }
        }
        if (sql.includes('FROM clientes WHERE id = ? AND empresa_id = ?')) {
          return {
            rows: {
              length: 1,
              item: () => ({
                saldo_actual: opts.saldoActual,
                saldo_pendiente_usd: opts.saldoPendienteUsd ?? '0.00000000',
                saf_disponible: opts.safDisponible ?? '0.00000000',
              }),
            },
          }
        }
        return { rows: { length: 0, item: () => undefined } }
      }),
    } as unknown as Transaction
    return { tx, calls }
  }

  const baseParams = {
    pagoId: 'pago-1',
    empresaId: 'emp-1',
    clienteId: 'cliente-1',
    reversedBy: 'user-1',
    now: '2026-10-19T00:00:00-04:00',
  }

  it('3b-ii.1 — fully-consumed-single-venta ($100/1 venta, remanente=0): NO saf_creditos_reversas, exactamente 1 REV por $100, ventas.saldo_pend_usd sube $100', async () => {
    const { tx, calls } = makeTx({
      lote: { id: 'lote-1', monto_original_usd: '100.00000000', saldo_disponible_usd: '0.00000000' },
      aplicaciones: [{ venta_id: 'venta-1', nro_factura: 'F-001', monto_aplicado_usd: '100.00000000' }],
      saldoActual: '0.00000000',
    })

    await reversarPagoSafEnTx(tx, baseParams)

    const reversas = calls.filter((c) => c.sql.startsWith('INSERT INTO saf_creditos_reversas'))
    expect(reversas).toHaveLength(0)

    const movInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_cuenta'))
    expect(movInserts).toHaveLength(1)
    expect(movInserts[0]!.sql).toContain("'REV'")
    expect(movInserts[0]!.params).toContain(toStorageString(100))
    expect(movInserts[0]!.params).toContain('venta-1')

    const ventaUpdate = calls.find((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd'))
    expect(ventaUpdate).toBeDefined()
    expect(ventaUpdate!.params).toEqual([toStorageString(100), 'venta-1'])

    // Fully consumed (remanente=0): saldo_pendiente_usd sube el 100% ($100,
    // TODO fue reabierto como deuda real via REV); saf_disponible NO cambia
    // (sin rama SAFR) — unica UPDATE clientes de esta funcion.
    const clienteUpdates = calls.filter((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdates).toHaveLength(1)
    expect(clienteUpdates[0]!.sql).toContain('empresa_id')
    expect(clienteUpdates[0]!.params).toContain(toStorageString(100)) // saldo_pendiente_usd: 0 + 100
    expect(clienteUpdates[0]!.params).toContain(toStorageString(0)) // saf_disponible sin cambios (0 -> 0, sin SAFR)
  })

  it('3b-ii.2 — partial-consumption, ESCENARIO CANONICO (lote $100, $60 consumido, $40 remanente; cliente saldo_actual=20/saldo_pendiente_usd=0/saf_disponible=40): 1 saf_creditos_reversas (anulado=40) + 1 SAFR pareado (monto=40) + 1 REV por $60, UPDATE clientes termina en saldo_pendiente_usd=60 (NO 100/260) y saf_disponible=0', async () => {
    const { tx, calls } = makeTx({
      lote: { id: 'lote-2', monto_original_usd: '100.00000000', saldo_disponible_usd: '40.00000000' },
      aplicaciones: [{ venta_id: 'venta-1', nro_factura: 'F-001', monto_aplicado_usd: '60.00000000' }],
      saldoActual: '20.00000000',
      saldoPendienteUsd: '0.00000000',
      safDisponible: '40.00000000',
    })

    await reversarPagoSafEnTx(tx, baseParams)

    const revInsert = calls.find(
      (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'REV'")
    )
    expect(revInsert).toBeDefined()
    expect(revInsert!.params).toContain(toStorageString(60))
    expect(revInsert!.params).toContain('venta-1')

    const safrInsert = calls.find(
      (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAFR'")
    )
    expect(safrInsert).toBeDefined()
    expect(safrInsert!.params).toContain(toStorageString(40))

    const reversaInsert = calls.find((c) => c.sql.startsWith('INSERT INTO saf_creditos_reversas'))
    expect(reversaInsert).toBeDefined()
    expect(reversaInsert!.params).toContain('lote-2')
    expect(reversaInsert!.params).toContain('pago-1')
    expect(reversaInsert!.params).toContain(toStorageString(40))

    // EL BUG QUE SE ESTA CORRIGIENDO: antes de este fix, saldo_pendiente_usd
    // terminaba en 260 (triple-conteo con los steps 4/5 del llamador) o,
    // en aislamiento (sin la escritura optimista de esta funcion), nunca se
    // escribia. El valor CORRECTO, calculado SOLO con calcularSaldoPendienteClienteNuevo/
    // calcularSafDisponibleNuevo (nunca aritmetica inline), es:
    const esperadoSaldoPendiente = calcularSaldoPendienteClienteNuevo('REV', '0.00000000', '60.00000000')
    const esperadoSafDisponible = calcularSafDisponibleNuevo('SAFR', '40.00000000', '40.00000000')
    expect(toStorageString(esperadoSaldoPendiente)).toBe(toStorageString(60))
    expect(toStorageString(esperadoSafDisponible)).toBe(toStorageString(0))

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    expect(clienteUpdate!.sql).toContain('saldo_pendiente_usd')
    expect(clienteUpdate!.sql).toContain('saf_disponible')
    expect(clienteUpdate!.sql).toContain('empresa_id')
    expect(clienteUpdate!.params).toContain(toStorageString(esperadoSaldoPendiente))
    expect(clienteUpdate!.params).toContain(toStorageString(esperadoSafDisponible))
    // NUNCA 100 (monto_original completo) ni 260 (el bug de triple-conteo).
    expect(clienteUpdate!.params).not.toContain(toStorageString(100))
    expect(clienteUpdate!.params).not.toContain(toStorageString(260))
  })

  it('3b-ii.3 — multi-invoice ($100 consumido $60+$40 en 2 ventas, remanente=0): 2 REV (venta+monto correctos), NO saf_creditos_reversas', async () => {
    const { tx, calls } = makeTx({
      lote: { id: 'lote-3', monto_original_usd: '100.00000000', saldo_disponible_usd: '0.00000000' },
      aplicaciones: [
        { venta_id: 'venta-1', nro_factura: 'F-001', monto_aplicado_usd: '60.00000000' },
        { venta_id: 'venta-2', nro_factura: 'F-002', monto_aplicado_usd: '40.00000000' },
      ],
      saldoActual: '0.00000000',
    })

    await reversarPagoSafEnTx(tx, baseParams)

    const revInserts = calls.filter(
      (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'REV'")
    )
    expect(revInserts).toHaveLength(2)
    expect(revInserts[0]!.params).toContain('venta-1')
    expect(revInserts[0]!.params).toContain(toStorageString(60))
    expect(revInserts[1]!.params).toContain('venta-2')
    expect(revInserts[1]!.params).toContain(toStorageString(40))

    expect(calls.filter((c) => c.sql.startsWith('INSERT INTO saf_creditos_reversas'))).toHaveLength(0)
    expect(calls.filter((c) => c.sql.includes("'SAFR'"))).toHaveLength(0)

    const ventaUpdates = calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd'))
    expect(ventaUpdates).toHaveLength(2)

    // Ambos REV se acumulan sobre saldo_pendiente_usd (60+40=100, SUMA de
    // ambas facturas); sin rama SAFR (remanente=0), saf_disponible no cambia.
    const clienteUpdates = calls.filter((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdates).toHaveLength(1)
    expect(clienteUpdates[0]!.params).toContain(toStorageString(100)) // 0 + 60 + 40
    expect(clienteUpdates[0]!.params).toContain(toStorageString(0)) // saf_disponible sin cambios
  })

  it('3b-ii.4 — IMMUTABILIDAD: cero UPDATE/DELETE contra saf_creditos_lotes o saf_creditos_aplicaciones; unicas escrituras = INSERT saf_creditos_reversas + INSERT movimientos_cuenta (REV/SAFR) + UPDATE ventas.saldo_pend_usd + LA UNICA UPDATE clientes (escritura optimista pareada, slice 1b-style)', async () => {
    const { tx, calls } = makeTx({
      lote: { id: 'lote-2', monto_original_usd: '100.00000000', saldo_disponible_usd: '40.00000000' },
      aplicaciones: [{ venta_id: 'venta-1', nro_factura: 'F-001', monto_aplicado_usd: '60.00000000' }],
      saldoActual: '20.00000000',
      saldoPendienteUsd: '0.00000000',
      safDisponible: '40.00000000',
    })

    await reversarPagoSafEnTx(tx, baseParams)

    const writeCalls = calls.filter((c) => /^(INSERT|UPDATE|DELETE)/.test(c.sql))
    expect(writeCalls.length).toBeGreaterThan(0)

    for (const call of writeCalls) {
      const targetsLotesOrAplicaciones =
        call.sql.includes('saf_creditos_lotes') || call.sql.includes('saf_creditos_aplicaciones')
      if (targetsLotesOrAplicaciones) {
        // Las unicas apariciones permitidas de estas 2 tablas en escrituras
        // son CERO — las unicas queries que las mencionan deben ser los
        // SELECT de deteccion (no capturados por el regex INSERT/UPDATE/DELETE).
        expect(targetsLotesOrAplicaciones).toBe(false)
      }
      expect(call.sql.startsWith('UPDATE saf_creditos_lotes')).toBe(false)
      expect(call.sql.startsWith('DELETE FROM saf_creditos_lotes')).toBe(false)
      expect(call.sql.startsWith('UPDATE saf_creditos_aplicaciones')).toBe(false)
      expect(call.sql.startsWith('DELETE FROM saf_creditos_aplicaciones')).toBe(false)
    }

    // Enumeracion exhaustiva: cada escritura es EXACTAMENTE uno de los 4 tipos permitidos.
    for (const call of writeCalls) {
      const esInsertReversa = call.sql.startsWith('INSERT INTO saf_creditos_reversas')
      const esInsertMovimiento = call.sql.startsWith('INSERT INTO movimientos_cuenta')
      const esUpdateVenta = call.sql.startsWith('UPDATE ventas SET saldo_pend_usd')
      const esUpdateCliente = call.sql.startsWith('UPDATE clientes SET')
      expect(esInsertReversa || esInsertMovimiento || esUpdateVenta || esUpdateCliente).toBe(true)
    }

    // Y la UPDATE clientes debe ser EXACTAMENTE una (sole-writer contract).
    expect(writeCalls.filter((c) => c.sql.startsWith('UPDATE clientes SET'))).toHaveLength(1)
  })

  it('escritura optimista pareada UNICA sobre clientes: exactamente 1 UPDATE clientes, con saldo_pendiente_usd/saf_disponible calculados via calcularSaldoPendienteClienteNuevo/calcularSafDisponibleNuevo (NUNCA aritmetica inline) y empresa_id en el WHERE', async () => {
    const { tx, calls } = makeTx({
      lote: { id: 'lote-2', monto_original_usd: '100.00000000', saldo_disponible_usd: '40.00000000' },
      aplicaciones: [{ venta_id: 'venta-1', nro_factura: 'F-001', monto_aplicado_usd: '60.00000000' }],
      saldoActual: '20.00000000',
      saldoPendienteUsd: '0.00000000',
      safDisponible: '40.00000000',
    })

    await reversarPagoSafEnTx(tx, baseParams)

    const clienteUpdates = calls.filter((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdates).toHaveLength(1)

    const update = clienteUpdates[0]!
    expect(update.sql).toContain('WHERE id = ? AND empresa_id = ?')
    expect(update.params).toContain('cliente-1')
    expect(update.params).toContain('emp-1')

    const esperadoSaldoPendiente = toStorageString(
      calcularSaldoPendienteClienteNuevo('REV', '0.00000000', '60.00000000')
    )
    const esperadoSafDisponible = toStorageString(
      calcularSafDisponibleNuevo('SAFR', '40.00000000', '40.00000000')
    )
    expect(update.params).toContain(esperadoSaldoPendiente)
    expect(update.params).toContain(esperadoSafDisponible)
  })

  it('no-op: el pago no genero ningun lote SAF — cero escrituras', async () => {
    const { tx, calls } = makeTx({ lote: undefined, saldoActual: '0.00000000' })

    await reversarPagoSafEnTx(tx, baseParams)

    const writeCalls = calls.filter((c) => /^(INSERT|UPDATE|DELETE)/.test(c.sql))
    expect(writeCalls).toHaveLength(0)
  })

  it('net-zero: el monto consumido (reabierto via REV) mas el remanente anulado (via SAFR) suman EXACTAMENTE el monto_original_usd del lote — ningun dolar se pierde ni se duplica', async () => {
    const { tx, calls } = makeTx({
      lote: { id: 'lote-2', monto_original_usd: '100.00000000', saldo_disponible_usd: '40.00000000' },
      aplicaciones: [{ venta_id: 'venta-1', nro_factura: 'F-001', monto_aplicado_usd: '60.00000000' }],
      saldoActual: '0.00000000',
    })

    await reversarPagoSafEnTx(tx, baseParams)

    const revInsert = calls.find(
      (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'REV'")
    )
    const safrInsert = calls.find(
      (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAFR'")
    )
    expect(revInsert).toBeDefined()
    expect(safrInsert).toBeDefined()
    expect(revInsert!.params).toContain(toStorageString(60))
    expect(safrInsert!.params).toContain(toStorageString(40))

    // Monto reabierto (deuda restaurada, $60) + monto anulado (credito
    // destruido, $40) == monto_original_usd del lote ($100) — espejo
    // exacto del "worked example" de design.md Q4: nada se pierde ni se
    // duplica. Se verifica contra los montos REALES escritos por la funcion
    // (param[4] = monto en ambos INSERT movimientos_cuenta), no una constante.
    const revMontoStr = revInsert!.params[4] as string
    const safrMontoStr = safrInsert!.params[4] as string
    expect(Number(revMontoStr) + Number(safrMontoStr)).toBe(100)
  })

  it('3b-ii.5 — lote INTACTO (100% remanente, cero consumo): todo el credito se anula via SAFR, cero REV, cero UPDATE ventas; saf_disponible -> 0, saldo_pendiente_usd sin cambios', async () => {
    const { tx, calls } = makeTx({
      lote: { id: 'lote-3', monto_original_usd: '100.00000000', saldo_disponible_usd: '100.00000000' },
      aplicaciones: [],
      saldoActual: '0.00000000',
    })

    await reversarPagoSafEnTx(tx, baseParams)

    // Sin aplicaciones -> cero REV, cero UPDATE ventas.
    const revInserts = calls.filter(
      (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'REV'")
    )
    expect(revInserts).toHaveLength(0)
    const ventaUpdates = calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd'))
    expect(ventaUpdates).toHaveLength(0)

    // Todo el credito ($100) se anula via una fila SAFR + una reversa.
    const safrInserts = calls.filter(
      (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAFR'")
    )
    expect(safrInserts).toHaveLength(1)
    expect(safrInserts[0]!.params).toContain(toStorageString(100))
    const reversas = calls.filter((c) => c.sql.startsWith('INSERT INTO saf_creditos_reversas'))
    expect(reversas).toHaveLength(1)

    // UPDATE clientes: saf_disponible 100 -> 0, saldo_pendiente_usd sin cambios (0).
    const clienteUpdates = calls.filter((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdates).toHaveLength(1)
    expect(clienteUpdates[0]!.params).toContain(toStorageString(0)) // saf_disponible 100 -> 0 (y saldo_pendiente_usd sin cambios)
  })
})
