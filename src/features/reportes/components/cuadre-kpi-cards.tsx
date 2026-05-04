import { ShoppingCart, CreditCard } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import {
  useVentasDelDia,
  useCxcDelDia,
  type CuadreFilters,
} from '../hooks/use-cuadre'

interface CuadreKpiCardsProps {
  filters: CuadreFilters
  onClickVentas: () => void
  onClickCxc: () => void
}

export function CuadreKpiCards({ filters, onClickVentas, onClickCxc }: CuadreKpiCardsProps) {
  const { totalVentasUsd, totalVentasBs, facturasCount, isLoading: loadingVentas } =
    useVentasDelDia(filters)
  const { cxcTotalUsd, cxcTotalBs, isLoading: loadingCxc } = useCxcDelDia(filters)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Total Ventas */}
      <button
        onClick={onClickVentas}
        className="rounded-2xl bg-card shadow-lg p-5 text-left hover:shadow-lg transition-shadow"
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

      {/* CxC del dia */}
      <button
        onClick={onClickCxc}
        className="rounded-2xl bg-card shadow-lg p-5 text-left hover:shadow-lg transition-shadow"
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
