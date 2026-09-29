import { useState } from 'react'
import { CaretDown, CaretUp } from '@phosphor-icons/react'
import { formatBs, formatUsd } from '@/lib/currency'

export interface WizardAcumuladorLinea {
  id: string
  titulo: string
  subtitulo?: string
  montoUsd: number
  montoBs: number
}

export interface WizardAcumuladorProps {
  /** Lineas acumuladas hasta el momento (productos, pagos, cargos, etc). */
  lineas: WizardAcumuladorLinea[]
  /** Total acumulado, en ambas monedas. */
  total: { usd: number; bs: number }
  /** Si arranca colapsado. Default true. */
  defaultCollapsed?: boolean
  /** Mensaje cuando, expandido, no hay lineas. */
  emptyMessage?: string
}

/**
 * Resumen colapsable para sheets de wizard: colapsado muestra "N items · $X",
 * expandido muestra el detalle de cada linea y el total en el footer.
 * Pensado para colocarse sticky arriba del body del sheet.
 */
export function WizardAcumulador({
  lineas,
  total,
  defaultCollapsed = true,
  emptyMessage = 'Sin items agregados',
}: WizardAcumuladorProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const count = lineas.length

  return (
    <div className="rounded-2xl bg-card border border-border shadow-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="w-full flex items-center justify-between gap-3 px-4 py-3"
      >
        <span className="text-sm text-muted-foreground">
          {count} {count === 1 ? 'item' : 'items'} ·{' '}
          <span className="text-foreground font-semibold">{formatUsd(total.usd)}</span>
        </span>
        {collapsed ? (
          <CaretDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <CaretUp className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {!collapsed && (
        <div className="border-t border-border">
          {count === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            <ul className="divide-y divide-border">
              {lineas.map((linea) => (
                <li key={linea.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground font-semibold truncate">{linea.titulo}</p>
                    {linea.subtitulo && (
                      <p className="text-xs text-muted-foreground truncate">{linea.subtitulo}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-foreground font-semibold tabular-nums">
                      {formatUsd(linea.montoUsd)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatBs(linea.montoBs)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/30 border-t border-border">
            <span className="text-sm text-muted-foreground">Total</span>
            <div className="text-right">
              <p className="text-base text-foreground font-bold tabular-nums">{formatUsd(total.usd)}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{formatBs(total.bs)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
