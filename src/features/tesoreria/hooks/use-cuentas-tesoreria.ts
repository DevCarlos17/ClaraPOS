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
