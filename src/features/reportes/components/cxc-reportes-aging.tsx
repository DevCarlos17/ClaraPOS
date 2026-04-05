import { formatUsd } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useAntiguedadSaldos } from '../hooks/use-cxc-reportes'

const BUCKET_COLORS = ['bg-green-500', 'bg-amber-500', 'bg-orange-500', 'bg-red-500']

export function CxcReportesAging() {
  const { buckets, isLoading } = useAntiguedadSaldos()

  const totalFacturas = buckets.reduce((sum, b) => sum + b.facturas, 0)
  const totalUsd = buckets.reduce((sum, b) => sum + b.totalUsd, 0)

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold">Antiguedad de Saldos</h3>
      <p className="text-xs text-muted-foreground mb-4">Facturas pendientes agrupadas por dias desde emision</p>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : totalFacturas === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Sin facturas pendientes de cobro</p>
        </div>
      ) : (
        <>
          {/* Barra de colores proporcional */}
          <div className="h-3 rounded-full overflow-hidden flex mb-4">
            {buckets.map((b, i) => {
              const pct = totalUsd > 0 ? (b.totalUsd / totalUsd) * 100 : 0
              if (pct === 0) return null
              return (
                <div
                  key={b.bucket}
                  className={`${BUCKET_COLORS[i]} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              )
            })}
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Periodo</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Facturas</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total USD</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">% del Total</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b, i) => {
                  const pct = totalUsd > 0 ? ((b.totalUsd / totalUsd) * 100).toFixed(1) : '0.0'
                  return (
                    <tr key={b.bucket} className="border-b border-muted hover:bg-muted/50 transition-colors">
                      <td className="px-3 py-2 font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${BUCKET_COLORS[i]}`} />
                          {b.bucket}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{formatNumber(b.facturas, 0)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatUsd(b.totalUsd)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{pct}%</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{formatNumber(totalFacturas, 0)}</td>
                  <td className="px-3 py-2 text-right">{formatUsd(totalUsd)}</td>
                  <td className="px-3 py-2 text-right">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
