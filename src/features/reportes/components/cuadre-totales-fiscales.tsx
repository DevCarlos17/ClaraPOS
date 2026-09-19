import { formatUsd, formatBs } from '@/lib/currency'
import { useTotalesFiscales, useIvaPorAlicuota, useIvaPorAlicuotaNC, type CuadreFilters } from '../hooks/use-cuadre'
import { buildFilasAlineadas, type CeldaConcepto } from './cuadre-totales-fiscales-model'

interface CuadreTotalesFiscalesProps {
  filters: CuadreFilters
}

function Row({ label, usd, bs, destacado = false, negativo = false }: {
  label: string
  usd: number
  bs: number
  destacado?: boolean
  negativo?: boolean
}) {
  const prefix = negativo ? '-' : ''
  return (
    <div className={`flex items-center justify-between py-1.5 px-2 rounded ${destacado ? 'bg-muted/60 font-semibold' : ''}`}>
      <span className={`text-sm ${negativo ? 'text-red-600' : destacado ? '' : 'text-muted-foreground'}`}>
        {label}
      </span>
      <div className="text-right">
        <span className={`text-sm font-mono ${negativo ? 'text-red-600' : ''}`}>
          {prefix}{formatBs(bs)}
        </span>
        <span className="text-xs text-muted-foreground ml-2">
          ({prefix}{formatUsd(usd)})
        </span>
      </div>
    </div>
  )
}

/** Celda de una columna (Ventas | Devoluciones) dentro de una fila alineada.
 * Si el concepto no existe de ese lado, pinta el dash de "sin dato" (mismo
 * patron usado en el resto de la app: `—` + `text-muted-foreground`). */
function CeldaAlineada({ celda }: { celda: CeldaConcepto | null }) {
  if (!celda) {
    return (
      <div className="flex items-center justify-between py-1.5 px-2 rounded">
        <span className="text-sm text-muted-foreground/50">—</span>
      </div>
    )
  }
  return <Row label={celda.label} usd={celda.usd} bs={celda.bs} negativo={celda.negativo} destacado={celda.destacado} />
}

export function CuadreTotalesFiscales({ filters }: CuadreTotalesFiscalesProps) {
  const { totales, isLoading } = useTotalesFiscales(filters)
  const { alicuotas, isLoading: loadingAlicuotas } = useIvaPorAlicuota(filters)
  const {
    alicuotas: alicuotasNc,
    totalNcrExentoUsd,
    totalNcrExentoBs,
    totalNcrBaseUsd,
    totalNcrBaseBs,
    totalNcrTotalUsd,
    totalNcrTotalBs,
    isLoading: loadingNc,
  } = useIvaPorAlicuotaNC(filters)

  const hayDescuento = totales.totalDescuentoUsd > 0.001
  const hayDevoluciones = totalNcrTotalUsd > 0.001

  // Bruto comercial = base + exento + descuento (valor antes de cualquier reducción ni impuesto)
  // — cálculo SIN CAMBIOS (ver engram sdd/nc-cuadre/subtotal-antes-impuestos).
  const totalAntesImpuestosUsd = totales.baseImponibleUsd + totales.totalExentoUsd + totales.totalDescuentoUsd
  const totalAntesImpuestosBs  = totales.baseImponibleBs  + totales.totalExentoBs  + totales.totalDescuentoBs

  // Sub total = base + exento (neto de descuento, antes de IVA) — sin cambios.
  const subTotalUsd = totales.baseImponibleUsd + totales.totalExentoUsd
  const subTotalBs  = totales.baseImponibleBs  + totales.totalExentoBs

  // Subtotal antes de impuestos del lado Devoluciones = base NC + exento NC
  // (totalNcrBaseUsd es el campo nuevo agregado a useIvaPorAlicuotaNC).
  const ncSubtotalUsd = totalNcrBaseUsd + totalNcrExentoUsd
  const ncSubtotalBs  = totalNcrBaseBs  + totalNcrExentoBs

  // Total facturado NETO = Ventas (totalVentasUsd/Bs) - Devoluciones de esta sesión
  // (totalNcrTotalUsd/Bs, a la tasa HISTÓRICA de cada NC — ver useIvaPorAlicuotaNC).
  const totalVentasNetasUsd = totales.totalVentasUsd - totalNcrTotalUsd
  const totalVentasNetasBs  = totales.totalVentasBs  - totalNcrTotalBs

  const filas = buildFilasAlineadas({
    totalAntesImpuestosUsd,
    totalAntesImpuestosBs,
    hayDescuento,
    totalDescuentoUsd: totales.totalDescuentoUsd,
    totalDescuentoBs: totales.totalDescuentoBs,
    subTotalUsd,
    subTotalBs,
    totalExentoVentasUsd: totales.totalExentoUsd,
    totalExentoVentasBs: totales.totalExentoBs,
    alicuotasVentas: alicuotas,
    totalVentasUsd: totales.totalVentasUsd,
    totalVentasBs: totales.totalVentasBs,
    totalIgtfUsd: totales.totalIgtfUsd,
    totalIgtfBs: totales.totalIgtfBs,

    hayDevoluciones,
    ncSubtotalUsd,
    ncSubtotalBs,
    totalNcrExentoUsd,
    totalNcrExentoBs,
    alicuotasNc,
    totalNcrTotalUsd,
    totalNcrTotalBs,
  })

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <h3 className="text-sm font-semibold mb-4">Resumen Fiscal</h3>

      {isLoading || loadingAlicuotas || loadingNc ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Cabecera de columnas (Ventas | Devoluciones) — solo desktop ── */}
          <div className="hidden lg:grid lg:grid-cols-2 gap-x-6 px-2">
            <span className="text-xs font-semibold text-muted-foreground">Ventas</span>
            <span className="text-xs font-semibold text-muted-foreground">Notas de Crédito (Devoluciones)</span>
          </div>

          {/* ── Grilla unificada: una fila por concepto fiscal, Ventas y ──
              Devoluciones alineados en la MISMA fila (union dinámica de
              conceptos — ver buildFilasAlineadas). En mobile cada fila
              colapsa a 1 columna, quedando Ventas y Devoluciones apilados
              pero agrupados dentro del mismo bloque con separador. */}
          <div className="space-y-0.5">
            {filas.map((fila) => (
              <div
                key={fila.key}
                className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-0.5 border-b border-border/40 pb-1 lg:border-b-0 lg:pb-0 last:border-0"
              >
                <CeldaAlineada celda={fila.ventas} />
                <CeldaAlineada celda={fila.devoluciones} />
              </div>
            ))}
          </div>

          {/* ── Total facturado NETO — full-width, resultado de restar ── */}
          <div className="border-t pt-3">
            <Row
              label="TOTAL FACTURADO NETO"
              usd={totalVentasNetasUsd}
              bs={totalVentasNetasBs}
              destacado
            />
          </div>
        </div>
      )}
    </div>
  )
}
