import { ShoppingCart, CurrencyDollar, Package, CreditCard } from '@phosphor-icons/react'
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
  const { totalVentasUsd, isLoading: loadingVentas } = useVentasDelDia({ fecha, cajaId: null, sesionCajaId: null })
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
        icon={CurrencyDollar}
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
  const colorMap: Record<string, { gradient: string; iconColor: string }> = {
    blue:   { gradient: 'from-blue-500 to-blue-700',    iconColor: 'text-blue-600' },
    green:  { gradient: 'from-green-500 to-green-700',  iconColor: 'text-green-600' },
    amber:  { gradient: 'from-amber-400 to-amber-600',  iconColor: 'text-amber-500' },
    red:    { gradient: 'from-red-500 to-red-700',      iconColor: 'text-red-600' },
    purple: { gradient: 'from-purple-500 to-purple-700',iconColor: 'text-purple-600' },
  }

  const { gradient, iconColor } = colorMap[color] ?? colorMap.blue

  return (
    <div className="rounded-2xl bg-card shadow-lg overflow-hidden">
      <div className={`relative bg-gradient-to-br ${gradient} px-6 pt-5 pb-7`}>
        <p className="text-sm font-semibold text-white/90 leading-tight">{titulo}</p>
        <div className="absolute -bottom-5 left-5 p-3 rounded-2xl bg-card shadow-lg">
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
      </div>
      <div className="px-6 pt-9 pb-5">
        <p className="text-3xl font-bold tracking-tight">{valor}</p>
        <p className={`text-xs mt-1.5 ${subtitleClassName ?? 'text-muted-foreground'}`}>{subtitulo}</p>
      </div>
    </div>
  )
}
