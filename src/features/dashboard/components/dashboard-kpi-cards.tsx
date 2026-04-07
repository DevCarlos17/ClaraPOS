import { ShoppingCart, DollarSign, Package, CreditCard } from 'lucide-react'
import { formatUsd, formatBs, formatTasa, usdToBs } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useResumenInventario } from '@/features/inventario/hooks/use-productos'
import { useVentasDelDia } from '@/features/reportes/hooks/use-cuadre'
import { useCxcTotal } from '@/features/dashboard/hooks/use-dashboard'
import { todayStr } from '@/lib/dates'

const TASA_STALE_HOURS = 24

function isTasaDesactualizada(createdAt: string): boolean {
  const createdMs = new Date(createdAt).getTime()
  if (Number.isNaN(createdMs)) return false
  const ageHours = (Date.now() - createdMs) / (1000 * 60 * 60)
  return ageHours > TASA_STALE_HOURS
}

export function DashboardKpiCards() {
  const fecha = todayStr()
  const { totalVentasUsd, isLoading: loadingVentas } = useVentasDelDia(fecha)
  const { tasa, tasaValor, isLoading: loadingTasa } = useTasaActual()
  const { valorTotal, stockCritico } = useResumenInventario()
  const { totalCxcUsd, isLoading: loadingCxc } = useCxcTotal()

  const tasaDesactualizada = tasa ? isTasaDesactualizada(tasa.created_at) : false
  const tasaSubtitulo = !tasa
    ? loadingTasa
      ? '...'
      : 'Sin tasa registrada'
    : `${tasaDesactualizada ? 'Desactualizada' : 'Actualizada'}: ${formatDateTime(tasa.created_at)}`

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Ventas de Hoy */}
      <KpiCard
        titulo="Ventas de Hoy"
        valor={loadingVentas ? '--' : formatUsd(totalVentasUsd)}
        subtitulo={loadingVentas || loadingTasa ? '...' : formatBs(usdToBs(totalVentasUsd, tasaValor))}
        icon={ShoppingCart}
        color="blue"
      />

      {/* Tasa Actual */}
      <KpiCard
        titulo="Tasa Actual"
        valor={!tasa ? '--' : formatTasa(tasa.valor)}
        subtitulo={tasaSubtitulo}
        icon={DollarSign}
        color={tasaDesactualizada ? 'red' : 'amber'}
        subtitleClassName={tasaDesactualizada ? 'text-red-600 font-medium' : undefined}
      />

      {/* Valor Inventario */}
      <KpiCard
        titulo="Valor Inventario"
        valor={formatUsd(valorTotal)}
        subtitulo={`${stockCritico} articulo(s) con stock critico`}
        icon={Package}
        color="green"
      />

      {/* Total CxC */}
      <KpiCard
        titulo="Total CxC"
        valor={loadingCxc ? '--' : formatUsd(totalCxcUsd)}
        subtitulo={loadingCxc || loadingTasa ? '...' : formatBs(usdToBs(totalCxcUsd, tasaValor))}
        icon={CreditCard}
        color="red"
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
  subtitleClassName,
}: {
  titulo: string
  valor: string
  subtitulo: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  subtitleClassName?: string
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
        <div className={`p-2 rounded-lg ${colorMap[color] ?? colorMap.blue}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold">{valor}</p>
        <p className={`text-xs mt-1 ${subtitleClassName ?? 'text-muted-foreground'}`}>{subtitulo}</p>
      </div>
    </div>
  )
}
