// `reversarPagoEnTx` (slice 2a, `reverso-abono-directo-tesoreria-sin-saf`) es
// el cuerpo transaccional extraido de `registrarReversoAbono` para ser
// reutilizable por el futuro orquestador de reverso directo desde tesoreria
// (slice 2b-i), que abre SU PROPIA `db.writeTransaction` y necesita delegar
// la reversa de cada pago SIN abrir una tx anidada (wa-sqlite no soporta tx
// anidadas). Estos tests prueban el CONTRATO: `reversarPagoEnTx` ejecuta las
// statements de reversa contra la `tx` PROVISTA por el llamador y JAMAS
// llama `db.writeTransaction` — mismo patron de mock que
// `use-cxc.test.ts`/`reversa-pago-saf.test.ts` (importar `use-cxc.ts`
// requiere mockear `@/core/db/powersync/db` y los modulos de contabilidad
// para no construir un PowerSyncDatabase/Kysely real en el entorno de test).
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    writeTransaction: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('@/features/contabilidad/hooks/use-cuentas-config', () => ({
  cargarMapaCuentas: vi.fn(async () => ({})),
}))
vi.mock('@/features/contabilidad/lib/generar-asientos', () => ({
  generarAsientosPagoCxC: vi.fn(async () => undefined),
  reversarAsientos: vi.fn(async () => undefined),
  leerMonedaContable: vi.fn(async () => 'USD'),
}))
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))

import type { Transaction } from '@powersync/common'
import Decimal from 'decimal.js'
import { db } from '@/core/db/powersync/db'
import { reversarPagoSafEnTx } from '@/features/cxc/hooks/reversa-pago-saf'
import { toStorageString } from '@/lib/currency'
import { reversarPagoEnTx } from '../use-cxc'

const mockedDb = vi.mocked(db, true)

interface Call {
  sql: string
  params: unknown[]
}

vi.mock('@/features/cxc/hooks/reversa-pago-saf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/cxc/hooks/reversa-pago-saf')>()
  return {
    ...actual,
    reversarPagoSafEnTx: vi.fn(async () => undefined),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

function buildFakeTx(opts: {
  pagoMontoUsd: string
  saldoPendActual: string
  totalUsd: string
  saldoClienteActual: string
  ventaId?: string | null
}) {
  const calls: Call[] = []
  const tx = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (
        sql.startsWith('SELECT id, venta_id, cliente_id, monto_usd, is_reversed, tasa, monto, moneda_id FROM pagos')
      ) {
        return {
          rows: {
            length: 1,
            item: () => ({
              id: 'pago-ext-1',
              venta_id: opts.ventaId ?? 'venta-ext-1',
              cliente_id: 'cliente-ext-1',
              monto_usd: opts.pagoMontoUsd,
              is_reversed: 0,
              tasa: null,
              monto: null,
              moneda_id: null,
            }),
          },
        }
      }
      if (sql.startsWith('SELECT nro_factura, saldo_pend_usd, total_usd FROM ventas WHERE id = ?')) {
        return {
          rows: {
            length: 1,
            item: () => ({
              nro_factura: 'F-EXT-001',
              saldo_pend_usd: opts.saldoPendActual,
              total_usd: opts.totalUsd,
            }),
          },
        }
      }
      if (sql.startsWith('SELECT saldo_actual, saldo_pendiente_usd FROM clientes WHERE id = ?')) {
        return {
          rows: {
            length: 1,
            item: () => ({
              saldo_actual: opts.saldoClienteActual,
              saldo_pendiente_usd: '0',
            }),
          },
        }
      }
      if (sql.startsWith('SELECT id FROM libro_contable WHERE')) {
        return { rows: { length: 0, item: () => undefined } }
      }
      return { rows: { length: 0, item: () => undefined } }
    }),
  } as unknown as Transaction
  return { tx, calls }
}

/**
 * Mock STATEFUL de `tx` (a diferencia de `buildFakeTx`, que devuelve
 * siempre los mismos valores fijos): necesario para probar el fix de
 * doble-conteo (sdd/reverso-abono-tesoreria/design-fix-doble-saldo) porque
 * varios de los casos (fan-in global, ciclo abono-reverso repetido) deben
 * ver, en la SEGUNDA llamada a `reversarPagoEnTx` dentro de la MISMA `tx`,
 * el efecto YA escrito por la PRIMERA llamada (o por un `aplicarAbonoSimulado`
 * intercalado) — igual que en produccion, donde todo corre dentro de una
 * sola transaccion SQLite. `pagos`/`ventas`/`clientes` son mapas keyed por
 * id; el `state` devuelto es mutable y se lee en los asserts.
 */
function buildStatefulFakeTx(opts: {
  pagos: Record<
    string,
    {
      venta_id: string | null
      cliente_id: string
      monto_usd: string
      is_reversed?: number
      tasa?: string | null
      monto?: string | null
      moneda_id?: string | null
    }
  >
  ventas: Record<string, { nro_factura: string; saldo_pend_usd: string; total_usd: string }>
  clientes: Record<string, { saldo_actual: string; saldo_pendiente_usd: string }>
}) {
  const calls: Call[] = []
  const state = {
    pagos: Object.fromEntries(Object.entries(opts.pagos).map(([id, p]) => [id, { ...p }])),
    ventas: Object.fromEntries(Object.entries(opts.ventas).map(([id, v]) => [id, { ...v }])),
    clientes: Object.fromEntries(Object.entries(opts.clientes).map(([id, c]) => [id, { ...c }])),
  }
  const tx = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })

      if (
        sql.startsWith('SELECT id, venta_id, cliente_id, monto_usd, is_reversed, tasa, monto, moneda_id FROM pagos')
      ) {
        const pagoId = params[0] as string
        const p = state.pagos[pagoId]
        if (!p) return { rows: { length: 0, item: () => undefined } }
        return {
          rows: {
            length: 1,
            item: () => ({
              id: pagoId,
              venta_id: p.venta_id,
              cliente_id: p.cliente_id,
              monto_usd: p.monto_usd,
              is_reversed: p.is_reversed ?? 0,
              tasa: p.tasa ?? null,
              monto: p.monto ?? null,
              moneda_id: p.moneda_id ?? null,
            }),
          },
        }
      }

      if (sql.startsWith('UPDATE pagos SET is_reversed = 1')) {
        const pagoId = params[3] as string
        if (state.pagos[pagoId]) state.pagos[pagoId]!.is_reversed = 1
        return { rows: { length: 0, item: () => undefined } }
      }

      if (sql.startsWith('SELECT nro_factura, saldo_pend_usd, total_usd FROM ventas WHERE id = ?')) {
        const ventaId = params[0] as string
        const v = state.ventas[ventaId]
        if (!v) return { rows: { length: 0, item: () => undefined } }
        return {
          rows: {
            length: 1,
            item: () => ({ nro_factura: v.nro_factura, saldo_pend_usd: v.saldo_pend_usd, total_usd: v.total_usd }),
          },
        }
      }

      if (sql.startsWith('UPDATE ventas SET saldo_pend_usd = ?, estado = ? WHERE id = ?')) {
        const [saldoPend, , ventaId] = params as [string, string, string]
        if (state.ventas[ventaId]) state.ventas[ventaId]!.saldo_pend_usd = saldoPend
        return { rows: { length: 0, item: () => undefined } }
      }

      if (sql.startsWith('SELECT saldo_actual, saldo_pendiente_usd FROM clientes WHERE id = ?')) {
        const clienteId = params[0] as string
        const c = state.clientes[clienteId]
        if (!c) return { rows: { length: 0, item: () => undefined } }
        return {
          rows: {
            length: 1,
            item: () => ({ saldo_actual: c.saldo_actual, saldo_pendiente_usd: c.saldo_pendiente_usd }),
          },
        }
      }

      if (sql.startsWith('UPDATE clientes SET saldo_actual = ?, saldo_pendiente_usd = ?, updated_at = ? WHERE id = ?')) {
        const [saldoActual, saldoPend, , clienteId] = params as [string, string, string, string]
        state.clientes[clienteId] = { saldo_actual: saldoActual, saldo_pendiente_usd: saldoPend }
        return { rows: { length: 0, item: () => undefined } }
      }

      if (sql.startsWith('SELECT id FROM libro_contable WHERE')) {
        return { rows: { length: 0, item: () => undefined } }
      }

      return { rows: { length: 0, item: () => undefined } }
    }),
  } as unknown as Transaction
  return { tx, calls, state }
}

/**
 * Simula el efecto de saldo de un "abono" (registrarPagoFactura, FUERA del
 * alcance de Unit A — ver design, el abono forward no necesita tocarse)
 * sobre el `state` compartido, para poder construir el ciclo narrativo
 * completo abono->reverso->abono->reverso (TC2) sin reimplementar
 * `registrarPagoFactura` en el test.
 */
function aplicarAbonoSimulado(
  state: { ventas: Record<string, { saldo_pend_usd: string }>; clientes: Record<string, { saldo_actual: string; saldo_pendiente_usd: string }> },
  ventaId: string,
  clienteId: string,
  montoUsd: number
) {
  const venta = state.ventas[ventaId]!
  venta.saldo_pend_usd = toStorageString(Decimal.max(0, new Decimal(venta.saldo_pend_usd).minus(montoUsd)))
  const cliente = state.clientes[clienteId]!
  cliente.saldo_actual = toStorageString(Decimal.max(0, new Decimal(cliente.saldo_actual).minus(montoUsd)))
  cliente.saldo_pendiente_usd = toStorageString(Decimal.max(0, new Decimal(cliente.saldo_pendiente_usd).minus(montoUsd)))
}

describe('reversarPagoEnTx — fix doble-conteo saldo cliente (sdd/reverso-abono-tesoreria/design-fix-doble-saldo)', () => {
  it('TC1 retry/race: saldo_pend_usd YA restaurado al techo -> ventaDeltaReal=0 -> sin UPDATE clientes ni INSERT movimientos_cuenta', async () => {
    const { tx, calls, state } = buildStatefulFakeTx({
      pagos: { 'pago-tc1': { venta_id: 'venta-tc1', cliente_id: 'cliente-tc1', monto_usd: '1.00000000' } },
      ventas: { 'venta-tc1': { nro_factura: 'F-TC1-001', saldo_pend_usd: '1.00000000', total_usd: '1.00000000' } },
      clientes: { 'cliente-tc1': { saldo_actual: '1.00000000', saldo_pendiente_usd: '1.00000000' } },
    })

    await reversarPagoEnTx(tx, {
      pagoId: 'pago-tc1',
      empresaId: 'emp-tc1',
      reversedBy: 'user-tc1',
      reversedByNombre: 'Tester',
      reason: 'reverso duplicado (race)',
      now: '2026-01-01T00:00:00.000Z',
      generatedLote: false,
    })

    // La venta queda clampeada al mismo techo (total) — delta=0.
    expect(state.ventas['venta-tc1']!.saldo_pend_usd).toBe(toStorageString(1))
    // El cliente NO cambia: ni SELECT, ni UPDATE, ni INSERT de movimientos_cuenta.
    expect(state.clientes['cliente-tc1']!.saldo_actual).toBe('1.00000000')
    expect(calls.find((c) => c.sql.startsWith('SELECT saldo_actual, saldo_pendiente_usd FROM clientes'))).toBeUndefined()
    expect(calls.find((c) => c.sql.startsWith('UPDATE clientes SET saldo_actual'))).toBeUndefined()
    expect(calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_cuenta'))).toBeUndefined()
  })

  it('TC2 repro 4 pasos, camino normal (no-regresion): abono$1->reverso->abono$1->reverso -> factura y cliente ambos terminan en $1', async () => {
    const { tx, state } = buildStatefulFakeTx({
      pagos: {
        'pago-1': { venta_id: 'venta-tc2', cliente_id: 'cliente-tc2', monto_usd: '1.00000000' },
        'pago-2': { venta_id: 'venta-tc2', cliente_id: 'cliente-tc2', monto_usd: '1.00000000' },
      },
      // Estado inicial: el primer abono$1 ya se aplico (factura y cliente en 0).
      ventas: { 'venta-tc2': { nro_factura: 'F-TC2-001', saldo_pend_usd: '0.00000000', total_usd: '1.00000000' } },
      clientes: { 'cliente-tc2': { saldo_actual: '0.00000000', saldo_pendiente_usd: '0.00000000' } },
    })

    // reverso #1
    await reversarPagoEnTx(tx, {
      pagoId: 'pago-1',
      empresaId: 'emp-tc2',
      reversedBy: 'user-tc2',
      reversedByNombre: 'Tester',
      reason: 'reverso 1',
      now: '2026-01-01T00:00:00.000Z',
      generatedLote: false,
    })
    expect(state.ventas['venta-tc2']!.saldo_pend_usd).toBe(toStorageString(1))
    expect(state.clientes['cliente-tc2']!.saldo_actual).toBe(toStorageString(1))

    // abono$1 (segundo abono — registrarPagoFactura, fuera de alcance Unit A)
    aplicarAbonoSimulado(state, 'venta-tc2', 'cliente-tc2', 1)
    expect(state.ventas['venta-tc2']!.saldo_pend_usd).toBe(toStorageString(0))
    expect(state.clientes['cliente-tc2']!.saldo_actual).toBe(toStorageString(0))

    // reverso #2
    await reversarPagoEnTx(tx, {
      pagoId: 'pago-2',
      empresaId: 'emp-tc2',
      reversedBy: 'user-tc2',
      reversedByNombre: 'Tester',
      reason: 'reverso 2',
      now: '2026-01-01T00:00:01.000Z',
      generatedLote: false,
    })

    // Camino normal (sin drift): factura y cliente terminan en $1, NUNCA $2.
    expect(state.ventas['venta-tc2']!.saldo_pend_usd).toBe(toStorageString(1))
    expect(state.clientes['cliente-tc2']!.saldo_actual).toBe(toStorageString(1))
  })

  it('TC3 reverso directo simple sin drift: ventaDeltaReal=montoUsd (comportamiento identico al actual)', async () => {
    const { tx, state } = buildStatefulFakeTx({
      pagos: { 'pago-tc3': { venta_id: 'venta-tc3', cliente_id: 'cliente-tc3', monto_usd: '15.00000000' } },
      ventas: { 'venta-tc3': { nro_factura: 'F-TC3-001', saldo_pend_usd: '40.00000000', total_usd: '100.00000000' } },
      clientes: { 'cliente-tc3': { saldo_actual: '5.00000000', saldo_pendiente_usd: '40.00000000' } },
    })

    await reversarPagoEnTx(tx, {
      pagoId: 'pago-tc3',
      empresaId: 'emp-tc3',
      reversedBy: 'user-tc3',
      reversedByNombre: 'Tester',
      reason: 'reverso simple',
      now: '2026-01-01T00:00:00.000Z',
      generatedLote: false,
    })

    // 40+15=55 < 100 -> sin clamp -> delta=15=monto (comportamiento identico al actual)
    expect(state.ventas['venta-tc3']!.saldo_pend_usd).toBe(toStorageString(55))
    expect(state.clientes['cliente-tc3']!.saldo_actual).toBe(toStorageString(20))
  })

  it('TC4 fan-in global: 2 facturas (delta=0 y delta=30) -> incremento total del cliente=30, NUNCA 70', async () => {
    const { tx, state } = buildStatefulFakeTx({
      pagos: {
        'pago-a': { venta_id: 'venta-a', cliente_id: 'cliente-tc4', monto_usd: '40.00000000' },
        'pago-b': { venta_id: 'venta-b', cliente_id: 'cliente-tc4', monto_usd: '30.00000000' },
      },
      ventas: {
        // venta-a: ya restaurada (drift) -> saldo_pend_usd ya en el total -> delta=0
        'venta-a': { nro_factura: 'F-TC4-A', saldo_pend_usd: '40.00000000', total_usd: '40.00000000' },
        // venta-b: sin drift -> saldo_pend_usd + monto <= total -> delta=30=monto
        'venta-b': { nro_factura: 'F-TC4-B', saldo_pend_usd: '0.00000000', total_usd: '30.00000000' },
      },
      clientes: { 'cliente-tc4': { saldo_actual: '0.00000000', saldo_pendiente_usd: '0.00000000' } },
    })

    await reversarPagoEnTx(tx, {
      pagoId: 'pago-a',
      empresaId: 'emp-tc4',
      reversedBy: 'user-tc4',
      reversedByNombre: 'Tester',
      reason: 'reverso a',
      now: '2026-01-01T00:00:00.000Z',
      generatedLote: false,
    })
    await reversarPagoEnTx(tx, {
      pagoId: 'pago-b',
      empresaId: 'emp-tc4',
      reversedBy: 'user-tc4',
      reversedByNombre: 'Tester',
      reason: 'reverso b',
      now: '2026-01-01T00:00:01.000Z',
      generatedLote: false,
    })

    // Incremento total = SUM(ventaDeltaReal) = 0 + 30 = 30, NUNCA 40+30=70 (raw montos).
    expect(state.clientes['cliente-tc4']!.saldo_actual).toBe(toStorageString(30))
  })

  // TC5 (SAF-reversal intacto: generatedLote=true -> rama nueva nunca se
  // ejecuta, delega 100% a reversarPagoSafEnTx) ya esta cubierto por el test
  // "triangulacion: generatedLote=true delega en reversarPagoSafEnTx..." en
  // el describe de abajo — esa rama es mutuamente excluyente con el `if
  // (pago.venta_id)` del Step 3 (ver docstring en use-cxc.ts), por lo que
  // `ventaDeltaReal` (nuevo en este fix) nunca se calcula ni se usa ahi.
})

describe('reversarPagoEnTx — acepta tx externa, no abre su propio writeTransaction', () => {
  it('ejecuta la reversa contra la tx PROVISTA por el llamador y nunca llama db.writeTransaction', async () => {
    const { tx, calls } = buildFakeTx({
      pagoMontoUsd: '15.00000000',
      saldoPendActual: '40.00000000',
      totalUsd: '100.00000000',
      saldoClienteActual: '0.00000000',
    })

    await reversarPagoEnTx(tx, {
      pagoId: 'pago-ext-1',
      empresaId: 'emp-ext-1',
      reversedBy: 'user-ext-1',
      reversedByNombre: 'Supervisor Test',
      reason: 'Reverso directo desde tesoreria (test)',
      now: '2026-01-01T00:00:00.000Z',
      generatedLote: false,
    })

    // Contrato (slice 2a): jamas abre su propia tx — toda la escritura va
    // contra la `tx` provista por el llamador (mock inyectado directamente,
    // nunca via `mockedDb.writeTransaction`). Este assert es el que
    // falla si alguien reintroduce un `db.writeTransaction` dentro de
    // `reversarPagoEnTx` (tx anidada, no soportada por wa-sqlite).
    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()

    // Prueba de comportamiento real: la mutacion de reversa SI corrio contra
    // la tx provista (UPDATE pagos marca is_reversed=1 con los datos exactos
    // pasados por params).
    const pagoUpdate = calls.find((c) => c.sql.startsWith('UPDATE pagos SET is_reversed = 1'))
    expect(pagoUpdate).toBeDefined()
    expect(pagoUpdate!.params).toEqual([
      '2026-01-01T00:00:00.000Z',
      'user-ext-1',
      'Reverso directo desde tesoreria (test)',
      'pago-ext-1',
    ])

    const ventaUpdate = calls.find((c) =>
      c.sql.startsWith('UPDATE ventas SET saldo_pend_usd = ?, estado = ? WHERE id = ?')
    )
    expect(ventaUpdate).toBeDefined()
    // 40 + 15 = 55 < 100
    expect(ventaUpdate!.params).toEqual([toStorageString(55), 'reversado', 'venta-ext-1'])
  })

  it('triangulacion: generatedLote=true delega en reversarPagoSafEnTx(tx,...) contra la MISMA tx, y nunca llama db.writeTransaction', async () => {
    const { tx, calls } = buildFakeTx({
      pagoMontoUsd: '15.00000000',
      saldoPendActual: '40.00000000',
      totalUsd: '100.00000000',
      saldoClienteActual: '0.00000000',
      ventaId: null,
    })

    await reversarPagoEnTx(tx, {
      pagoId: 'pago-ext-1',
      empresaId: 'emp-ext-1',
      reversedBy: 'user-ext-1',
      reversedByNombre: 'Supervisor Test',
      reason: 'Reverso directo desde tesoreria (test, con lote SAF)',
      now: '2026-01-01T00:00:00.000Z',
      generatedLote: true,
    })

    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()
    expect(reversarPagoSafEnTx).toHaveBeenCalledTimes(1)
    // La compensacion SAF recibe la MISMA `tx` provista al llamador (primer
    // arg), nunca una tx nueva.
    expect(vi.mocked(reversarPagoSafEnTx).mock.calls[0]![0]).toBe(tx)
    expect(vi.mocked(reversarPagoSafEnTx).mock.calls[0]![1]).toMatchObject({
      pagoId: 'pago-ext-1',
      empresaId: 'emp-ext-1',
      clienteId: 'cliente-ext-1',
      reversedBy: 'user-ext-1',
      now: '2026-01-01T00:00:00.000Z',
    })

    // Cuando generatedLote=true, el path normal (Steps 4/5: UPDATE clientes
    // + INSERT REV generico) queda OMITIDO — reversarPagoSafEnTx es la UNICA
    // escritora de los efectos de saldo (contrato documentado en
    // reversa-pago-saf.ts).
    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET saldo_actual'))
    expect(clienteUpdate).toBeUndefined()
  })
})
