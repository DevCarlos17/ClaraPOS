import { formatUsd } from '@/lib/currency'
import { useUtilizacionCredito } from '../hooks/use-cxc-reportes'

function barColor(pct: number): string {
  if (pct > 80) return 'bg-red-500'
  if (pct > 50) return 'bg-amber-500'
  return 'bg-green-500'
}

export function CxcReportesCredito() {
  const { items, isLoading } = useUtilizacionCredito()

  return (
    <div className="rounded-xl bg-card shadow-md p-5">
      <h3 className="text-sm font-semibold">Utilizacion de Credito</h3>
      <p className="text-xs text-muted-foreground mb-4">Top 10 clientes con credito asignado</p>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Sin clientes con credito utilizado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const cappedPct = Math.min(item.porcentaje, 100)
            return (
              <div key={item.nombre}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium truncate mr-2">{item.nombre}</span>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {formatUsd(item.saldoActual)} ({item.porcentaje}%)
                  </span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor(item.porcentaje)}`}
                    style={{ width: `${cappedPct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
