import { formatUsd, formatBs } from '@/lib/currency'
import { useMobile } from '@/hooks/use-mobile'
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
  // Breakpoint 1024 alineado con el `lg:` de Tailwind usado en la grilla
  // desktop de abajo (NO el default 768 del hook) — evita un hueco entre
  // 768-1023px donde la grilla desktop colapsaria a 1 col pero seguiria
  // intercalando Ventas/NC concepto-a-concepto (el bug original).
  const isMobile = useMobile(1024)
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

  // Bloques MOBILE: derivados de la MISMA grilla alineada `filas` (cero
  // duplicacion de logica de calculo/union de conceptos). Cada bloque toma
  // SOLO las celdas no-nulas de su lado — un concepto que no existe de ese
  // lado (ej. Exento solo en Ventas) queda afuera del bloque, SIN placeholder
  // "—" (ese placeholder es exclusivo de la grilla alineada de desktop).
  const filasVentasMobile = filas
    .filter((fila) => fila.ventas !== null)
    .map((fila) => ({ key: fila.key, celda: fila.ventas as CeldaConcepto }))
  const filasDevolucionesMobile = filas
    .filter((fila) => fila.devoluciones !== null)
    .map((fila) => ({ key: fila.key, celda: fila.devoluciones as CeldaConcepto }))

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <h3 className="text-sm font-semibold mb-4">Resumen Fiscal</h3>

      {isLoading || loadingAlicuotas || loadingNc ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : isMobile ? (
        <div className="space-y-5">
          {/* ── MOBILE: bloques COMPLETOS apilados (Ventas entero, luego ──
              Devoluciones entero) en vez de intercalar concepto-a-concepto.
              Cada bloque solo trae sus PROPIOS conceptos reales — sin
              placeholder "—" (eso es exclusivo de la grilla alineada de
              desktop, donde hace falta para mantener la alineacion). */}
          <div role="group" aria-label="Ventas" className="space-y-0.5">
            <span className="text-xs font-semibold text-muted-foreground block px-2 mb-1">Ventas</span>
            {filasVentasMobile.map(({ key, celda }) => (
              <Row key={key} label={celda.label} usd={celda.usd} bs={celda.bs} negativo={celda.negativo} destacado={celda.destacado} />
            ))}
          </div>

          {filasDevolucionesMobile.length > 0 && (
            <div role="group" aria-label="Notas de Crédito (Devoluciones)" className="space-y-0.5 border-t border-border/40 pt-4">
              <span className="text-xs font-semibold text-muted-foreground block px-2 mb-1">Notas de Crédito (Devoluciones)</span>
              {filasDevolucionesMobile.map(({ key, celda }) => (
                <Row key={key} label={celda.label} usd={celda.usd} bs={celda.bs} negativo={celda.negativo} destacado={celda.destacado} />
              ))}
            </div>
          )}

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
      ) : (
        <div className="space-y-4">
          {/* ── DESKTOP: sin cambios (ver engram sdd/nc-cuadre/apply-progress). ──
              Clases responsive (hidden lg:, lg:grid-cols-2, etc.) se dejan
              intactas tal cual estaban aunque isMobile ya filtro el ancho —
              cero riesgo de drift visual, cero diff innecesario. */}
          <div className="hidden lg:grid lg:grid-cols-2 gap-x-6 px-2">
            <span className="text-xs font-semibold text-muted-foreground">Ventas</span>
            <span className="text-xs font-semibold text-muted-foreground">Notas de Crédito (Devoluciones)</span>
          </div>

          {/* ── Grilla unificada: una fila por concepto fiscal, Ventas y ──
              Devoluciones alineados en la MISMA fila (union dinámica de
              conceptos — ver buildFilasAlineadas). */}
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
