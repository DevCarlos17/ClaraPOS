import { Calculator } from '@phosphor-icons/react'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { cn } from '@/lib/utils'

export interface CuadreArqueoTeoricoProps {
  fondoAperturaUsd: number    // fondo con que abrió la caja (useSesionApertura → aperturaUsd)
  fondoAperturaBs: number     // fondo inicial en Bs. nativos (useSesionApertura → aperturaBs)
  ventasEfectivoUsd: number   // ventas cobradas en efectivo del día (usePagosPorMetodo, tipo=EFECTIVO)
  ingresosEfectivoUsd: number // ingresos manuales en efectivo (useMovimientosManualesDia, origen=INGRESO_MANUAL)
  egresosUsd: number          // egresos/retiros de la sesión (useMovimientosManualesDia, tipo=EGRESO, EFECTIVO)
  conteoFisicoUsd: number     // total del conteo físico (from cuadre-conteo-fisico)
  tasaCambio: number
}

export function CuadreArqueoTeorico({
  fondoAperturaUsd,
  fondoAperturaBs,
  ventasEfectivoUsd,
  ingresosEfectivoUsd,
  egresosUsd,
  conteoFisicoUsd,
  tasaCambio,
}: CuadreArqueoTeoricoProps) {
  // Track USD: solo componentes en USD (sin convertir Bs nativos)
  const teoricoUsd = fondoAperturaUsd + ventasEfectivoUsd + ingresosEfectivoUsd - egresosUsd
  // Track Bs: apertura nativa en Bs + componentes USD convertidos
  const teoricoBs = fondoAperturaBs + usdToBs(ventasEfectivoUsd + ingresosEfectivoUsd - egresosUsd, tasaCambio).toNumber()

  const diferenciaUsd = conteoFisicoUsd - teoricoUsd

  const fondoAperturaUsdBs = usdToBs(fondoAperturaUsd, tasaCambio).toNumber()
  const ventasEfectivoBs = usdToBs(ventasEfectivoUsd, tasaCambio).toNumber()
  const ingresosEfectivoBs = usdToBs(ingresosEfectivoUsd, tasaCambio).toNumber()
  const egresosUsdBs = usdToBs(egresosUsd, tasaCambio).toNumber()
  const conteoFisicoBs = usdToBs(conteoFisicoUsd, tasaCambio).toNumber()
  const diferenciaBs = usdToBs(Math.abs(diferenciaUsd), tasaCambio).toNumber()

  const isExact = Math.abs(diferenciaUsd) <= 0.01
  const isSurplus = diferenciaUsd > 0.01   // conteo > teórico → sobran

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

        {/* Ventas Efectivo */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="w-4 text-center font-mono text-xs text-green-500">+</span>
            <span className="text-muted-foreground">Ventas Efectivo</span>
          </div>
          <div className="text-right">
            <span className="font-medium tabular-nums text-green-600 dark:text-green-400">
              {formatUsd(ventasEfectivoUsd)}
            </span>
            {tasaCambio > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatBs(ventasEfectivoBs)}
              </p>
            )}
          </div>
        </div>

        {/* Ingresos Manuales */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="w-4 text-center font-mono text-xs text-green-500">+</span>
            <span className="text-muted-foreground">Ingresos Manuales</span>
          </div>
          <div className="text-right">
            <span className="font-medium tabular-nums text-green-600 dark:text-green-400">
              {formatUsd(ingresosEfectivoUsd)}
            </span>
            {tasaCambio > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatBs(ingresosEfectivoBs)}
              </p>
            )}
          </div>
        </div>

        {/* Egresos */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="w-4 text-center font-mono text-xs text-red-500">−</span>
            <span className="text-muted-foreground">Egresos / Retiros</span>
          </div>
          <div className="text-right">
            <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
              {formatUsd(egresosUsd)}
            </span>
            {tasaCambio > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatBs(egresosUsdBs)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Total Teórico */}
      <div className="flex items-end justify-between">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Total Teórico
        </p>
        <div className="text-right">
          {tasaCambio > 0 && fondoAperturaBs > 0.001 ? (
            <>
              <p className="text-xl font-bold tabular-nums">{formatBs(teoricoBs)}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{formatUsd(teoricoUsd)}</p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold tabular-nums">{formatUsd(teoricoUsd)}</p>
              {tasaCambio > 0 && (
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
            {tasaCambio > 0 && (
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
                : isSurplus
                  ? `+${formatUsd(diferenciaUsd)}`
                  : formatUsd(diferenciaUsd)}
            </span>
            {tasaCambio > 0 && (
              <p className="text-xs font-normal opacity-80 tabular-nums">
                {isExact
                  ? formatBs(0)
                  : isSurplus
                    ? `+${formatBs(diferenciaBs)}`
                    : `−${formatBs(diferenciaBs)}`}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
