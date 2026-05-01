import { Package, ShoppingBag, AlertTriangle, ArrowLeftRight } from 'lucide-react'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useInventarioKpis } from '../hooks/use-inventario-reportes'

interface InventarioKpiCardsProps {
  fechaDesde: string
  fechaHasta: string
  onValorClick?: () => void
  onMovimientosClick?: () => void
}

export function InventarioKpiCards({ fechaDesde, fechaHasta, onValorClick, onMovimientosClick }: InventarioKpiCardsProps) {
  const { valorTotalUsd, productosActivos, stockCritico, movimientosPeriodo, isLoading } =
    useInventarioKpis(fechaDesde, fechaHasta)
  const { tasaValor, isLoading: loadingTasa } = useTasaActual()

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Valor Inventario */}
      <KpiCard
        titulo="Valor Inventario"
        valor={isLoading ? '--' : formatUsd(valorTotalUsd)}
        subtitulo={isLoading || loadingTasa ? '...' : formatBs(usdToBs(valorTotalUsd, tasaValor))}
        icon={Package}
        color="blue"
        onClick={onValorClick}
      />

      {/* Productos Activos */}
      <KpiCard
        titulo="Productos Activos"
        valor={isLoading ? '--' : formatNumber(productosActivos, 0)}
        subtitulo="productos y servicios"
        icon={ShoppingBag}
        color="green"
      />

      {/* Stock Critico */}
      <KpiCard
        titulo="Stock Critico"
        valor={isLoading ? '--' : formatNumber(stockCritico, 0)}
        subtitulo="bajo minimo"
        icon={AlertTriangle}
        color="red"
      />

      {/* Movimientos */}
      <KpiCard
        titulo="Movimientos"
        valor={isLoading ? '--' : formatNumber(movimientosPeriodo, 0)}
        subtitulo="en el periodo"
        icon={ArrowLeftRight}
        color="amber"
        onClick={onMovimientosClick}
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
  onClick,
}: {
  titulo: string
  valor: string
  subtitulo: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  onClick?: () => void
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  }

  const hoverMap: Record<string, string> = {
    blue: 'hover:ring-blue-200',
    green: 'hover:ring-green-200',
    amber: 'hover:ring-amber-200',
    red: 'hover:ring-red-200',
  }

  const base = 'rounded-xl bg-card shadow-md p-5 text-left w-full'
  const interactive = onClick
    ? `cursor-pointer transition-all hover:ring-2 ${hoverMap[color] ?? hoverMap.blue} hover:shadow-sm`
    : ''

  const content = (
    <>
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
      {onClick && (
        <p className="text-xs text-muted-foreground/60 mt-2">Ver detalle →</p>
      )}
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} ${interactive}`}>
        {content}
      </button>
    )
  }

  return <div className={base}>{content}</div>
}
