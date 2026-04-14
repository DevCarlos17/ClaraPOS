import { formatUsd } from '@/lib/currency'
import { useVentasPorDepto, type CuadreFilters } from '../hooks/use-cuadre'

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

interface VentasDeptChartProps {
  filters: CuadreFilters
  onDeptoClick?: (deptoNombre: string) => void
}

export function VentasDeptChart({ filters, onDeptoClick }: VentasDeptChartProps) {
  const { deptos, isLoading } = useVentasPorDepto(filters)

  const maxValue = deptos.reduce((max, d) => Math.max(max, d.totalUsd), 0)
  const totalUsd = deptos.reduce((sum, d) => sum + d.totalUsd, 0)

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold mb-4">Ventas por Departamento</h3>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : deptos.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Sin ventas en esta fecha</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deptos.map((d, i) => {
            const pct = maxValue > 0 ? (d.totalUsd / maxValue) * 100 : 0
            const sharePct = totalUsd > 0 ? ((d.totalUsd / totalUsd) * 100).toFixed(1) : '0'
            const clickable = !!onDeptoClick
            return (
              <button
                key={d.departamento}
                type="button"
                disabled={!clickable}
                onClick={() => onDeptoClick?.(d.departamento)}
                className={`w-full text-left ${clickable ? 'hover:bg-muted/50 rounded-md px-1 -mx-1 py-0.5 transition-colors cursor-pointer' : ''}`}
              >
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium truncate mr-2">{d.departamento}</span>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {formatUsd(d.totalUsd)} ({sharePct}%)
                  </span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${COLORS[i % COLORS.length]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            )
          })}

          {/* Total */}
          <div className="pt-3 mt-3 border-t flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span>{formatUsd(totalUsd)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
