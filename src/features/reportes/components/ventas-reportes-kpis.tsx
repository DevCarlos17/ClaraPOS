import { ShoppingCart, Receipt, TrendingUp, DollarSign } from 'lucide-react'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useVentasKpisRango, useGananciaRango } from '../hooks/use-ventas-reportes'

interface VentasReportesKpisProps {
  fechaDesde: string
  fechaHasta: string
}

export function VentasReportesKpis({ fechaDesde, fechaHasta }: VentasReportesKpisProps) {
  const { totalVentasUsd, facturasCount, ticketPromedio, isLoading } =
    useVentasKpisRango(fechaDesde, fechaHasta)
  const { ganancia, isLoading: loadingGanancia } = useGananciaRango(fechaDesde, fechaHasta)
  const { tasaValor, isLoading: loadingTasa } = useTasaActual()

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        titulo="Total Ventas"
        valor={isLoading ? '--' : formatUsd(totalVentasUsd)}
        subtitulo={
          isLoading || loadingTasa
            ? '...'
            : `${formatBs(usdToBs(totalVentasUsd, tasaValor))} · ${facturasCount} factura(s)`
        }
        icon={ShoppingCart}
        color="blue"
      />

      <KpiCard
        titulo="Facturas"
        valor={isLoading ? '--' : formatNumber(facturasCount, 0)}
        subtitulo="emitidas en el periodo"
        icon={Receipt}
        color="green"
      />

      <KpiCard
        titulo="Ticket Promedio"
        valor={isLoading ? '--' : formatUsd(ticketPromedio)}
        subtitulo="por factura"
        icon={TrendingUp}
        color="amber"
      />

      <KpiCard
        titulo="Ganancia Est."
        valor={loadingGanancia ? '--' : formatUsd(ganancia)}
        subtitulo="basado en costo actual"
        icon={DollarSign}
        color="purple"
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
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    amber: 'bg-amber-100 text-amber-600',
    purple: 'bg-purple-100 text-purple-600',
  }

  return (
    <div className="rounded-xl bg-card shadow-md p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
        <div className={`p-2 rounded-lg ${colorMap[color] ?? colorMap.blue}`}>
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
