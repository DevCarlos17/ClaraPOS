import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Interfaces ─────────────────────────────────────────────

export interface FilaBalance {
  cuenta_id: string
  codigo: string
  nombre: string
  nivel: number
  tipo: string
  naturaleza: string
  total_debe: number
  total_haber: number
  saldo_deudor: number
  saldo_acreedor: number
}

export interface TotalesBalance {
  totalDebe: number
  totalHaber: number
  totalSaldoDeudor: number
  totalSaldoAcreedor: number
}

export interface FiltrosBalance {
  fechaDesde?: string
  fechaHasta?: string
}

interface RawBalanceRow {
  cuenta_id: string
  codigo: string
  nombre: string
  nivel: number
  tipo: string
  naturaleza: string
  total_debe: string
  total_haber: string
}

// ─── Hook ────────────────────────────────────────────────────

/**
 * Balance de Comprobacion (sumas y saldos).
 * Agrupa libro_contable por cuenta contable, mostrando:
 *   - Total DEBE (suma de monto > 0)
 *   - Total HABER (suma de monto < 0, expresado positivo)
 *   - Saldo deudor / Saldo acreedor segun naturaleza
 * Solo incluye asientos con estado != ANULADO.
 * Filtra opcionalmente por rango de fechas.
 */
export function useBalanceComprobacion(filtros: FiltrosBalance = {}) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const conditions: string[] = [
    'lc.empresa_id = ?',
    "lc.estado != 'ANULADO'",
  ]
  const params: unknown[] = [empresaId]

  if (filtros.fechaDesde) {
    conditions.push("SUBSTR(lc.fecha_registro, 1, 10) >= ?")
    params.push(filtros.fechaDesde)
  }
  if (filtros.fechaHasta) {
    conditions.push("SUBSTR(lc.fecha_registro, 1, 10) <= ?")
    params.push(filtros.fechaHasta)
  }

  const where = conditions.join(' AND ')

  const { data, isLoading } = useQuery(
    `SELECT
       pc.id as cuenta_id,
       pc.codigo,
       pc.nombre,
       pc.nivel,
       pc.tipo,
       pc.naturaleza,
       SUM(CASE WHEN CAST(lc.monto AS REAL) > 0 THEN CAST(lc.monto AS REAL) ELSE 0 END) as total_debe,
       SUM(CASE WHEN CAST(lc.monto AS REAL) < 0 THEN ABS(CAST(lc.monto AS REAL)) ELSE 0 END) as total_haber
     FROM libro_contable lc
     JOIN plan_cuentas pc ON lc.cuenta_contable_id = pc.id
     WHERE ${where}
     GROUP BY pc.id, pc.codigo, pc.nombre, pc.nivel, pc.tipo, pc.naturaleza
     ORDER BY pc.codigo ASC`,
    params
  )

  const filas: FilaBalance[] = ((data ?? []) as RawBalanceRow[]).map((row) => {
    const debe = Number(row.total_debe ?? 0)
    const haber = Number(row.total_haber ?? 0)

    let saldoDeudor = 0
    let saldoAcreedor = 0

    if (row.naturaleza === 'DEUDORA') {
      const saldo = debe - haber
      if (saldo >= 0) saldoDeudor = saldo
      else saldoAcreedor = Math.abs(saldo)
    } else {
      const saldo = haber - debe
      if (saldo >= 0) saldoAcreedor = saldo
      else saldoDeudor = Math.abs(saldo)
    }

    return {
      cuenta_id: row.cuenta_id,
      codigo: row.codigo,
      nombre: row.nombre,
      nivel: row.nivel,
      tipo: row.tipo,
      naturaleza: row.naturaleza,
      total_debe: debe,
      total_haber: haber,
      saldo_deudor: saldoDeudor,
      saldo_acreedor: saldoAcreedor,
    }
  })

  const totales: TotalesBalance = {
    totalDebe: filas.reduce((s, f) => s + f.total_debe, 0),
    totalHaber: filas.reduce((s, f) => s + f.total_haber, 0),
    totalSaldoDeudor: filas.reduce((s, f) => s + f.saldo_deudor, 0),
    totalSaldoAcreedor: filas.reduce((s, f) => s + f.saldo_acreedor, 0),
  }

  const cuadrado = Math.abs(totales.totalDebe - totales.totalHaber) < 0.02

  return { filas, totales, isLoading, cuadrado }
}
