import { Wallet } from '@phosphor-icons/react'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { cn } from '@/lib/utils'

export interface CuadreNetoEsperadoProps {
  saldoContadoUsd: number          // efectivo en caja del día (contado)
  cobrosAnterioresUsd: number      // cobros de días anteriores aplicados hoy
  diferencialCambiarioUsd: number  // puede ser positivo o negativo
  tasaCambio: number               // tasa actual para mostrar Bs
}

export function CuadreNetoEsperado({
  saldoContadoUsd,
  cobrosAnterioresUsd,
  diferencialCambiarioUsd,
  tasaCambio,
}: CuadreNetoEsperadoProps) {
  const totalNeto = saldoContadoUsd + cobrosAnterioresUsd + diferencialCambiarioUsd
  const totalNetoBs = usdToBs(totalNeto, tasaCambio).toNumber()
  const saldoContadoBs = usdToBs(saldoContadoUsd, tasaCambio).toNumber()
  const cobrosAnterioresBs = usdToBs(cobrosAnterioresUsd, tasaCambio).toNumber()
  const diferencialBs = usdToBs(Math.abs(diferencialCambiarioUsd), tasaCambio).toNumber()

  const isPositive = totalNeto > 0.001
  const isNegative = totalNeto < -0.001

  const diferencialIsPositive = diferencialCambiarioUsd >= 0
  const diferencialAbs = Math.abs(diferencialCambiarioUsd)

  return (
    <div
      className={cn(
        'rounded-2xl bg-card shadow-lg p-6 border-2',
        isNegative
          ? 'border-red-200 dark:border-red-800'
          : isPositive
            ? 'border-green-200 dark:border-green-800'
            : 'border-border'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <div
          className={cn(
            'p-2 rounded-lg',
            isNegative
              ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400'
              : isPositive
                ? 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
          )}
        >
          <Wallet size={20} weight="bold" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Total Caja Neto Esperado
          </p>
          <p className="text-xs text-muted-foreground">
            Contado + Cobros Anteriores ± Diferencial
          </p>
        </div>
      </div>

      {/* Formula line items */}
      <div className="space-y-2 mb-4">
        {/* Saldo Efectivo Contado */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="w-4 text-center font-mono text-xs text-muted-foreground">=</span>
            <span className="text-muted-foreground">Saldo Efectivo Contado</span>
          </div>
          <div className="text-right">
            <span className="font-medium tabular-nums">{formatUsd(saldoContadoUsd)}</span>
            {tasaCambio > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatBs(saldoContadoBs)}
              </p>
            )}
          </div>
        </div>

        {/* Cobros Anteriores */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="w-4 text-center font-mono text-xs text-blue-500">+</span>
            <span className="text-muted-foreground">Cobros Anteriores (CxC)</span>
          </div>
          <div className="text-right">
            <span className="font-medium tabular-nums text-blue-600 dark:text-blue-400">
              {formatUsd(cobrosAnterioresUsd)}
            </span>
            {tasaCambio > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatBs(cobrosAnterioresBs)}
              </p>
            )}
          </div>
        </div>

        {/* Diferencial Cambiario */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'w-4 text-center font-mono text-xs',
                diferencialIsPositive
                  ? 'text-green-500'
                  : 'text-orange-500'
              )}
            >
              {diferencialIsPositive ? '+' : '−'}
            </span>
            <span className="text-muted-foreground">Diferencial Cambiario</span>
          </div>
          <div className="text-right">
            <span
              className={cn(
                'font-medium tabular-nums',
                diferencialIsPositive
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-orange-600 dark:text-orange-400'
              )}
            >
              {diferencialIsPositive ? '+' : '−'}{formatUsd(diferencialAbs)}
            </span>
            {tasaCambio > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {diferencialIsPositive ? '+' : '−'}{formatBs(diferencialBs)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border mb-4" />

      {/* Total */}
      <div className="flex items-end justify-between">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Total
        </p>
        <div className="text-right">
          <p
            className={cn(
              'text-3xl font-bold tabular-nums',
              isNegative
                ? 'text-red-600 dark:text-red-400'
                : isPositive
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-foreground'
            )}
          >
            {formatUsd(totalNeto)}
          </p>
          {tasaCambio > 0 && (
            <p
              className={cn(
                'text-sm font-medium tabular-nums mt-0.5',
                isNegative
                  ? 'text-red-500 dark:text-red-400'
                  : isPositive
                    ? 'text-green-500 dark:text-green-400'
                    : 'text-muted-foreground'
              )}
            >
              {formatBs(totalNetoBs)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
