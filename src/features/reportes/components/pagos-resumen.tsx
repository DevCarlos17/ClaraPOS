import { Money, CreditCard, ArrowsClockwise, Coins } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import { usePagosPorMetodo, useCxcDelDia, useTotalesFiscales, useCobrosViaPOS, useSafDiario, type CuadreFilters } from '../hooks/use-cuadre'

interface PagosResumenProps {
  filters: CuadreFilters
  tasaDelDia: number
  onMetodoClick?: (metodoNombre: string) => void
  onCreditoClick?: () => void
  onSafClick?: () => void
}

export function PagosResumen({ filters, tasaDelDia, onMetodoClick, onCreditoClick, onSafClick }: PagosResumenProps) {
  const { metodos, isLoading } = usePagosPorMetodo(filters)
  const { cxcTotalUsd, cxcTotalBs, isLoading: loadingCxc } = useCxcDelDia(filters)
  const { totales, isLoading: loadingTotales } = useTotalesFiscales(filters)
  const { porMetodo: cobrosViaPOS, totalCobrosUsd, totalCobrosBs, isLoading: loadingCobros } = useCobrosViaPOS(filters)
  const { totalUsd: safTotalUsd, isLoading: loadingSaf } = useSafDiario(filters)

  // Excluir metodos EFECTIVO con saldo $0 (fondo inicial sin ventas en efectivo)
  const metodosMostrar = metodos.filter((m) => m.totalUsd > 0.001 || m.totalOriginal > 0.001)

  const totalCobradoUsd = metodosMostrar.reduce((sum, m) => sum + m.totalUsd, 0)
  const totalCobradoBs = metodosMostrar.reduce((sum, m) => {
    return sum + (m.moneda === 'BS' ? m.totalOriginal : m.totalBs)
  }, 0)

  const hayCobrosViaPOS = totalCobrosUsd > 0.005 || totalCobrosBs > 0.005

  // Diferencial cambiario por redondeo.
  // Formula: Total Facturado + Cobros CxC vía POS = Total Cobrado + CxC Pendiente ± Diferencial
  // Los cobros vía POS son ingresos reales que reducen CxC pero no están en las ventas del día.
  // Positivo = faltan Bs en caja | Negativo = sobran Bs en caja
  const diferencial = Number((
    totales.totalFacturadoBs + totalCobrosBs - totalCobradoBs - cxcTotalBs
  ).toFixed(2))
  const toleranciaBs = tasaDelDia > 0 ? tasaDelDia * 0.01 : 1.0 // equivalente a $0.01 USD
  const diferencialAbs = Math.abs(diferencial)
  const hasDiferencial = diferencialAbs > 0.005
  const dentroTolerancia = diferencialAbs <= toleranciaBs

  const haySaf = safTotalUsd > 0.001
  const safBs = tasaDelDia > 0 ? safTotalUsd * tasaDelDia : 0

  const isLoadingAll = isLoading || loadingCxc || loadingTotales || loadingCobros || loadingSaf

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <h3 className="text-sm font-semibold mb-4">Cobros por Metodo de Pago</h3>

      {isLoadingAll ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : metodosMostrar.length === 0 && cxcTotalUsd <= 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Sin cobros en esta fecha</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Payment method rows */}
          {metodosMostrar.map((m) => {
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

          {/* Cobros CxC via POS (SAF) — agrupados por metodo */}
          {hayCobrosViaPOS && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-2 pb-0.5">
                <ArrowsClockwise size={14} className="text-blue-500 shrink-0" />
                <p className="text-xs font-semibold text-blue-700">Cobros CxC via POS</p>
              </div>
              {cobrosViaPOS.map((c) => (
                <div key={c.metodo_cobro_id} className="flex items-center justify-between pl-5">
                  <span className="text-xs text-blue-600">{c.nombre}</span>
                  <div className="flex items-center gap-2">
                    {c.moneda === 'BS' && c.cobrosNativo > 0 && (
                      <span className="text-xs text-blue-400">{formatBs(c.cobrosNativo)}</span>
                    )}
                    <span className="text-xs font-semibold text-blue-700">
                      {c.moneda === 'BS'
                        ? formatUsd(tasaDelDia > 0 ? c.cobrosNativo / tasaDelDia : 0)
                        : formatUsd(c.cobrosUsd)
                      }
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center border-t border-blue-200 pt-1 pl-5">
                <span className="text-xs font-semibold text-blue-700">Total cobros CxC</span>
                <div className="flex items-center gap-2">
                  {totalCobrosBs > 0 && (
                    <span className="text-xs text-blue-400">{formatBs(totalCobrosBs)}</span>
                  )}
                  <span className="text-xs font-bold text-blue-700">
                    {formatUsd(tasaDelDia > 0 && totalCobrosBs > 0 ? totalCobrosBs / tasaDelDia : totalCobrosUsd)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Saldo a favor aplicado como pago directo en POS */}
          {haySaf && (
            <button
              type="button"
              onClick={onSafClick}
              disabled={!onSafClick}
              className={`w-full flex items-center justify-between rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2.5 text-left ${onSafClick ? 'hover:bg-violet-50 hover:shadow-sm transition-all cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-2">
                <Coins size={16} className="text-violet-500" />
                <div>
                  <p className="text-sm font-medium text-violet-700">Saldo a favor aplicado</p>
                  <p className="text-xs text-violet-500">Credito consumido de clientes</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {safBs > 0 && (
                  <span className="text-xs text-violet-400">{formatBs(safBs)}</span>
                )}
                <span className="text-sm font-bold text-violet-700">{formatUsd(safTotalUsd)}</span>
              </div>
            </button>
          )}

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
            {/* Siempre mostrar Total Facturado primero */}
            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <span>Total facturado</span>
              <div className="flex items-center gap-2">
                {(totalCobradoBs + cxcTotalBs) > 0 && (
                  <span className="text-xs">{formatBs(totalCobradoBs + cxcTotalBs)}</span>
                )}
                <span className="font-semibold">{formatUsd(totalCobradoUsd + cxcTotalUsd)}</span>
              </div>
            </div>

            {/* Cobros CxC via POS total (suma al total esperado) */}
            {hayCobrosViaPOS && (
              <div className="flex justify-between items-center text-sm text-blue-600">
                <span className="flex items-center gap-1">
                  <span className="text-blue-400">+</span> Cobros CxC via POS
                </span>
                <div className="flex items-center gap-2">
                  {totalCobrosBs > 0 && (
                    <span className="text-xs text-blue-400">{formatBs(totalCobrosBs)}</span>
                  )}
                  <span className="font-bold">
                    {formatUsd(tasaDelDia > 0 && totalCobrosBs > 0 ? totalCobrosBs / tasaDelDia : totalCobrosUsd)}
                  </span>
                </div>
              </div>
            )}

            {/* Restar CxC si existe */}
            {cxcTotalUsd > 0.005 && (
              <div className="flex justify-between items-center text-sm text-red-600">
                <span className="flex items-center gap-1">
                  <span className="text-red-400">–</span> A credito (CxC)
                </span>
                <div className="flex items-center gap-2">
                  {cxcTotalBs > 0 && (
                    <span className="text-xs text-red-400">{formatBs(cxcTotalBs)}</span>
                  )}
                  <span className="font-bold">{formatUsd(cxcTotalUsd)}</span>
                </div>
              </div>
            )}

            {/* Total Cobrado — linea enfatizada para comparar con metodos */}
            <div className="flex justify-between items-center text-sm font-bold pt-1.5 border-t">
              <span>Total cobrado</span>
              <div className="flex items-center gap-2">
                {totalCobradoBs > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">{formatBs(totalCobradoBs)}</span>
                )}
                <span className="text-base">{formatUsd(totalCobradoUsd)}</span>
              </div>
            </div>

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
                      {formatBs(totales.totalFacturadoBs + totalCobrosBs)}
                    </span>
                    <span className="text-sm font-bold">{formatUsd(totales.totalFacturadoUsd + (tasaDelDia > 0 && totalCobrosBs > 0 ? totalCobrosBs / tasaDelDia : totalCobrosUsd))}</span>
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
