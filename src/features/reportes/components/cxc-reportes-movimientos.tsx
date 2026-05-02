import { formatDateTime } from '@/lib/format'
import { formatUsd } from '@/lib/currency'
import { useMovimientosCxcPeriodo } from '../hooks/use-cxc-reportes'

interface CxcReportesMovimientosProps {
  fechaDesde: string
  fechaHasta: string
}

function tipoBadge(tipo: string) {
  switch (tipo) {
    case 'FAC':
      return (
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset">
          FAC
        </span>
      )
    case 'PAG':
      return (
        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
          PAG
        </span>
      )
    case 'NCR':
      return (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset">
          NCR
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-muted-foreground/20 ring-inset">
          {tipo}
        </span>
      )
  }
}

export function CxcReportesMovimientos({ fechaDesde, fechaHasta }: CxcReportesMovimientosProps) {
  const { movimientos, isLoading } = useMovimientosCxcPeriodo(fechaDesde, fechaHasta)

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <h3 className="text-sm font-semibold">Movimientos del Periodo</h3>
      <p className="text-xs text-muted-foreground mb-3">Ultimos 100 movimientos de cuentas por cobrar</p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : movimientos.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Sin movimientos en el periodo seleccionado</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fecha</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Cliente</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Referencia</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Monto USD</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Saldo Nuevo</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((mov) => (
                <tr key={mov.id} className="border-b border-muted hover:bg-muted/50 transition-colors">
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {formatDateTime(mov.fecha)}
                  </td>
                  <td className="px-3 py-2 font-medium truncate max-w-[150px]">
                    {mov.cliente_nombre}
                  </td>
                  <td className="px-3 py-2">{tipoBadge(mov.tipo)}</td>
                  <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                    {mov.referencia ?? '-'}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatUsd(parseFloat(mov.monto))}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {formatUsd(parseFloat(mov.saldo_nuevo))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
