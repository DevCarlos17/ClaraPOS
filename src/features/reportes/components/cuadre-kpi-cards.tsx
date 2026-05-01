import { ShoppingCart, TrendingUp, Receipt, CreditCard } from 'lucide-react'
import { formatUsd, formatBs } from '@/lib/currency'
import {
  useVentasDelDia,
  useGananciaEstimada,
  useCxcDelDia,
  type CuadreFilters,
} from '../hooks/use-cuadre'

interface CuadreKpiCardsProps {
  filters: CuadreFilters
  onClickVentas: () => void
  onClickCxc: () => void
}

export function CuadreKpiCards({ filters, onClickVentas, onClickCxc }: CuadreKpiCardsProps) {
  const { totalVentasUsd, totalVentasBs, facturasCount, ticketPromedio, isLoading: loadingVentas } =
    useVentasDelDia(filters)
  const { ganancia, isLoading: loadingGanancia } = useGananciaEstimada(filters)
  const { cxcTotalUsd, cxcTotalBs, isLoading: loadingCxc } = useCxcDelDia(filters)

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Total Ventas */}
      <button
        onClick={onClickVentas}
        className="rounded-xl bg-card shadow-md p-5 text-left hover:shadow-lg transition-shadow"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">Total Ventas</p>
          <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
            <ShoppingCart className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          {loadingVentas ? (
            <div className="h-8 w-24 bg-muted rounded animate-pulse" />
          ) : (
            <>
              <p className="text-2xl font-bold">{formatUsd(totalVentasUsd)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatBs(totalVentasBs)} &middot; {facturasCount} factura(s)
              </p>
            </>
          )}
        </div>
      </button>

      {/* Ganancia Estimada */}
      <div className="rounded-xl bg-card shadow-md p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">Ganancia Est.</p>
          <div className="p-2 rounded-lg bg-green-100 text-green-600">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          {loadingGanancia ? (
            <div className="h-8 w-24 bg-muted rounded animate-pulse" />
          ) : (
            <>
              <p className="text-2xl font-bold">{formatUsd(ganancia)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Basado en costo actual de productos
              </p>
            </>
          )}
        </div>
      </div>

      {/* Ticket Promedio */}
      <div className="rounded-xl bg-card shadow-md p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">Ticket Promedio</p>
          <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
            <Receipt className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          {loadingVentas ? (
            <div className="h-8 w-24 bg-muted rounded animate-pulse" />
          ) : (
            <>
              <p className="text-2xl font-bold">{formatUsd(ticketPromedio)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {facturasCount} factura(s) emitida(s)
              </p>
            </>
          )}
        </div>
      </div>

      {/* CxC del dia */}
      <button
        onClick={onClickCxc}
        className="rounded-xl bg-card shadow-md p-5 text-left hover:shadow-lg transition-shadow"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">CxC Hoy</p>
          <div className="p-2 rounded-lg bg-red-100 text-red-600">
            <CreditCard className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2">
          {loadingCxc ? (
            <div className="h-8 w-24 bg-muted rounded animate-pulse" />
          ) : (
            <>
              <p className="text-2xl font-bold text-red-600">{formatUsd(cxcTotalUsd)}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatBs(cxcTotalBs)}</p>
            </>
          )}
        </div>
      </button>
    </div>
  )
}
