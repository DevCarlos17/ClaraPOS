import { Money, CreditCard, Coins, ArrowsLeftRight, HandFist, ArrowUUpLeft, Bank } from '@phosphor-icons/react'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import {
  usePagosPorMetodo,
  useCxcDelDia,
  useTotalesFiscales,
  useSafDiario,
  useAnticiposDelDia,
  useDiferencialCambiarioDelDia,
  useAbsorcionDelDia,
  useMovimientosManualesDia,
  useDevolucionTesoreriaNC,
  type CuadreFilters,
} from '../hooks/use-cuadre'
import { splitEgresosArqueo } from './cuadre-arqueo-teorico-model'

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
  const { movimientos: movimientosManuales, isLoading: loadingMovManuales } = useMovimientosManualesDia(filters)
  const {
    totalUsd: devolucionTesoreriaUsd,
    totalBs: devolucionTesoreriaBs,
    isLoading: loadingDevolucionTesoreria,
  } = useDevolucionTesoreriaNC(filters)

  // Excluir metodos EFECTIVO con saldo $0 (fondo inicial sin ventas en efectivo)
  const metodosMostrar = metodos.filter((m) => m.totalUsd > 0.001 || m.totalOriginal > 0.001)

  const cashBrutoUsd = metodosMostrar.reduce((sum, m) => sum + m.totalUsd, 0)
  const cashBrutoBs = metodosMostrar.reduce((sum, m) => {
    return sum + (m.moneda === 'BS' ? m.totalOriginal : m.totalBs)
  }, 0)

  const haySaf = safTotalUsd > 0.001
  const safBs = tasaDelDia > 0 ? usdToBs(safTotalUsd, tasaDelDia).toNumber() : 0

  // El diferencial neto en USD necesita la tasa del día para convertir el neto en Bs
  const diferencialNetoUsdCalc = tasaDelDia > 0 ? diferencialNetoBs / tasaDelDia : diferencialNetoUsd
  const absorcionUsdCalc = tasaDelDia > 0 ? absorcionBs / tasaDelDia : absorcionUsd

  // TOTAL COBRADO = cash bruto (incluye cobros de CxC vieja, dinero real en caja) + SAF
  // consumido + diferencial + absorcion. NO se resta cobrosAnteriores: esa resta existia
  // para que "Saldó facturas" (comparacion ya eliminada en PR#226) calzara contra lo
  // facturado de ESTA sesion. Sin esa comparacion, el proposito de este total es "dinero
  // real movido en caja" — el cobro de CxC vieja cuenta igual que cualquier otro efectivo.
  const totalCobradoUsd =
    cashBrutoUsd + safTotalUsd + (hayDiferencial ? diferencialNetoUsdCalc : 0) + (hayAbsorcion ? absorcionUsdCalc : 0)
  const totalCobradoBs =
    cashBrutoBs + safBs + (hayDiferencial ? diferencialNetoBs : 0) + (hayAbsorcion ? absorcionBs : 0)

  // Reintegro NC (sesion) — reembolso de NC pagado EN EFECTIVO de ESTA sesion (origen='NCR'
  // en movimientos_metodo_cobro). Reutiliza el MISMO split que usa la Card "Arqueo Teorico"
  // (splitEgresosArqueo + useMovimientosManualesDia, cuadre-page.tsx) — read-only, misma
  // fuente de datos, sin recalcular desde cero. Esta plata SI salio de la sesion (va al
  // cliente), por eso resta del TOTAL NETO SESION.
  const { devolucionesNcUsd: reintegroSesionUsd, devolucionesNcBsNativo: reintegroSesionBsNativo } =
    splitEgresosArqueo(movimientosManuales)

  // TOTAL NETO SESIÓN (sdd/cuadre-saf-generado-consumido/nc-refund-right-card) — segundo
  // total que espeja la Card izquierda (Resumen de Caja, CuadreTotalNetoSesion): TOTAL
  // COBRADO (dinero/credito ya cobrado) + "A credito (CxC)" (pendiente de cobro de ESTA
  // sesion) - reintegroSesion (NC reembolsada en efectivo de la sesion) -
  // devolucionTesoreria (NC reembolsada desde banco/caja fuerte). TOTAL COBRADO en si NO
  // cambia. La Card izquierda SIEMPRE resta la NC completa sin importar el origen del
  // reembolso — estos 2 terminos son los que hacen que la derecha espeje ese mismo total
  // sin importar si el reembolso fue en efectivo de la sesion o desde tesoreria.
  const netoSesionUsd = totalCobradoUsd + cxcTotalUsd - reintegroSesionUsd - devolucionTesoreriaUsd
  const netoSesionBs = totalCobradoBs + cxcTotalBs - reintegroSesionBsNativo - devolucionTesoreriaBs

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
    loadingDiferencial ||
    loadingAbsorcion ||
    loadingMovManuales ||
    loadingDevolucionTesoreria

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
        !haySafGenerado ? (
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

          {/* TOTAL COBRADO — cash bruto + SAF consumido + diferencial + absorcion */}
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

          {/* Reintegro NC (sesion) — reembolso en EFECTIVO de ESTA sesion (origen='NCR') */}
          {reintegroSesionUsd > 0.001 && (
            <div
              data-testid="reintegro-nc-sesion"
              className="w-full flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50/40 px-3 py-2.5 text-left"
            >
              <div className="flex items-center gap-2">
                <ArrowUUpLeft size={16} className="text-rose-500" />
                <div>
                  <p className="text-sm font-medium text-rose-700">(−) Reintegro NC (sesión)</p>
                  <p className="text-xs text-rose-500">Devuelto en efectivo de esta sesion</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {reintegroSesionBsNativo > 0.001 && (
                  <span className="text-xs text-rose-400">{formatBs(reintegroSesionBsNativo)}</span>
                )}
                <span className="text-sm font-bold text-rose-700">{formatUsd(reintegroSesionUsd)}</span>
              </div>
            </div>
          )}

          {/* Devolucion de Tesoreria — reembolso real desde banco/caja fuerte (nunca salio de la sesion) */}
          {devolucionTesoreriaUsd > 0.001 && (
            <div
              data-testid="devolucion-tesoreria"
              className="w-full flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50/40 px-3 py-2.5 text-left"
            >
              <div className="flex items-center gap-2">
                <Bank size={16} className="text-rose-500" />
                <div>
                  <p className="text-sm font-medium text-rose-700">(−) Devolución de Tesorería</p>
                  <p className="text-xs text-rose-500">Reembolsado desde banco o caja fuerte</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {devolucionTesoreriaBs > 0.001 && (
                  <span className="text-xs text-rose-400">{formatBs(devolucionTesoreriaBs)}</span>
                )}
                <span className="text-sm font-bold text-rose-700">{formatUsd(devolucionTesoreriaUsd)}</span>
              </div>
            </div>
          )}

          {/* TOTAL NETO SESIÓN — TOTAL COBRADO + CxC pendiente - reintegroSesion - devolucionTesoreria (espeja la Card izquierda) */}
          <div data-testid="total-neto-sesion" className="pt-3 mt-1 border-t-2">
            <div className="flex justify-between items-center text-sm font-bold">
              <span>TOTAL NETO SESIÓN</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-normal text-muted-foreground">{formatUsd(netoSesionUsd)}</span>
                <span className="text-base">{formatBs(netoSesionBs)}</span>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
