import { Landmark, Users, AlertTriangle, ArrowDownCircle } from 'lucide-react'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCxcKpis, useCobrosDelPeriodo } from '../hooks/use-cxc-reportes'

interface CxcReportesKpisProps {
  fechaDesde: string
  fechaHasta: string
}

export function CxcReportesKpis({ fechaDesde, fechaHasta }: CxcReportesKpisProps) {
  const { deudaTotalUsd, clientesConDeuda, sobreLimite, isLoading } = useCxcKpis()
  const { cobrosUsd, isLoading: loadingCobros } = useCobrosDelPeriodo(fechaDesde, fechaHasta)
  const { tasaValor, isLoading: loadingTasa } = useTasaActual()

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        titulo="Deuda Total"
        valor={isLoading ? '--' : formatUsd(deudaTotalUsd)}
        subtitulo={isLoading || loadingTasa ? '...' : formatBs(usdToBs(deudaTotalUsd, tasaValor))}
        icon={Landmark}
        color="red"
      />

      <KpiCard
        titulo="Clientes con Deuda"
        valor={isLoading ? '--' : formatNumber(clientesConDeuda, 0)}
        subtitulo="con saldo pendiente"
        icon={Users}
        color="amber"
      />

      <KpiCard
        titulo="Sobre Limite"
        valor={isLoading ? '--' : formatNumber(sobreLimite, 0)}
        subtitulo="exceden su limite"
        icon={AlertTriangle}
        color="red"
      />

      <KpiCard
        titulo="Cobros del Periodo"
        valor={loadingCobros ? '--' : formatUsd(cobrosUsd)}
        subtitulo="recibidos en el periodo"
        icon={ArrowDownCircle}
        color="green"
      />
    </div>
  )
}

function KpiCard({
  titulo,
  valor,
  subtitulo,
  icon: Icon,
  color,
}: {
  titulo: string
  valor: string
  subtitulo: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}) {
  const colorMap: Record<string, string> = {
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-green-50 text-green-600',
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
        <div className={`p-2 rounded-lg ${colorMap[color] ?? colorMap.red}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold">{valor}</p>
        <p className="text-xs text-muted-foreground mt-1">{subtitulo}</p>
      </div>
    </div>
  )
}
