import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Interfaces ─────────────────────────────────────────────

export interface CxcKpis {
  deudaTotalUsd: number
  clientesConDeuda: number
  sobreLimite: number
}

export interface AntiguedadBucket {
  bucket: string
  facturas: number
  totalUsd: number
}

export interface TopDeudor {
  nombre: string
  identificacion: string
  saldoActual: number
  limiteCredito: number
}

export interface UtilizacionCreditoItem {
  nombre: string
  saldoActual: number
  limiteCredito: number
  porcentaje: number
}

export interface MovimientoCxc {
  id: string
  fecha: string
  cliente_nombre: string
  tipo: string
  referencia: string
  monto: string
  saldo_nuevo: string
}

// ─── KPIs (snapshot actual, sin rango de fechas) ────────────

export function useCxcKpis() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  // Deuda re-sourced desde SUM(ventas.saldo_pend_usd), nunca desde el
  // clientes.saldo_actual neteado (ver spec cxc-deuda-lectura).
  const { data, isLoading } = useQuery(
    `SELECT
       COALESCE(SUM(deuda_usd), 0) as deuda_total,
       SUM(CASE WHEN deuda_usd > 0.01 THEN 1 ELSE 0 END) as con_deuda,
       SUM(CASE WHEN CAST(limite_credito_usd AS REAL) > 0 AND deuda_usd > CAST(limite_credito_usd AS REAL) THEN 1 ELSE 0 END) as sobre_limite
     FROM (
       SELECT c.limite_credito_usd,
         COALESCE((SELECT SUM(CAST(v.saldo_pend_usd AS REAL)) FROM ventas v WHERE v.cliente_id = c.id AND CAST(v.saldo_pend_usd AS REAL) > 0.001), 0) as deuda_usd
       FROM clientes c
       WHERE c.empresa_id = ? AND c.is_active = 1
     ) t`,
    [empresaId]
  )

  const row = (data?.[0] ?? {}) as { deuda_total: number; con_deuda: number; sobre_limite: number }

  return {
    deudaTotalUsd: Number(Number(row.deuda_total ?? 0).toFixed(2)),
    clientesConDeuda: Number(row.con_deuda ?? 0),
    sobreLimite: Number(row.sobre_limite ?? 0),
    isLoading,
  }
}

// ─── Cobros del Periodo ─────────────────────────────────────

export function useCobrosDelPeriodo(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT COALESCE(SUM(CAST(monto_usd AS REAL)), 0) as total
     FROM pagos
     WHERE empresa_id = ? AND SUBSTR(fecha, 1, 10) >= ? AND SUBSTR(fecha, 1, 10) <= ?`,
    [empresaId, fechaDesde, fechaHasta]
  )

  const total = Number((data?.[0] as { total: number })?.total ?? 0)

  return { cobrosUsd: Number(total.toFixed(2)), isLoading }
}

// ─── Antiguedad de Saldos (snapshot actual) ─────────────────

export function useAntiguedadSaldos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       v.id,
       v.fecha,
       CAST(v.saldo_pend_usd AS REAL) as saldo_pend
     FROM ventas v
     WHERE v.empresa_id = ? AND CAST(v.saldo_pend_usd AS REAL) > 0.01 AND v.status != 'ANULADA'`,
    [empresaId]
  )

  const now = Date.now()
  const buckets: AntiguedadBucket[] = [
    { bucket: '0-30 dias', facturas: 0, totalUsd: 0 },
    { bucket: '31-60 dias', facturas: 0, totalUsd: 0 },
    { bucket: '61-90 dias', facturas: 0, totalUsd: 0 },
    { bucket: '90+ dias', facturas: 0, totalUsd: 0 },
  ]

  for (const row of (data ?? []) as { id: string; fecha: string; saldo_pend: number }[]) {
    const fechaMs = new Date(row.fecha).getTime()
    const dias = Math.floor((now - fechaMs) / (1000 * 60 * 60 * 24))
    const saldo = Number(row.saldo_pend)

    let idx: number
    if (dias <= 30) idx = 0
    else if (dias <= 60) idx = 1
    else if (dias <= 90) idx = 2
    else idx = 3

    buckets[idx].facturas++
    buckets[idx].totalUsd = Number((buckets[idx].totalUsd + saldo).toFixed(2))
  }

  return { buckets, isLoading }
}

// ─── Top 10 Deudores (snapshot actual) ──────────────────────

export function useTopDeudores(limit = 10) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  // Deuda re-sourced desde SUM(ventas.saldo_pend_usd), nunca desde el
  // clientes.saldo_actual neteado (ver spec cxc-deuda-lectura). Se alias como
  // saldo_actual para no tocar el mapeo de abajo (TopDeudor.saldoActual).
  const { data, isLoading } = useQuery(
    `SELECT nombre, identificacion, limite_credito_usd, deuda_usd as saldo_actual
     FROM (
       SELECT c.nombre, c.identificacion, c.limite_credito_usd,
         COALESCE((SELECT SUM(CAST(v.saldo_pend_usd AS REAL)) FROM ventas v WHERE v.cliente_id = c.id AND CAST(v.saldo_pend_usd AS REAL) > 0.001), 0) as deuda_usd
       FROM clientes c
       WHERE c.empresa_id = ? AND c.is_active = 1
     ) t
     WHERE deuda_usd > 0.01
     ORDER BY deuda_usd DESC
     LIMIT ${limit}`,
    [empresaId]
  )

  const items: TopDeudor[] = (data ?? []).map((row: Record<string, unknown>) => ({
    nombre: String(row.nombre ?? ''),
    identificacion: String(row.identificacion ?? ''),
    saldoActual: Number(Number(row.saldo_actual ?? 0).toFixed(2)),
    limiteCredito: Number(Number(row.limite_credito_usd ?? 0).toFixed(2)),
  }))

  return { deudores: items, isLoading }
}

// ─── Utilizacion de Credito (snapshot actual) ───────────────

export function useUtilizacionCredito(limit = 10) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  // Deuda re-sourced desde SUM(ventas.saldo_pend_usd), nunca desde el
  // clientes.saldo_actual neteado (ver spec cxc-deuda-lectura). Se alias como
  // saldo_actual para no tocar el mapeo de abajo (UtilizacionCreditoItem.saldoActual).
  const { data, isLoading } = useQuery(
    `SELECT nombre, limite_credito_usd, deuda_usd as saldo_actual
     FROM (
       SELECT c.nombre, c.limite_credito_usd,
         COALESCE((SELECT SUM(CAST(v.saldo_pend_usd AS REAL)) FROM ventas v WHERE v.cliente_id = c.id AND CAST(v.saldo_pend_usd AS REAL) > 0.001), 0) as deuda_usd
       FROM clientes c
       WHERE c.empresa_id = ? AND c.is_active = 1
     ) t
     WHERE CAST(limite_credito_usd AS REAL) > 0 AND deuda_usd > 0
     ORDER BY (deuda_usd / CAST(limite_credito_usd AS REAL)) DESC
     LIMIT ${limit}`,
    [empresaId]
  )

  const items: UtilizacionCreditoItem[] = (data ?? []).map((row: Record<string, unknown>) => {
    const saldo = Number(Number(row.saldo_actual ?? 0).toFixed(2))
    const limite = Number(Number(row.limite_credito_usd ?? 0).toFixed(2))
    return {
      nombre: String(row.nombre ?? ''),
      saldoActual: saldo,
      limiteCredito: limite,
      porcentaje: limite > 0 ? Number(((saldo / limite) * 100).toFixed(1)) : 0,
    }
  })

  return { items, isLoading }
}

// ─── Movimientos del Periodo ────────────────────────────────

export function useMovimientosCxcPeriodo(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       mc.id, mc.fecha, mc.tipo, mc.referencia, mc.monto, mc.saldo_nuevo,
       c.nombre as cliente_nombre
     FROM movimientos_cuenta mc
     JOIN clientes c ON mc.cliente_id = c.id
     WHERE mc.empresa_id = ? AND SUBSTR(mc.fecha, 1, 10) >= ? AND SUBSTR(mc.fecha, 1, 10) <= ?
     ORDER BY mc.fecha DESC
     LIMIT 100`,
    [empresaId, fechaDesde, fechaHasta]
  )

  return { movimientos: (data ?? []) as MovimientoCxc[], isLoading }
}
