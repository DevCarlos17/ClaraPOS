import { Money, CreditCard } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import { usePagosPorMetodo, useCxcDelDia, type CuadreFilters } from '../hooks/use-cuadre'

interface PagosResumenProps {
  filters: CuadreFilters
  onMetodoClick?: (metodoNombre: string) => void
  onCreditoClick?: () => void
}

export function PagosResumen({ filters, onMetodoClick, onCreditoClick }: PagosResumenProps) {
  const { metodos, isLoading } = usePagosPorMetodo(filters)
  const { cxcTotalUsd, isLoading: loadingCxc } = useCxcDelDia(filters)

  const totalCobradoUsd = metodos.reduce((sum, m) => sum + m.totalUsd, 0)
  const totalCobradoBs = metodos
    .filter((m) => m.moneda === 'BS')
    .reduce((sum, m) => sum + m.totalOriginal, 0)

  const isLoadingAll = isLoading || loadingCxc

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <h3 className="text-sm font-semibold mb-4">Cobros por Metodo de Pago</h3>

      {isLoadingAll ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : metodos.length === 0 && cxcTotalUsd <= 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Sin cobros en esta fecha</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Payment method rows */}
          {metodos.map((m) => {
            const clickable = !!onMetodoClick
            return (
              <button
                key={m.nombre}
                type="button"
                disabled={!clickable}
                onClick={() => onMetodoClick?.(m.nombre)}
                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-left ${clickable ? 'hover:bg-muted/50 hover:shadow-sm transition-all cursor-pointer' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Money size={16} className="text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{m.nombre}</p>
                    {m.moneda === 'BS' && (
                      <p className="text-xs text-muted-foreground">
                        {formatBs(m.totalOriginal)}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-sm font-bold">{formatUsd(m.totalUsd)}</span>
              </button>
            )
          })}

          {/* Credit (CxC) row — shown when there are pending credit invoices */}
          {cxcTotalUsd > 0.005 && (
            <button
              type="button"
              disabled={!onCreditoClick}
              onClick={onCreditoClick}
              className={`w-full flex items-center justify-between rounded-lg border border-red-200 bg-red-50/40 px-3 py-2.5 text-left ${onCreditoClick ? 'hover:bg-red-50 hover:shadow-sm transition-all cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="text-red-500" />
                <div>
                  <p className="text-sm font-medium text-red-700">A credito (CxC)</p>
                  <p className="text-xs text-red-500">Pendiente de cobro</p>
                </div>
              </div>
              <span className="text-sm font-bold text-red-600">{formatUsd(cxcTotalUsd)}</span>
            </button>
          )}

          {/* Totales */}
          <div className="pt-3 mt-2 border-t space-y-1">
            <div className="flex justify-between text-sm font-semibold">
              <span>Total cobrado</span>
              <span>{formatUsd(totalCobradoUsd)}</span>
            </div>
            {totalCobradoBs > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Cobrado en Bs</span>
                <span>{formatBs(totalCobradoBs)}</span>
              </div>
            )}
            {cxcTotalUsd > 0.005 && (
              <>
                <div className="flex justify-between text-sm text-red-600">
                  <span>A credito</span>
                  <span>{formatUsd(cxcTotalUsd)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-1 border-t">
                  <span>Total facturado</span>
                  <span>{formatUsd(totalCobradoUsd + cxcTotalUsd)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
