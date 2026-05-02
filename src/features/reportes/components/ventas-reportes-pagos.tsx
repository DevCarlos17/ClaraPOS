import { Money } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import { usePagosPorMetodoRango } from '../hooks/use-ventas-reportes'

interface VentasReportesPagosProps {
  fechaDesde: string
  fechaHasta: string
}

export function VentasReportesPagos({ fechaDesde, fechaHasta }: VentasReportesPagosProps) {
  const { metodos, isLoading } = usePagosPorMetodoRango(fechaDesde, fechaHasta)

  const totalCobradoUsd = metodos.reduce((sum, m) => sum + m.totalUsd, 0)
  const totalCobradoBs = metodos
    .filter((m) => m.moneda === 'BS')
    .reduce((sum, m) => sum + m.totalOriginal, 0)

  return (
    <div className="rounded-xl bg-card shadow-md p-5">
      <h3 className="text-sm font-semibold mb-4">Cobros por Metodo de Pago</h3>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : metodos.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Sin cobros en este periodo</p>
        </div>
      ) : (
        <div className="space-y-2">
          {metodos.map((m) => (
            <div
              key={`${m.nombre}-${m.moneda}`}
              className="flex items-center justify-between rounded-lg border px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                <Money size={16} className="text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{m.nombre}</p>
                  {m.moneda === 'BS' && (
                    <p className="text-xs text-muted-foreground">
                      {formatBs(m.totalOriginal)}
                    </p>
                  )}
                </div>
              </div>
              <span className="text-sm font-bold">{formatUsd(m.totalUsd)}</span>
            </div>
          ))}

          <div className="pt-3 mt-2 border-t space-y-1">
            <div className="flex justify-between text-sm font-semibold">
              <span>Total cobrado (USD)</span>
              <span>{formatUsd(totalCobradoUsd)}</span>
            </div>
            {totalCobradoBs > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Cobrado en Bs</span>
                <span>{formatBs(totalCobradoBs)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
