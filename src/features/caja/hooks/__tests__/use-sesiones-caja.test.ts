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

// nc-refund-sesion-caja-disponibilidad (correccion QA #3978): reimplementacion
// completa de `useSaldoSesionCaja` para converger byte-a-byte con la formula
// de `useSaldoEfectivoBimonetario` (use-cuadre.ts:859-958) — pagos por
// divisa filtrados por `venta_id IS NOT NULL`, movimientos por divisa
// filtrados por BLACKLIST `origen NOT IN ('VENTA','COBRO','PROPINA')` en vez
// de la WHITELIST anterior (que dejaba fuera 'VUELTO', use-ventas.ts:
// 856/1388/1410). El mock ya NO recibe totales agregados listos — recibe
// filas crudas (`ventasUsd`/`ventasBs` = total YA filtrado por venta_id,
// `movs` = filas de movimientos_metodo_cobro con `tipo`) y aplica la MISMA
// blacklist que la produccion, para que la simulacion sea fiel a las 5
// queries reales (apertura + pagosUsd + pagosBs + movsUsd + movsBs).
const BLACKLIST_ORIGENES = ['VENTA', 'COBRO', 'PROPINA']

describe('useSaldoSesionCaja — correccion QA #3978 (paridad con useSaldoEfectivoBimonetario)', () => {
  function setupSaldo(opts: {
    aperturaUsd?: string
    aperturaBs?: string
    ventasUsd?: number
    ventasBs?: number
    movs?: Array<{ origen: string; tipo: 'INGRESO' | 'EGRESO'; total_usd: number; total_bs: number }>
  }) {
    mockedUseQuery.mockImplementation(((sql: string) => {
      if (sql.includes('monto_apertura_usd, monto_apertura_bs FROM sesiones_caja')) {
        return {
          data: [{ monto_apertura_usd: opts.aperturaUsd ?? '0', monto_apertura_bs: opts.aperturaBs ?? '0' }],
          isLoading: false,
        }
      }
      if (sql.includes('FROM pagos p') && sql.includes("mo.codigo_iso = 'USD'")) {
        return { data: [{ total: opts.ventasUsd ?? 0 }], isLoading: false }
      }
      if (sql.includes('FROM pagos p') && sql.includes("mo.codigo_iso = 'VES'")) {
        return { data: [{ total: opts.ventasBs ?? 0 }], isLoading: false }
      }
      if (sql.includes('FROM movimientos_metodo_cobro mmc') && sql.includes("mo.codigo_iso = 'USD'")) {
        const rows = (opts.movs ?? []).filter((r) => !BLACKLIST_ORIGENES.includes(r.origen))
        const total_ing = rows.filter((r) => r.tipo === 'INGRESO').reduce((s, r) => s + r.total_usd, 0)
        const total_egr = rows.filter((r) => r.tipo === 'EGRESO').reduce((s, r) => s + r.total_usd, 0)
        return { data: [{ total_ing, total_egr }], isLoading: false }
      }
      if (sql.includes('FROM movimientos_metodo_cobro mmc') && sql.includes("mo.codigo_iso = 'VES'")) {
        const rows = (opts.movs ?? []).filter((r) => !BLACKLIST_ORIGENES.includes(r.origen))
        const total_ing = rows.filter((r) => r.tipo === 'INGRESO').reduce((s, r) => s + r.total_bs, 0)
        const total_egr = rows.filter((r) => r.tipo === 'EGRESO').reduce((s, r) => s + r.total_bs, 0)
        return { data: [{ total_ing, total_egr }], isLoading: false }
      }
      return { data: [], isLoading: false }
    }) as unknown as typeof useQuery)
  }

  it('resta el egreso NCR de saldoUsd y saldoBs (cross-sesion: pago original en otra sesion)', () => {
    setupSaldo({
      aperturaUsd: '1000',
      aperturaBs: '500',
      movs: [{ origen: 'NCR', tipo: 'EGRESO', total_usd: 50, total_bs: 30 }],
    })

    const { result } = renderHook(() => useSaldoSesionCaja('sesion-b'))

    expect(result.current.saldoUsd).toBe(950) // 1000 - 50
    expect(result.current.saldoBs).toBe(470) // 500 - 30
  })

  it('triangulacion: el saldo nunca queda negativo (floor en 0) cuando el egreso NCR excede la apertura', () => {
    setupSaldo({
      aperturaUsd: '30',
      movs: [{ origen: 'NCR', tipo: 'EGRESO', total_usd: 50, total_bs: 0 }],
    })

    const { result } = renderHook(() => useSaldoSesionCaja('sesion-b'))

    expect(result.current.saldoUsd).toBe(0) // max(0, 30 - 50)
  })

  it('la query de movimientos usa BLACKLIST (NOT IN VENTA/COBRO/PROPINA), no whitelist — NCR y VUELTO quedan incluidos por omision', () => {
    setupSaldo({ movs: [] })

    renderHook(() => useSaldoSesionCaja('sesion-b'))

    const movsCall = mockedUseQuery.mock.calls.find(([sql]) => (sql as string).includes('FROM movimientos_metodo_cobro mmc'))
    expect(movsCall?.[0]).toContain("NOT IN ('VENTA', 'COBRO', 'PROPINA')")
    expect(movsCall?.[0]).not.toContain("IN ('INGRESO_MANUAL'")
  })

  it('la query de pagos filtra venta_id IS NOT NULL (paridad con cuadre — excluye anticipos CxC sin factura)', () => {
    setupSaldo({ ventasUsd: 0, ventasBs: 0 })

    renderHook(() => useSaldoSesionCaja('sesion-b'))

    const pagosCalls = mockedUseQuery.mock.calls.filter(([sql]) => (sql as string).includes('FROM pagos p'))
    expect(pagosCalls).toHaveLength(2) // una query por divisa (USD, VES)
    for (const [sql] of pagosCalls) {
      expect(sql as string).toContain('p.venta_id IS NOT NULL')
    }
  })

  it('nc-refund-sesion-caja-disponibilidad: no resta dos veces el efectivo tras un reembolso NC TOTAL via Sesion de caja', () => {
    // Repro exacta del reporte de usuario:
    // Apertura: fondo Bs 1000, USD 10.
    // Venta Bs 500 pagada en efectivo Bs 500 -> luego reversada por una NC TOTAL.
    // El reintegro de esa NC se hizo "por Sesion de caja": genera un egreso NCR
    // de Bs 500 en movimientos_metodo_cobro. La venta reversada YA NO se filtra
    // por is_reversed (pagosData no lo filtraba ni antes ni ahora) — se cuenta
    // en ventasBs, y el egreso NCR (EGRESO, blacklist no lo excluye) la
    // neutraliza exactamente una vez.
    setupSaldo({
      aperturaUsd: '10',
      aperturaBs: '1000',
      ventasBs: 500,
      movs: [{ origen: 'NCR', tipo: 'EGRESO', total_usd: 0, total_bs: 500 }],
    })

    const { result } = renderHook(() => useSaldoSesionCaja('sesion-b'))

    expect(result.current.saldoBs).toBe(1000) // 1000 + 500 (venta) - 500 (NCR) = 1000, no 0 ni 500
    expect(result.current.saldoUsd).toBe(10)
  })

  // nc-refund-sesion-caja-disponibilidad (correccion QA #3978): el fix de una
  // linea original (quitar `is_reversed = 0`) dejaba useSaldoSesionCaja
  // DIVERGIDO de useSaldoEfectivoBimonetario (use-cuadre.ts:859-958) en dos
  // ejes estructurales — la whitelist de origenes de movimientos_metodo_cobro
  // (incompleta, le faltaba 'VUELTO') y la ausencia total de un filtro
  // `venta_id IS NOT NULL` en pagosData. Ambos ejes SI producian sobre-conteo
  // real (RED confirmado contra el codigo committeado a4bdeeb antes de esta
  // reimplementacion) — a diferencia de los escenarios REFUND_TESORERIA/SAFC
  // de la NC (tests siguientes), que YA daban el resultado correcto.
  it('resta el egreso VUELTO de saldoBs (gap real cerrado por la blacklist, use-cuadre.ts:904 ya lo restaba)', () => {
    // VUELTO es un origen REAL y vigente (use-ventas.ts:856/1388/1410,
    // cuadre-saldo-caja.tsx:49-50): dinero que sale fisicamente del cajon
    // como vuelto de una venta.
    setupSaldo({
      aperturaBs: '1000',
      movs: [{ origen: 'VUELTO', tipo: 'EGRESO', total_usd: 0, total_bs: 200 }],
    })

    const { result } = renderHook(() => useSaldoSesionCaja('sesion-b'))

    expect(result.current.saldoBs).toBe(800) // 1000 - 200 (vuelto entregado)
  })

  it('excluye el pago CxC "anticipo" (venta_id NULL) del total de ventas, paridad con cuadre (use-cxc.ts:996, use-cuadre.ts:884/899)', () => {
    // Evidencia: use-cxc.ts:996 inserta un pago de "abono global" con
    // `venta_id: null` cuando el monto cobrado excede lo pendiente de todas
    // las facturas del cliente (anticipo). La query real de produccion filtra
    // `p.venta_id IS NOT NULL` -> ese pago nunca llega a `ventasUsd`ya
    // filtrado que este mock recibe (representa el resultado YA correcto de
    // la query real, verificado por el test anterior de shape SQL).
    setupSaldo({
      aperturaBs: '1000',
      ventasBs: 80, // solo la porcion con venta_id (factura real); el anticipo (20) ya fue excluido por la query
      movs: [],
    })

    const { result } = renderHook(() => useSaldoSesionCaja('sesion-b'))

    expect(result.current.saldoBs).toBe(1080) // 1000 + 80, el anticipo NUNCA llega aqui
  })

  // Contra-evidencia del hallazgo QA #3978: la NC TOTAL reembolsada via
  // REFUND_TESORERIA con destino BANCO/CAJA_FUERTE (use-notas-credito.ts:
  // 1326-1369, escribirEgresoTesoreriaEnTx:313-359) NUNCA escribe en
  // `movimientos_metodo_cobro` — escribe en `movimientos_bancarios`/
  // `mov_caja_fuerte`, tablas de tesoreria completamente ajenas a esta
  // sesion. El efectivo de la venta original JAMAS salio del cajon de esta
  // sesion (el reembolso salio por otro riel) -> DEBE seguir contando como
  // disponible. cuadre (use-cuadre.ts) tampoco lo excluiria: no filtra
  // is_reversed y no tiene nada que restar sin un movimiento real. Un test
  // que esperara que la venta reversada DESAPAREZCA del saldo divergiria de
  // cuadre, no lo igualaria.
  it('venta reversada por NC reembolsada via banco/caja fuerte: el efectivo sigue disponible (nunca salio de esta sesion)', () => {
    setupSaldo({
      aperturaBs: '1000',
      ventasBs: 500, // venta reversada, is_reversed=1, pero pagosData nunca lo filtro
      movs: [], // REFUND_TESORERIA(BANCO/CAJA_FUERTE) no escribe aqui
    })

    const { result } = renderHook(() => useSaldoSesionCaja('sesion-b'))

    expect(result.current.saldoBs).toBe(1500) // 1000 + 500, NO 1000
  })

  // Mismo razonamiento para modalidad SALDO_FAVOR/COMPENSACION_VENTA (SAFC):
  // el remanente se liquida en `movimientos_cuenta` (saldo_actual del
  // cliente), nunca en `movimientos_metodo_cobro` de la sesion -> mismo
  // caso mecanico que el anterior desde la perspectiva de esta query.
  it('venta reversada por NC liquidada como credito a favor (SAFC): el efectivo sigue disponible (ningun cajon lo perdio)', () => {
    setupSaldo({
      aperturaBs: '1000',
      ventasBs: 500,
      movs: [],
    })

    const { result } = renderHook(() => useSaldoSesionCaja('sesion-b'))

    expect(result.current.saldoBs).toBe(1500)
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
