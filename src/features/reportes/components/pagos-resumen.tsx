import { Money, CreditCard } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import { usePagosPorMetodo, useCxcDelDia, useTotalesFiscales, type CuadreFilters } from '../hooks/use-cuadre'

interface PagosResumenProps {
  filters: CuadreFilters
  tasaDelDia: number
  onMetodoClick?: (metodoNombre: string) => void
  onCreditoClick?: () => void
}

export function PagosResumen({ filters, tasaDelDia, onMetodoClick, onCreditoClick }: PagosResumenProps) {
  const { metodos, isLoading } = usePagosPorMetodo(filters)
  const { cxcTotalUsd, cxcTotalBs, isLoading: loadingCxc } = useCxcDelDia(filters)
  const { totales, isLoading: loadingTotales } = useTotalesFiscales(filters)

  const totalCobradoUsd = metodos.reduce((sum, m) => sum + m.totalUsd, 0)
  const totalCobradoBs = metodos.reduce((sum, m) => {
    return sum + (m.moneda === 'BS' ? m.totalOriginal : m.totalBs)
  }, 0)

  // Diferencial cambiario por redondeo
  // Formula: Total Facturado = Total Cobrado + CxC Pendiente ± Diferencial
  // Positivo = faltan Bs en caja | Negativo = sobran Bs en caja
  const diferencial = Number((totales.totalFacturadoBs - totalCobradoBs - cxcTotalBs).toFixed(2))
  const toleranciaBs = tasaDelDia > 0 ? tasaDelDia * 0.01 : 1.0 // equivalente a $0.01 USD
  const diferencialAbs = Math.abs(diferencial)
  const hasDiferencial = diferencialAbs > 0.005
  const dentroTolerancia = diferencialAbs <= toleranciaBs

  const isLoadingAll = isLoading || loadingCxc || loadingTotales

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
            const bsAmount = m.moneda === 'BS' ? m.totalOriginal : m.totalBs
            const hasBs = bsAmount > 0
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
                  <p className="text-sm font-medium">{m.nombre}</p>
                </div>
                <div className="flex items-center gap-2">
                  {hasBs && (
                    <span className="text-xs text-muted-foreground">{formatBs(bsAmount)}</span>
                  )}
                  <span className="text-sm font-bold">{formatUsd(m.totalUsd)}</span>
                </div>
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
              <div className="flex items-center gap-2">
                {cxcTotalBs > 0 && (
                  <span className="text-xs text-red-400">{formatBs(cxcTotalBs)}</span>
                )}
                <span className="text-sm font-bold text-red-600">{formatUsd(cxcTotalUsd)}</span>
              </div>
            </button>
          )}

          {/* Totales */}
          <div className="pt-3 mt-2 border-t space-y-1">
            <div className="flex justify-between items-center text-sm font-semibold">
              <span>Total cobrado</span>
              <div className="flex items-center gap-2">
                {totalCobradoBs > 0 && (
                  <span className="text-xs text-muted-foreground">{formatBs(totalCobradoBs)}</span>
                )}
                <span className="text-sm font-bold">{formatUsd(totalCobradoUsd)}</span>
              </div>
            </div>
            {cxcTotalUsd > 0.005 && (
              <>
                <div className="flex justify-between items-center text-sm text-red-600">
                  <span>A credito</span>
                  <div className="flex items-center gap-2">
                    {cxcTotalBs > 0 && (
                      <span className="text-xs text-red-400">{formatBs(cxcTotalBs)}</span>
                    )}
                    <span className="text-sm font-bold">{formatUsd(cxcTotalUsd)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-sm font-bold pt-1 border-t">
                  <span>Total facturado</span>
                  <div className="flex items-center gap-2">
                    {totalCobradoBs > 0 && (
                      <span className="text-xs text-muted-foreground font-normal">{formatBs(totalCobradoBs + cxcTotalBs)}</span>
                    )}
                    <span>{formatUsd(totalCobradoUsd + cxcTotalUsd)}</span>
                  </div>
                </div>
              </>
            )}

            {/* Diferencial cambiario + Total cuadrado */}
            {hasDiferencial && (
              <>
                <div className={`flex justify-between items-center text-xs rounded-md px-2.5 py-1.5 mt-1 ${
                  dentroTolerancia
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  <span className="font-medium">
                    {dentroTolerancia
                      ? 'Ajuste por redondeo cambiario'
                      : 'Diferencial sin cuadrar \u2014 revisar cobros'}
                  </span>
                  <span className="font-mono font-semibold">
                    {diferencial > 0 ? '+' : ''}{formatBs(diferencial)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t">
                  <span className="text-sm font-bold">Total cuadrado</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-normal">
                      {formatBs(totales.totalFacturadoBs)}
                    </span>
                    <span className="text-sm font-bold">{formatUsd(totales.totalFacturadoUsd)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
