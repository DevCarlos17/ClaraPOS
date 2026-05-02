import { AlertTriangle, Clock, Handshake } from 'lucide-react'
import { usePrestamosProximos } from '../hooks/use-dashboard'
import { formatUsd } from '@/lib/currency'

function formatFechaCorta(fecha: string): string {
  try {
    return new Date(fecha + 'T00:00:00').toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return fecha
  }
}

export function DashboardPrestamosWidget() {
  const { vencimientos, isLoading } = usePrestamosProximos(7)

  const vencidos = vencimientos.filter((v) => v.dias_restantes < 0)
  const proximos = vencimientos.filter((v) => v.dias_restantes >= 0)

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Handshake size={16} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold">Prestamos</h3>
        </div>
        <div className="h-24 bg-muted rounded animate-pulse" />
      </div>
    )
  }

  if (vencimientos.length === 0) return null

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Handshake size={16} className="text-purple-600" />
          <h3 className="text-sm font-semibold">Prestamos pendientes</h3>
        </div>
        <div className="flex items-center gap-2">
          {vencidos.length > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
              {vencidos.length} vencido{vencidos.length !== 1 ? 's' : ''}
            </span>
          )}
          {proximos.length > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {proximos.length} proximo{proximos.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="divide-y">
        {vencimientos.map((v) => {
          const isVencido = v.dias_restantes < 0
          const diasAbs = Math.abs(v.dias_restantes)
          const saldo = parseFloat(v.saldo_pendiente_usd)

          return (
            <div key={v.id} className="px-5 py-3 flex items-center gap-3">
              <div className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-full ${
                isVencido ? 'bg-destructive/10' : 'bg-amber-50'
              }`}>
                {isVencido ? (
                  <AlertTriangle size={14} className="text-destructive" />
                ) : (
                  <Clock size={14} className="text-amber-600" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{v.cliente_nombre}</p>
                <p className="text-xs text-muted-foreground">
                  Fac. #{v.nro_factura} · {formatFechaCorta(v.fecha_vencimiento)}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">{formatUsd(saldo)}</p>
                <p className={`text-xs font-medium ${isVencido ? 'text-destructive' : 'text-amber-600'}`}>
                  {isVencido
                    ? `Vencido hace ${diasAbs} dia${diasAbs !== 1 ? 's' : ''}`
                    : `Vence en ${diasAbs} dia${diasAbs !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
