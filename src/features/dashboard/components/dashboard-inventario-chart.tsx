import { formatUsd } from '@/lib/currency'
import { useInventarioPorDepto } from '@/features/dashboard/hooks/use-dashboard'

const COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-indigo-500',
]

export function DashboardInventarioChart() {
  const { deptos, isLoading } = useInventarioPorDepto()

  const maxValue = deptos.reduce((max, d) => Math.max(max, d.valorUsd), 0)
  const totalUsd = deptos.reduce((sum, d) => sum + d.valorUsd, 0)

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <h3 className="text-sm font-semibold mb-4">Inventario por Departamento</h3>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : deptos.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Sin productos en inventario</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deptos.map((d, i) => {
            const pct = maxValue > 0 ? (d.valorUsd / maxValue) * 100 : 0
            const sharePct = totalUsd > 0 ? ((d.valorUsd / totalUsd) * 100).toFixed(1) : '0'
            return (
              <div key={d.departamento}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium truncate mr-2">{d.departamento}</span>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {formatUsd(d.valorUsd)} ({sharePct}%)
                  </span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${COLORS[i % COLORS.length]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}

          <div className="pt-3 mt-3 border-t flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span>{formatUsd(totalUsd)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
