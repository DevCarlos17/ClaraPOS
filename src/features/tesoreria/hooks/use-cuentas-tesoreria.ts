import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import type { Banco } from '@/features/configuracion/hooks/use-bancos'
import type { CajaFuerte } from './use-caja-fuerte'

// ─── Interface unificada ─────────────────────────────────────

export interface CuentaTesoreria {
  id: string
  tipo: 'BANCO' | 'CAJA_FUERTE'
  nombre: string
  moneda_id: string
  moneda_codigo: string
  moneda_simbolo: string
  saldo_actual: string
  is_active: boolean
  detalle: Banco | CajaFuerte
}

interface Moneda {
  id: string
  codigo_iso: string
  simbolo: string
}

// ─── Hook principal ──────────────────────────────────────────

/**
 * Combina bancos activos y cajas_fuerte activas en una lista unificada.
 * Usa el patron split-query para que cada tabla dispare reactividad independiente.
 */
export function useCuentasTesoreria(): {
  cuentas: CuentaTesoreria[]
  bancos: Banco[]
  cajas: CajaFuerte[]
  isLoading: boolean
} {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data: bancosData, isLoading: loadingBancos } = useQuery(
    'SELECT * FROM bancos_empresa WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre_banco ASC',
    [empresaId]
  )

  const { data: cajasData, isLoading: loadingCajas } = useQuery(
    'SELECT * FROM caja_fuerte WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre ASC',
    [empresaId]
  )

  const { data: monedasData, isLoading: loadingMonedas } = useQuery(
    'SELECT id, codigo_iso, simbolo FROM monedas WHERE is_active = 1',
    []
  )

  const bancos = (bancosData ?? []) as Banco[]
  const cajas = (cajasData ?? []) as CajaFuerte[]
  const monedas = (monedasData ?? []) as Moneda[]

  const monedaMap = new Map(monedas.map((m) => [m.id, m]))

  const cuentasBancos: CuentaTesoreria[] = bancos.map((b) => {
    const moneda = monedaMap.get(b.moneda_id)
    return {
      id: b.id,
      tipo: 'BANCO',
      nombre: b.nombre_banco,
      moneda_id: b.moneda_id,
      moneda_codigo: moneda?.codigo_iso ?? '',
      moneda_simbolo: moneda?.simbolo ?? '$',
      saldo_actual: b.saldo_actual,
      is_active: b.is_active === 1,
      detalle: b,
    }
  })

  const cuentasCajas: CuentaTesoreria[] = cajas.map((c) => {
    const moneda = monedaMap.get(c.moneda_id)
    return {
      id: c.id,
      tipo: 'CAJA_FUERTE',
      nombre: c.nombre,
      moneda_id: c.moneda_id,
      moneda_codigo: moneda?.codigo_iso ?? '',
      moneda_simbolo: moneda?.simbolo ?? '$',
      saldo_actual: c.saldo_actual,
      is_active: true,
      detalle: c,
    }
  })

  return {
    cuentas: [...cuentasBancos, ...cuentasCajas],
    bancos,
    cajas,
    isLoading: loadingBancos || loadingCajas || loadingMonedas,
  }
}

// ─── Hook de bancos inactivos (solo lectura, Tesorería) ──────

/**
 * Bancos inactivos de la empresa actual, para la sección "Inactivos" de
 * Tesorería. Consulta SEPARADA de `useCuentasTesoreria` — NO alimenta los
 * modales de Traspaso/Movimiento manual/Enviar efectivo a caja (esos siguen
 * usando solo `cuentas` de `useCuentasTesoreria`, que filtra `is_active = 1`).
 */
export function useBancosInactivosTesoreria(): {
  cuentas: CuentaTesoreria[]
  isLoading: boolean
} {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data: bancosData, isLoading: loadingBancos } = useQuery(
    'SELECT * FROM bancos_empresa WHERE empresa_id = ? AND is_active = 0 ORDER BY nombre_banco ASC',
    [empresaId]
  )

  const { data: monedasData, isLoading: loadingMonedas } = useQuery(
    'SELECT id, codigo_iso, simbolo FROM monedas WHERE is_active = 1',
    []
  )

  const bancos = (bancosData ?? []) as Banco[]
  const monedas = (monedasData ?? []) as Moneda[]
  const monedaMap = new Map(monedas.map((m) => [m.id, m]))

  const cuentas: CuentaTesoreria[] = bancos.map((b) => {
    const moneda = monedaMap.get(b.moneda_id)
    return {
      id: b.id,
      tipo: 'BANCO',
      nombre: b.nombre_banco,
      moneda_id: b.moneda_id,
      moneda_codigo: moneda?.codigo_iso ?? '',
      moneda_simbolo: moneda?.simbolo ?? '$',
      saldo_actual: b.saldo_actual,
      is_active: false,
      detalle: b,
    }
  })

  return { cuentas, isLoading: loadingBancos || loadingMonedas }
}

// ─── Hook de conteos pendientes ──────────────────────────────

/**
 * Returns a Map<cuentaId, pendingCount> for all accounts in the empresa.
 * Uses aggregated COUNT queries — one for banks, one for cajitas.
 */
export function usePendingCounts(): Map<string, number> {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data: bancosCount } = useQuery(
    `SELECT banco_empresa_id AS cuenta_id, COUNT(*) AS cnt
     FROM movimientos_bancarios
     WHERE empresa_id = ? AND validado = 0 AND reversado = 0
     GROUP BY banco_empresa_id`,
    [empresaId]
  )

  const { data: cajasCount } = useQuery(
    `SELECT caja_fuerte_id AS cuenta_id, COUNT(*) AS cnt
     FROM mov_caja_fuerte
     WHERE empresa_id = ? AND validado = 0 AND reversado = 0
     GROUP BY caja_fuerte_id`,
    [empresaId]
  )

  const map = new Map<string, number>()
  ;((bancosCount ?? []) as { cuenta_id: string; cnt: number }[]).forEach((r) => {
    if (r.cnt > 0) map.set(r.cuenta_id, r.cnt)
  })
  ;((cajasCount ?? []) as { cuenta_id: string; cnt: number }[]).forEach((r) => {
    if (r.cnt > 0) map.set(r.cuenta_id, r.cnt)
  })
  return map
}
