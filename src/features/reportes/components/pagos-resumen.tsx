import { Money, CreditCard, Coins, ArrowsLeftRight, HandFist } from '@phosphor-icons/react'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import {
  usePagosPorMetodo,
  useCxcDelDia,
  useTotalesFiscales,
  useSafDiario,
  useAnticiposDelDia,
  useCobrosViaPOS,
  useDiferencialCambiarioDelDia,
  useAbsorcionDelDia,
  type CuadreFilters,
} from '../hooks/use-cuadre'

interface PagosResumenProps {
  filters: CuadreFilters
  tasaDelDia: number
  onMetodoClick?: (metodoNombre: string) => void
  onCreditoClick?: () => void
  onSafClick?: () => void
  onDiferencialClick?: () => void
  onAbsorcionClick?: () => void
  /** Nombre del metodo actualmente seleccionado — resalta la fila correspondiente */
  selectedMetodoId?: string | null
}

export function PagosResumen({
  filters,
  tasaDelDia,
  onMetodoClick,
  onCreditoClick,
  onSafClick,
  onDiferencialClick,
  onAbsorcionClick,
  selectedMetodoId,
}: PagosResumenProps) {
  const { metodos, isLoading } = usePagosPorMetodo(filters)
  const { cxcTotalUsd, cxcTotalBs, isLoading: loadingCxc } = useCxcDelDia(filters)
  const { isLoading: loadingTotales } = useTotalesFiscales(filters)
  const { totalUsd: safTotalUsd, isLoading: loadingSaf } = useSafDiario(filters)
  const { anticipoUsd, isLoading: loadingAnticipos } = useAnticiposDelDia(filters)
  const {
    totalCobrosUsd: cobrosAnterioresUsd,
    totalCobrosBsEquiv: cobrosAnterioresBs,
    isLoading: loadingCobrosAnteriores,
  } = useCobrosViaPOS(filters)
  const {
    netoBs: diferencialNetoBs,
    netoUsd: diferencialNetoUsd,
    hayDiferencial,
    isLoading: loadingDiferencial,
  } = useDiferencialCambiarioDelDia(filters)
  const {
    totalBs: absorcionBs,
    totalUsd: absorcionUsd,
    hayAbsorcion,
    isLoading: loadingAbsorcion,
  } = useAbsorcionDelDia(filters)

  // Excluir metodos EFECTIVO con saldo $0 (fondo inicial sin ventas en efectivo)
  const metodosMostrar = metodos.filter((m) => m.totalUsd > 0.001 || m.totalOriginal > 0.001)

  const cashBrutoUsd = metodosMostrar.reduce((sum, m) => sum + m.totalUsd, 0)
  const cashBrutoBs = metodosMostrar.reduce((sum, m) => {
    return sum + (m.moneda === 'BS' ? m.totalOriginal : m.totalBs)
  }, 0)

  // Cobros anteriores (CxC de sesion previa): ya estan incluidos en cashBruto por construccion
  // de usePagosPorMetodo (no filtra por created_at == venta.created_at). Hay que restarlos para
  // que TOTAL COBRADO no sobre-cuente efectivo que ya fue facturado en otra sesion.
  const hayCobrosAnteriores = cobrosAnterioresUsd > 0.001
  const cashNetoUsd = cashBrutoUsd - cobrosAnterioresUsd
  const cashNetoBs = cashBrutoBs - cobrosAnterioresBs

  const haySaf = safTotalUsd > 0.001
  const safBs = tasaDelDia > 0 ? usdToBs(safTotalUsd, tasaDelDia).toNumber() : 0

  // El diferencial neto en USD necesita la tasa del día para convertir el neto en Bs
  const diferencialNetoUsdCalc = tasaDelDia > 0 ? diferencialNetoBs / tasaDelDia : diferencialNetoUsd
  const absorcionUsdCalc = tasaDelDia > 0 ? absorcionBs / tasaDelDia : absorcionUsd

  // TOTAL COBRADO = cash neto (sin cobros anteriores) + SAF consumido + diferencial + absorcion
  const totalCobradoUsd =
    cashNetoUsd + safTotalUsd + (hayDiferencial ? diferencialNetoUsdCalc : 0) + (hayAbsorcion ? absorcionUsdCalc : 0)
  const totalCobradoBs =
    cashNetoBs + safBs + (hayDiferencial ? diferencialNetoBs : 0) + (hayAbsorcion ? absorcionBs : 0)

  // Saldo a favor generado (excedente del cliente, pasa a credito futuro). NO se muestra como
  // fila en esta card (pertenece solo a "Resumen de Caja" -> "Cobros por Adelantado"). Solo se
  // usa aqui para decidir el guard de empty-state (una sesion 100%-SAF-generado no debe caer
  // en "Sin cobros en esta fecha" si TOTAL COBRADO tiene algo que mostrar).
  const haySafGenerado = anticipoUsd > 0.001

  const isLoadingAll =
    isLoading ||
    loadingCxc ||
    loadingTotales ||
    loadingSaf ||
    loadingAnticipos ||
    loadingCobrosAnteriores ||
    loadingDiferencial ||
    loadingAbsorcion

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <h3 className="text-sm font-semibold mb-4">Cobros por Metodo de Pago</h3>

      {isLoadingAll ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : metodosMostrar.length === 0 &&
        cxcTotalUsd <= 0 &&
        !haySaf &&
        !hayDiferencial &&
        !hayAbsorcion &&
        !haySafGenerado &&
        !hayCobrosAnteriores ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Sin cobros en esta fecha</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Payment method rows */}
          {metodosMostrar.map((m) => {
            const clickable = !!onMetodoClick
            const isSelected = selectedMetodoId != null && m.nombre === selectedMetodoId
            const bsAmount = m.moneda === 'BS' ? m.totalOriginal : m.totalBs
            const hasBs = bsAmount > 0
            return (
              <button
                key={m.nombre}
                type="button"
                disabled={!clickable}
                onClick={() => onMetodoClick?.(m.nombre)}
                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-all ${
                  isSelected
                    ? 'bg-primary/10 border-l-2 border-primary shadow-sm'
                    : clickable
                    ? 'hover:bg-muted/50 hover:shadow-sm cursor-pointer'
                    : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <Money size={16} className="text-muted-foreground" />
                  <p className="text-sm font-medium">{m.nombre}</p>
                </div>
                <div className="flex items-center gap-2">
                  {m.moneda === 'BS' ? (
                    <>
                      <span className="text-xs text-muted-foreground">{formatUsd(m.totalUsd)}</span>
                      <span className="text-sm font-bold">{formatBs(bsAmount)}</span>
                    </>
                  ) : (
                    <>
                      {hasBs && (
                        <span className="text-xs text-muted-foreground">{formatBs(bsAmount)}</span>
                      )}
                      <span className="text-sm font-bold">{formatUsd(m.totalUsd)}</span>
                    </>
                  )}
                </div>
              </button>
            )
          })}

          {/* Cobros anteriores (CxC) — efectivo cobrado hoy de una factura de otra sesion.
              Se resta porque ya fue sumado dentro de metodosMostrar (usePagosPorMetodo no
              excluye cobros de CxC vieja) y no es parte del facturado de ESTA sesion. */}
          {hayCobrosAnteriores && (
            <div
              data-testid="cobros-anteriores"
              className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-2.5 text-left"
            >
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="text-slate-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Cobros anteriores (CxC)</p>
                  <p className="text-xs text-slate-500">Facturado en una sesion anterior</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{`-${formatBs(cobrosAnterioresBs)}`}</span>
                <span className="text-sm font-bold text-slate-600">{`-${formatUsd(cobrosAnterioresUsd)}`}</span>
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

          {/* Diferencial cambiario — solo si hay registros */}
          {hayDiferencial && (
            <button
              type="button"
              onClick={onDiferencialClick}
              disabled={!onDiferencialClick}
              className={`w-full flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2.5 text-left ${onDiferencialClick ? 'hover:bg-amber-50 hover:shadow-sm transition-all cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-2">
                <ArrowsLeftRight size={16} className="text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-amber-700">Diferencial cambiario</p>
                  <p className="text-xs text-amber-500">Faltantes autorizados por denominacion</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatUsd(diferencialNetoUsdCalc)}
                </span>
                <span className="text-sm font-bold text-amber-700">
                  {formatBs(diferencialNetoBs)}
                </span>
              </div>
            </button>
          )}

          {/* Negocio asume — solo si hay registros */}
          {hayAbsorcion && (
            <button
              type="button"
              onClick={onAbsorcionClick}
              disabled={!onAbsorcionClick}
              className={`w-full flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50/40 px-3 py-2.5 text-left ${onAbsorcionClick ? 'hover:bg-orange-50 hover:shadow-sm transition-all cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-2">
                <HandFist size={16} className="text-orange-500" />
                <div>
                  <p className="text-sm font-medium text-orange-700">Negocio asume</p>
                  <p className="text-xs text-orange-500">Faltantes autorizados por supervisor</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatUsd(absorcionUsdCalc)}
                </span>
                <span className="text-sm font-bold text-orange-700">
                  {formatBs(absorcionBs)}
                </span>
              </div>
            </button>
          )}

          {/* TOTAL COBRADO — cash neto + SAF consumido + diferencial + absorcion */}
          <div data-testid="total-cobrado" className="pt-2 mt-1 border-t">
            <div className="flex justify-between items-center text-sm font-bold">
              <span>TOTAL COBRADO</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-normal text-muted-foreground">{formatUsd(totalCobradoUsd)}</span>
                <span className="text-base">{formatBs(totalCobradoBs)}</span>
              </div>
            </div>
          </div>

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
                <span className="text-xs text-red-400">{formatUsd(cxcTotalUsd)}</span>
                <span className="text-sm font-bold text-red-600">{formatBs(cxcTotalBs)}</span>
              </div>
            </button>
          )}

        </div>
      )}
    </div>
  )
}
