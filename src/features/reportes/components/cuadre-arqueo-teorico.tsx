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
  egresosUsd: number              // egresos/retiros en USD
  egresosBsNativo: number         // egresos/retiros en Bs nativos
  conteoFisicoUsd: number         // total del conteo físico en USD (from cuadre-conteo-fisico)
  conteoFisicoBs: number          // total del conteo físico en Bs. nativos (from cuadre-conteo-fisico)
  tasaCambio: number
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
  conteoFisicoUsd,
  conteoFisicoBs,
  tasaCambio,
}: CuadreArqueoTeoricoProps) {
  // Track USD: solo componentes en USD (sin convertir Bs nativos)
  const teoricoUsd = fondoAperturaUsd + ventasEfectivoUsd + ingresosEfectivoUsd - egresosUsd
  // Track Bs: apertura nativa + ventas/ingresos/egresos Bs nativos + conversión del track USD
  const teoricoBs = fondoAperturaBs
    + ventasEfectivoBsNativo
    + ingresosEfectivoBsNativo
    - egresosBsNativo
    + usdToBs(ventasEfectivoUsd + ingresosEfectivoUsd - egresosUsd, tasaCambio).toNumber()

  // Diferencias independientes por moneda
  const diferenciaUsd = conteoFisicoUsd - teoricoUsd
  const diferenciaBs  = conteoFisicoBs  - teoricoBs   // comparación nativa Bs

  const fondoAperturaUsdBs = usdToBs(fondoAperturaUsd, tasaCambio).toNumber()
  const ventasEfectivoBs = usdToBs(ventasEfectivoUsd, tasaCambio).toNumber()
  const ingresosEfectivoBs = usdToBs(ingresosEfectivoUsd, tasaCambio).toNumber()
  const egresosUsdBs = usdToBs(egresosUsd, tasaCambio).toNumber()


  // Exacto cuando ambas monedas cuadran
  const isExact = Math.abs(diferenciaUsd) <= 0.01 && Math.abs(diferenciaBs) <= 0.01
  // Sobrante cuando hay excedente en AMBAS monedas
  const isSurplus = diferenciaUsd > 0.01 && diferenciaBs > 0.01

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
            FONDO + VENTA + INGRESOS − EGRESOS
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

        {/* Egresos USD */}
        {(egresosUsd > 0.001 || egresosBsNativo <= 0.001) && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 text-center font-mono text-xs text-red-500">−</span>
              <span className="text-muted-foreground">
                Egresos / Retiros{egresosBsNativo > 0.001 ? ' ($)' : ''}
              </span>
            </div>
            <div className="text-right">
              <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
                {formatUsd(egresosUsd)}
              </span>
              {tasaCambio > 0 && egresosUsdBs > 0.001 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatBs(egresosUsdBs)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Egresos Bs nativos */}
        {egresosBsNativo > 0.001 && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 text-center font-mono text-xs text-red-500">−</span>
              <span className="text-muted-foreground">Egresos / Retiros (Bs.)</span>
            </div>
            <div className="text-right">
              <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
                {formatBs(egresosBsNativo)}
              </span>
              {tasaCambio > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatUsd(egresosBsNativo / tasaCambio)}
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
          {fondoAperturaBs > 0.001 ? (
            <>
              <p className="text-xl font-bold tabular-nums">{formatBs(teoricoBs)}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{formatUsd(teoricoUsd)}</p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold tabular-nums">{formatUsd(teoricoUsd)}</p>
              {tasaCambio > 0 && teoricoBs > 0.001 && (
                <p className="text-xs text-muted-foreground tabular-nums">{formatBs(teoricoBs)}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-dashed border-border" />

      {/* Conteo físico vs Teórico */}
      <div className="space-y-2">
        {/* Conteo Físico */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Conteo Físico</span>
          <div className="text-right">
            <span className="font-medium tabular-nums">{formatUsd(conteoFisicoUsd)}</span>
            {(fondoAperturaBs > 0.001 || conteoFisicoBs > 0.001) && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatBs(conteoFisicoBs)}
              </p>
            )}
          </div>
        </div>

        {/* Diferencia */}
        <div
          className={cn(
            'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold',
            isExact
              ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
              : isSurplus
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
          )}
        >
          <span>
            {isExact ? 'Cuadrado' : isSurplus ? 'Sobrante' : 'Faltante'}
          </span>
          <div className="text-right">
            <span className="tabular-nums">
              {isExact
                ? formatUsd(0)
                : diferenciaUsd > 0.01
                  ? `+${formatUsd(diferenciaUsd)}`
                  : formatUsd(diferenciaUsd)}
            </span>
            {(fondoAperturaBs > 0.001 || Math.abs(diferenciaBs) > 0.01) && (
              <p className="text-xs font-normal opacity-80 tabular-nums">
                {isExact
                  ? formatBs(0)
                  : diferenciaBs > 0.01
                    ? `+${formatBs(diferenciaBs)}`
                    : formatBs(diferenciaBs)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
