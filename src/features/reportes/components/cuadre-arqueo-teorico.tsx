import { Calculator } from '@phosphor-icons/react'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { cn } from '@/lib/utils'

export interface CuadreArqueoTeoricoProps {
  fondoAperturaUsd: number        // fondo con que abrió la caja (useSesionApertura → aperturaUsd)
  fondoAperturaBs: number         // fondo inicial en Bs. nativos (useSesionApertura → aperturaBs)
  ventasEfectivoUsd: number       // ventas cobradas en efectivo USD (usePagosPorMetodo, tipo=EFECTIVO, moneda!=BS)
  ventasEfectivoBsNativo: number  // ventas cobradas en efectivo Bs nativos (tipo=EFECTIVO, moneda=BS)
  ingresosEfectivoUsd: number     // ingresos manuales en efectivo USD
  ingresosEfectivoBsNativo: number // ingresos manuales en efectivo Bs nativos
  egresosUsd: number              // total egresos USD (retiros + vueltos + avances) — para el calculo
  egresosBsNativo: number         // total egresos Bs nativos — para el calculo
  /** Solo retiros manuales (EGRESO_MANUAL + EGRESO_TESORERIA + AVANCE + PRESTAMO). Display. */
  retirosManualesUsd: number
  retirosManualesBsNativo: number
  /** Vueltos entregados a clientes. Display. */
  vueltosUsd: number
  vueltosBsNativo: number
  tasaCambio: number
  /** Cobros CxC USD que ingresaron a caja (moneda != BS) */
  cobrosUsd?: number
  /** Cobros CxC Bs nativos que ingresaron a caja (moneda == BS) */
  cobrosBsNativo?: number
}

export function CuadreArqueoTeorico({
  fondoAperturaUsd,
  fondoAperturaBs,
  ventasEfectivoUsd,
  ventasEfectivoBsNativo,
  ingresosEfectivoUsd,
  ingresosEfectivoBsNativo,
  egresosUsd,
  egresosBsNativo,
  retirosManualesUsd,
  retirosManualesBsNativo,
  vueltosUsd,
  vueltosBsNativo,
  tasaCambio,
  cobrosUsd = 0,
  cobrosBsNativo = 0,
}: CuadreArqueoTeoricoProps) {
  // Track USD: solo montos nativos en USD
  const teoricoUsd = fondoAperturaUsd + ventasEfectivoUsd + (cobrosUsd ?? 0) + ingresosEfectivoUsd - egresosUsd
  // Track Bs: solo montos nativos en Bs
  const teoricoBs = fondoAperturaBs
    + ventasEfectivoBsNativo
    + (cobrosBsNativo ?? 0)
    + ingresosEfectivoBsNativo
    - egresosBsNativo

  // Conversiones para display secundario (informativas, no para comparación)
  const fondoAperturaUsdBs     = usdToBs(fondoAperturaUsd,      tasaCambio).toNumber()
  const ventasEfectivoBs       = usdToBs(ventasEfectivoUsd,     tasaCambio).toNumber()
  const ingresosEfectivoBs     = usdToBs(ingresosEfectivoUsd,   tasaCambio).toNumber()
  const retirosManualesUsdBs   = usdToBs(retirosManualesUsd,    tasaCambio).toNumber()
  const vueltosUsdBs           = usdToBs(vueltosUsd,            tasaCambio).toNumber()

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
          <Calculator size={18} weight="bold" />
        </div>
        <div>
          <p className="text-sm font-semibold">Arqueo Teórico</p>
          <p className="text-xs text-muted-foreground font-mono">
            FONDO + VENTA + COBRANZAS + INGRESOS − EGRESOS
          </p>
        </div>
      </div>

      {/* Formula line items */}
      <div className="space-y-2">
        {/* Fondo Apertura USD */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="w-4 text-center font-mono text-xs text-muted-foreground">=</span>
            <span className="text-muted-foreground">Fondo Apertura (USD)</span>
          </div>
          <div className="text-right">
            <span className="font-medium tabular-nums">{formatUsd(fondoAperturaUsd)}</span>
            {tasaCambio > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatBs(fondoAperturaUsdBs)}
              </p>
            )}
          </div>
        </div>

        {/* Fondo Apertura Bs. nativos */}
        {fondoAperturaBs > 0.001 && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 text-center font-mono text-xs text-muted-foreground">+</span>
              <span className="text-muted-foreground">Fondo Apertura (Bs.)</span>
            </div>
            <div className="text-right">
              <span className="font-medium tabular-nums">{formatBs(fondoAperturaBs)}</span>
              {tasaCambio > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatUsd(tasaCambio > 0 ? fondoAperturaBs / tasaCambio : 0)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Ventas Efectivo USD — solo si hay ventas en USD */}
        {(ventasEfectivoUsd > 0.001 || ventasEfectivoBsNativo <= 0.001) && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 text-center font-mono text-xs text-green-500">+</span>
              <span className="text-muted-foreground">
                Ventas Efectivo{ventasEfectivoBsNativo > 0.001 ? ' ($)' : ''}
              </span>
            </div>
            <div className="text-right">
              <span className="font-medium tabular-nums text-green-600 dark:text-green-400">
                {formatUsd(ventasEfectivoUsd)}
              </span>
              {tasaCambio > 0 && ventasEfectivoBs > 0.001 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatBs(ventasEfectivoBs)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Ventas Efectivo Bs nativos — solo si hay ventas en Bs */}
        {ventasEfectivoBsNativo > 0.001 && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 text-center font-mono text-xs text-green-500">+</span>
              <span className="text-muted-foreground">Ventas Efectivo (Bs.)</span>
            </div>
            <div className="text-right">
              <span className="font-medium tabular-nums text-green-600 dark:text-green-400">
                {formatBs(ventasEfectivoBsNativo)}
              </span>
              {tasaCambio > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatUsd(ventasEfectivoBsNativo / tasaCambio)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Cobranzas CxC USD */}
        {(cobrosUsd ?? 0) > 0.001 && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 text-center font-mono text-xs text-blue-500">+</span>
              <span className="text-muted-foreground">
                Cobranzas CxC{(cobrosBsNativo ?? 0) > 0.001 ? ' ($)' : ''}
              </span>
            </div>
            <div className="text-right">
              <span className="font-medium tabular-nums text-blue-600 dark:text-blue-400">
                {formatUsd(cobrosUsd ?? 0)}
              </span>
              {tasaCambio > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatBs(usdToBs(cobrosUsd ?? 0, tasaCambio).toNumber())}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Cobranzas CxC Bs nativos */}
        {(cobrosBsNativo ?? 0) > 0.001 && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 text-center font-mono text-xs text-blue-500">+</span>
              <span className="text-muted-foreground">Cobranzas CxC (Bs.)</span>
            </div>
            <div className="text-right">
              <span className="font-medium tabular-nums text-blue-600 dark:text-blue-400">
                {formatBs(cobrosBsNativo ?? 0)}
              </span>
              {tasaCambio > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatUsd((cobrosBsNativo ?? 0) / tasaCambio)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Ingresos Manuales USD */}
        {(ingresosEfectivoUsd > 0.001 || ingresosEfectivoBsNativo <= 0.001) && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 text-center font-mono text-xs text-green-500">+</span>
              <span className="text-muted-foreground">
                Ingresos Manuales{ingresosEfectivoBsNativo > 0.001 ? ' ($)' : ''}
              </span>
            </div>
            <div className="text-right">
              <span className="font-medium tabular-nums text-green-600 dark:text-green-400">
                {formatUsd(ingresosEfectivoUsd)}
              </span>
              {tasaCambio > 0 && ingresosEfectivoBs > 0.001 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatBs(ingresosEfectivoBs)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Ingresos Manuales Bs nativos */}
        {ingresosEfectivoBsNativo > 0.001 && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 text-center font-mono text-xs text-green-500">+</span>
              <span className="text-muted-foreground">Ingresos Manuales (Bs.)</span>
            </div>
            <div className="text-right">
              <span className="font-medium tabular-nums text-green-600 dark:text-green-400">
                {formatBs(ingresosEfectivoBsNativo)}
              </span>
              {tasaCambio > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatUsd(ingresosEfectivoBsNativo / tasaCambio)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Retiros manuales USD */}
        {retirosManualesUsd > 0.001 && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 text-center font-mono text-xs text-red-500">−</span>
              <span className="text-muted-foreground">
                Retiros{retirosManualesBsNativo > 0.001 ? ' ($)' : ''}
              </span>
            </div>
            <div className="text-right">
              <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
                {formatUsd(retirosManualesUsd)}
              </span>
              {tasaCambio > 0 && retirosManualesUsdBs > 0.001 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatBs(retirosManualesUsdBs)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Retiros manuales Bs nativos */}
        {retirosManualesBsNativo > 0.001 && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 text-center font-mono text-xs text-red-500">−</span>
              <span className="text-muted-foreground">Retiros (Bs.)</span>
            </div>
            <div className="text-right">
              <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
                {formatBs(retirosManualesBsNativo)}
              </span>
              {tasaCambio > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatUsd(retirosManualesBsNativo / tasaCambio)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Vueltos entregados USD */}
        {vueltosUsd > 0.001 && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 text-center font-mono text-xs text-orange-500">−</span>
              <span className="text-muted-foreground">
                Vueltos{vueltosBsNativo > 0.001 ? ' ($)' : ''}
              </span>
            </div>
            <div className="text-right">
              <span className="font-medium tabular-nums text-orange-600 dark:text-orange-400">
                {formatUsd(vueltosUsd)}
              </span>
              {tasaCambio > 0 && vueltosUsdBs > 0.001 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatBs(vueltosUsdBs)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Vueltos entregados Bs nativos */}
        {vueltosBsNativo > 0.001 && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 text-center font-mono text-xs text-orange-500">−</span>
              <span className="text-muted-foreground">Vueltos (Bs.)</span>
            </div>
            <div className="text-right">
              <span className="font-medium tabular-nums text-orange-600 dark:text-orange-400">
                {formatBs(vueltosBsNativo)}
              </span>
              {tasaCambio > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatUsd(vueltosBsNativo / tasaCambio)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Total Teórico */}
      <div className="flex items-end justify-between">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Total Teórico
        </p>
        <div className="text-right">
          {/* Mostrar cada track en su moneda nativa — sin conversiones entre ellas */}
          {teoricoBs > 0.001 && (
            <p className={cn(
              'tabular-nums',
              teoricoUsd > 0.001 ? 'text-sm font-semibold' : 'text-xl font-bold'
            )}>
              {formatBs(teoricoBs)}
            </p>
          )}
          {teoricoUsd > 0.001 && (
            <p className={cn(
              'tabular-nums',
              teoricoBs > 0.001 ? 'text-sm font-semibold' : 'text-xl font-bold'
            )}>
              {formatUsd(teoricoUsd)}
            </p>
          )}
          {teoricoBs <= 0.001 && teoricoUsd <= 0.001 && (
            <p className="text-xl font-bold tabular-nums">{formatUsd(0)}</p>
          )}
        </div>
      </div>

    </div>
  )
}
