// nc-cuadre-sesion-fase2 (Slice 2): mismo patron de mock que
// `use-notas-credito.test.ts` — `db.writeTransaction` mockeado a nivel de
// modulo para que `cerrarSesionCaja` no construya una PowerSyncDatabase real.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    execute: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))
// `useSaldoSesionCaja` usa `useQuery` de `@powersync/react` directamente —
// mismo patron aislado que `use-facturas-sesion-activa.test.ts`.
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))
// El modulo tambien exporta hooks (`useSesionesActivas`, etc.) que llaman
// `useCurrentUser`, que a su vez importa `useAuth` de `auth-provider` (crea
// un cliente Supabase real al importarse). No se ejercitan en estos tests
// pero el modulo completo se carga al importar — se mockea por seguridad,
// mismo patron que 30+ tests existentes en el repo.
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

import type { Transaction } from '@powersync/common'
import { renderHook } from '@testing-library/react'
import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import Decimal from 'decimal.js'
import { cerrarSesionCaja, useSaldoSesionCaja, useSesionesActivas } from '../use-sesiones-caja'

const mockedDb = vi.mocked(db, true)
const mockedUseQuery = vi.mocked(useQuery)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

interface Call {
  sql: string
  params: unknown[]
}

interface CerrarSesionFixtures {
  sesion: { status: string; monto_apertura_usd: string; monto_apertura_bs: string; empresa_id: string }
  pagosEfectivoUsd?: number
  pagosEfectivoBs?: number
  /** Filas de `movimientos_metodo_cobro` agrupadas por origen (query 3a/3b). */
  movsManualUsd?: Array<{ origen: string; total: number }>
  movsManualBs?: Array<{ origen: string; total: number }>
  metodosUsados?: Array<{
    metodo_cobro_id: string
    moneda_id: string
    moneda_codigo: string
    total_pagos: number
    num_transacciones: number
  }>
  /** Movimientos crudos por metodo (query del desglose, agrupados en el mock por metodo_cobro_id). */
  movsManualPorMetodo?: Array<{ metodo_cobro_id: string; origen: string; tipo: 'INGRESO' | 'EGRESO'; monto: number }>
  safTotal?: number
  safCount?: number
  metodosConLotes?: string[]
}

/**
 * Simula la unica `db.writeTransaction` de `cerrarSesionCaja` — captura cada
 * `tx.execute(sql, params)`. A diferencia de `mockCrearNcrTx`
 * (use-notas-credito.test.ts), las queries que dependen de la whitelist de
 * `origen` (`movsManualUsd/Bs`, `movsManualPorMetodo`) FILTRAN las filas del
 * fixture segun si el string SQL real contiene el literal `'ORIGEN'` — esto
 * simula el comportamiento real de un `WHERE origen IN (...)` sin necesitar
 * un motor SQL real, y es lo que hace que el test falle en RED (SQL sin
 * `'NCR'`) y pase en GREEN (SQL con `'NCR'`).
 */
function mockCerrarSesionTx(opts: CerrarSesionFixtures) {
  const calls: Call[] = []
  mockedDb.writeTransaction.mockImplementation(async (callback) => {
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })

        if (sql.includes('FROM sesiones_caja WHERE id = ?')) {
          return { rows: { length: 1, item: () => opts.sesion } }
        }

        // metodosUsadosResult (desglose por metodo) — chequear ANTES que las
        // queries genericas `FROM pagos p`, con las que colisiona.
        if (sql.includes('GROUP BY p.metodo_cobro_id')) {
          const rows = opts.metodosUsados ?? []
          return { rows: { length: rows.length, item: (i: number) => rows[i] } }
        }

        if (sql.includes('FROM pagos p') && sql.includes("mo.codigo_iso = 'USD'")) {
          return { rows: { length: 1, item: () => ({ total: opts.pagosEfectivoUsd ?? 0 }) } }
        }
        if (sql.includes('FROM pagos p') && sql.includes("mo.codigo_iso = 'VES'")) {
          return { rows: { length: 1, item: () => ({ total: opts.pagosEfectivoBs ?? 0 }) } }
        }

        if (sql.includes('FROM movimientos_metodo_cobro mmc') && sql.includes("mo.codigo_iso = 'USD'")) {
          const rows = (opts.movsManualUsd ?? []).filter((r) => sql.includes(`'${r.origen}'`))
          return { rows: { length: rows.length, item: (i: number) => rows[i] } }
        }
        if (sql.includes('FROM movimientos_metodo_cobro mmc') && sql.includes("mo.codigo_iso = 'VES'")) {
          const rows = (opts.movsManualBs ?? []).filter((r) => sql.includes(`'${r.origen}'`))
          return { rows: { length: rows.length, item: (i: number) => rows[i] } }
        }

        // movsManualPorMetodoResult (desglose sesiones_caja_detalle)
        if (sql.includes('GROUP BY metodo_cobro_id')) {
          const movs = (opts.movsManualPorMetodo ?? []).filter((m) => sql.includes(`'${m.origen}'`))
          const byMetodo = new Map<string, { ingreso: number; egreso: number }>()
          for (const m of movs) {
            const cur = byMetodo.get(m.metodo_cobro_id) ?? { ingreso: 0, egreso: 0 }
            if (m.tipo === 'INGRESO') cur.ingreso += m.monto
            else cur.egreso += m.monto
            byMetodo.set(m.metodo_cobro_id, cur)
          }
          const rows = Array.from(byMetodo.entries()).map(([metodo_cobro_id, v]) => ({
            metodo_cobro_id,
            total_ingreso: v.ingreso,
            total_egreso: v.egreso,
          }))
          return { rows: { length: rows.length, item: (i: number) => rows[i] } }
        }

        if (sql.startsWith('INSERT OR IGNORE INTO sesiones_caja_detalle')) {
          return { rows: { length: 0, item: () => undefined } }
        }

        if (sql.includes("tipo = 'SAF'")) {
          return {
            rows: { length: 1, item: () => ({ saf_total: opts.safTotal ?? 0, saf_count: opts.safCount ?? 0 }) },
          }
        }

        if (sql.includes('FROM lotes_pos_cuadre')) {
          const rows = (opts.metodosConLotes ?? []).map((mid) => ({ metodo_cobro_id: mid }))
          return { rows: { length: rows.length, item: (i: number) => rows[i] } }
        }

        if (sql.startsWith('UPDATE sesiones_caja SET')) {
          return { rows: { length: 0, item: () => undefined } }
        }

        throw new Error(`Query no mockeada en mockCerrarSesionTx: ${sql}`)
      }),
    }
    await callback(tx as unknown as Transaction)
  })
  return calls
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('cerrarSesionCaja — Slice 2 (nc-cuadre-sesion-fase2: whitelist NCR en cuadre)', () => {
  it('resta el egreso NCR del total del sistema en USD (montoSistemaUsdFromDB) — cross-sesion, sin metodos con pagos', async () => {
    const calls = mockCerrarSesionTx({
      sesion: { status: 'ABIERTA', monto_apertura_usd: '1000', monto_apertura_bs: '0', empresa_id: 'empresa-1' },
      pagosEfectivoUsd: 200,
      pagosEfectivoBs: 0,
      movsManualUsd: [{ origen: 'NCR', total: 50 }],
      metodosUsados: [],
      movsManualPorMetodo: [],
    })

    await cerrarSesionCaja('sesion-b', {
      monto_fisico_usd: 1150,
      usuario_cierre_id: 'user-1',
    })

    const updateCall = calls.find((c) => c.sql.startsWith('UPDATE sesiones_caja SET'))
    expect(updateCall).toBeDefined()
    // Orden de params del UPDATE: usuario, fecha, monto_sistema_usd, ...
    const montoSistemaUsd = updateCall!.params[2] as string
    expect(new Decimal(montoSistemaUsd).toNumber()).toBe(1150) // 1000 + 200 - 50 (NCR restado)
  })

  it('sesiones_caja_detalle refleja el egreso NCR restado del metodo correspondiente', async () => {
    const calls = mockCerrarSesionTx({
      sesion: { status: 'ABIERTA', monto_apertura_usd: '0', monto_apertura_bs: '0', empresa_id: 'empresa-1' },
      pagosEfectivoUsd: 0,
      pagosEfectivoBs: 0,
      movsManualUsd: [],
      metodosUsados: [
        {
          metodo_cobro_id: 'metodo-efectivo-usd',
          moneda_id: 'moneda-usd',
          moneda_codigo: 'USD',
          total_pagos: 0,
          num_transacciones: 1,
        },
      ],
      movsManualPorMetodo: [{ metodo_cobro_id: 'metodo-efectivo-usd', origen: 'NCR', tipo: 'EGRESO', monto: 50 }],
    })

    await cerrarSesionCaja('sesion-b', {
      monto_fisico_usd: 0,
      usuario_cierre_id: 'user-1',
    })

    const detalleCall = calls.find(
      (c) =>
        c.sql.startsWith('INSERT OR IGNORE INTO sesiones_caja_detalle') && c.params[2] === 'metodo-efectivo-usd'
    )
    expect(detalleCall).toBeDefined()
    // Orden de params del INSERT: id, sesion_caja_id, metodo_cobro_id, moneda_id, total_sistema, ...
    const totalSistema = detalleCall!.params[4] as string
    expect(new Decimal(totalSistema).toNumber()).toBe(-50) // 0 (pagos) - 50 (egreso NCR)
  })
})

describe('useSaldoSesionCaja — Slice 2 (nc-cuadre-sesion-fase2: whitelist NCR + resta explicita)', () => {
  function setupSaldo(opts: {
    aperturaUsd?: string
    aperturaBs?: string
    ventasUsd?: number
    ventasBs?: number
    movs?: Array<{ origen: string; total_usd: number; total_bs: number }>
  }) {
    mockedUseQuery.mockImplementation(((sql: string) => {
      if (sql.includes('monto_apertura_usd, monto_apertura_bs FROM sesiones_caja')) {
        return {
          data: [{ monto_apertura_usd: opts.aperturaUsd ?? '0', monto_apertura_bs: opts.aperturaBs ?? '0' }],
          isLoading: false,
        }
      }
      if (sql.includes('FROM pagos p')) {
        // nc-refund-sesion-caja-disponibilidad: el mock simula el WHERE real —
        // si la query todavia filtra `p.is_reversed = 0`, una venta reversada
        // (is_reversed = 1) queda excluida y sus ventas_usd/ventas_bs son 0.
        const filtraReversed = sql.includes('p.is_reversed = 0')
        const ventas = filtraReversed
          ? { usd: 0, bs: 0 }
          : { usd: opts.ventasUsd ?? 0, bs: opts.ventasBs ?? 0 }
        return { data: [{ ventas_usd: ventas.usd, ventas_bs: ventas.bs }], isLoading: false }
      }
      if (sql.includes('FROM movimientos_metodo_cobro mmc')) {
        const rows = (opts.movs ?? []).filter((r) => sql.includes(`'${r.origen}'`))
        return { data: rows, isLoading: false }
      }
      return { data: [], isLoading: false }
    }) as unknown as typeof useQuery)
  }

  it('resta el egreso NCR de saldoUsd y saldoBs (cross-sesion: pago original en otra sesion)', () => {
    setupSaldo({
      aperturaUsd: '1000',
      aperturaBs: '500',
      movs: [{ origen: 'NCR', total_usd: 50, total_bs: 30 }],
    })

    const { result } = renderHook(() => useSaldoSesionCaja('sesion-b'))

    expect(result.current.saldoUsd).toBe(950) // 1000 - 50
    expect(result.current.saldoBs).toBe(470) // 500 - 30
  })

  it('triangulacion: el saldo nunca queda negativo (floor en 0) cuando el egreso NCR excede la apertura', () => {
    setupSaldo({
      aperturaUsd: '30',
      movs: [{ origen: 'NCR', total_usd: 50, total_bs: 0 }],
    })

    const { result } = renderHook(() => useSaldoSesionCaja('sesion-b'))

    expect(result.current.saldoUsd).toBe(0) // max(0, 30 - 50)
  })

  it('la query de movimientos incluye NCR en el WHERE origen IN (...) (edicion 2.4a)', () => {
    setupSaldo({ movs: [] })

    renderHook(() => useSaldoSesionCaja('sesion-b'))

    const movsCall = mockedUseQuery.mock.calls.find(([sql]) => (sql as string).includes('FROM movimientos_metodo_cobro mmc'))
    expect(movsCall?.[0]).toContain("'NCR'")
  })

  it('nc-refund-sesion-caja-disponibilidad: no resta dos veces el efectivo tras un reembolso NC TOTAL via Sesion de caja', () => {
    // Repro exacta del reporte de usuario:
    // Apertura: fondo Bs 1000, USD 10.
    // Venta Bs 500 pagada en efectivo Bs 500 -> luego reversada por una NC TOTAL.
    // El reintegro de esa NC se hizo "por Sesion de caja": genera un egreso NCR
    // de Bs 500 en movimientos_metodo_cobro.
    // La venta reversada (is_reversed = 1) queda excluida de pagosData (ventas_bs = 0),
    // y el egreso NCR resta 500 de la apertura. Antes del fix, pagosData YA
    // excluia la venta (ventas_bs = 0) por el filtro is_reversed = 0, mientras el
    // egreso NCR restaba 500 de nuevo -> doble resta (1000 - 500 = 500, o peor,
    // 0 si tambien se contaba la apertura sin la venta). El fix elimina el
    // filtro is_reversed = 0 de pagosData: la venta reversada SI se cuenta en
    // ventasBs, y el egreso NCR la neutraliza exactamente una vez.
    setupSaldo({
      aperturaUsd: '10',
      aperturaBs: '1000',
      ventasBs: 500,
      movs: [{ origen: 'NCR', total_usd: 0, total_bs: 500 }],
    })

    const { result } = renderHook(() => useSaldoSesionCaja('sesion-b'))

    expect(result.current.saldoBs).toBe(1000) // 1000 + 500 (venta) - 500 (NCR) = 1000, no 0 ni 500
    expect(result.current.saldoUsd).toBe(10)
  })
})

describe('useSesionesActivas — Ajuste UX post-QA #1 (nc-admin-saldo-disponible-sesion): nombre del usuario que abrio la sesion', () => {
  it('la query de sesiones activas hace JOIN a usuarios y expone usuario_apertura_nombre en cada sesion', () => {
    mockedUseCurrentUser.mockReturnValue({
      user: { id: 'user-1', empresa_id: 'empresa-1' },
      loading: false,
    } as never)
    mockedUseQuery.mockImplementation(((sql: string) => {
      if (sql.includes('FROM sesiones_caja')) {
        return {
          data: [
            {
              id: 'sesion-1',
              caja_id: 'caja-1',
              usuario_apertura_id: 'user-1',
              usuario_apertura_nombre: 'Maria Perez',
            },
          ],
          isLoading: false,
        }
      }
      if (sql.includes('FROM cajas')) {
        return { data: [{ id: 'caja-1', nombre: 'Caja 1' }], isLoading: false }
      }
      return { data: [], isLoading: false }
    }) as unknown as typeof useQuery)

    const { result } = renderHook(() => useSesionesActivas())

    const sesionesCall = mockedUseQuery.mock.calls.find(([sql]) => (sql as string).includes('FROM sesiones_caja'))
    expect(sesionesCall?.[0]).toContain('JOIN usuarios')
    expect(result.current.sesiones[0]?.usuario_apertura_nombre).toBe('Maria Perez')
  })
})
