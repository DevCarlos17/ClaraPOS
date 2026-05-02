import { formatUsd } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useTopDeudores } from '../hooks/use-cxc-reportes'

export function CxcReportesDeudores() {
  const { deudores, isLoading } = useTopDeudores()

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <h3 className="text-sm font-semibold">Top 10 Deudores</h3>
      <p className="text-xs text-muted-foreground mb-3">Mayor saldo pendiente</p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : deudores.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <p className="text-sm">Sin clientes con deuda</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">#</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Cliente</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Identificacion</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Deuda USD</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Limite</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">% Uso</th>
              </tr>
            </thead>
            <tbody>
              {deudores.map((d, i) => {
                const pctUso = d.limiteCredito > 0
                  ? ((d.saldoActual / d.limiteCredito) * 100).toFixed(1)
                  : '--'
                return (
                  <tr key={d.identificacion} className="border-b border-muted">
                    <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-2 font-medium truncate max-w-[120px]">{d.nombre}</td>
                    <td className="px-2 py-2 font-mono text-xs">{d.identificacion}</td>
                    <td className="px-2 py-2 text-right font-bold">{formatUsd(d.saldoActual)}</td>
                    <td className="px-2 py-2 text-right text-muted-foreground">
                      {d.limiteCredito > 0 ? formatUsd(d.limiteCredito) : 'Sin limite'}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {pctUso === '--' ? (
                        <span className="text-muted-foreground">--</span>
                      ) : (
                        <span className={Number(pctUso) > 100 ? 'text-red-600 font-semibold' : Number(pctUso) > 80 ? 'text-amber-600' : ''}>
                          {formatNumber(Number(pctUso), 1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
