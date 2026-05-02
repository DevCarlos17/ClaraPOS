import type { FC } from 'react'
import type { Gasto } from '@/features/contabilidad/hooks/use-gastos'
import { formatUsd, formatBs } from '@/lib/currency'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'

// ─── Props ────────────────────────────────────────────────────

interface GastosKpisProps {
  gastos: Array<Gasto & { cuenta_nombre: string; proveedor_nombre: string | null }>
}

// ─── Tarjeta KPI ──────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string
}

function KpiCard({ label, value }: KpiCardProps) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-lg p-4">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-lg font-bold text-foreground mt-1">{value}</p>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────

export const GastosKpis: FC<GastosKpisProps> = ({ gastos }) => {
  const { tasaValor } = useTasaActual()
  const registrados = gastos.filter((g) => g.status === 'REGISTRADO')

  const totalUsd = registrados.reduce(
    (sum, g) => sum + (parseFloat(g.monto_usd) || 0),
    0
  )

  const totalBs = registrados.reduce(
    (sum, g) => sum + (parseFloat(g.monto_usd) * tasaValor || 0),
    0
  )

  const cantidad = registrados.length

  // Cuenta con mayor gasto acumulado
  const topCuenta = (() => {
    if (registrados.length === 0) return 'Sin datos'

    const acumulado = registrados.reduce<Record<string, number>>((acc, g) => {
      const nombre = g.cuenta_nombre ?? 'Sin cuenta'
      acc[nombre] = (acc[nombre] ?? 0) + (parseFloat(g.monto_usd) || 0)
      return acc
    }, {})

    const entradas = Object.entries(acumulado)
    if (entradas.length === 0) return 'Sin datos'

    const [nombre] = entradas.sort((a, b) => b[1] - a[1])[0]
    return nombre
  })()

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <KpiCard label="Total USD" value={formatUsd(totalUsd)} />
      <KpiCard label="Total Bs" value={formatBs(totalBs)} />
      <KpiCard label="Cantidad" value={String(cantidad)} />
      <KpiCard label="Top Cuenta" value={topCuenta} />
    </div>
  )
}
