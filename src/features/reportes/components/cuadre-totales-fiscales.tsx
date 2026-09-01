import { Fragment } from 'react'
import { formatUsd, formatBs } from '@/lib/currency'
import { useTotalesFiscales, useIvaPorAlicuota, type CuadreFilters } from '../hooks/use-cuadre'

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

export function CuadreTotalesFiscales({ filters }: CuadreTotalesFiscalesProps) {
  const { totales, isLoading } = useTotalesFiscales(filters)
  const { alicuotas, isLoading: loadingAlicuotas } = useIvaPorAlicuota(filters)

  const hayDescuento = totales.totalDescuentoUsd > 0.001

  // Bruto comercial = base + exento + descuento (valor antes de cualquier reducción ni impuesto)
  const totalAntesImpuestosUsd = totales.baseImponibleUsd + totales.totalExentoUsd + totales.totalDescuentoUsd
  const totalAntesImpuestosBs  = totales.baseImponibleBs  + totales.totalExentoBs  + totales.totalDescuentoBs

  // Sub total = base + exento (neto de descuento, antes de IVA)
  const subTotalUsd = totales.baseImponibleUsd + totales.totalExentoUsd
  const subTotalBs  = totales.baseImponibleBs  + totales.totalExentoBs

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <h3 className="text-sm font-semibold mb-4">Resumen Fiscal</h3>

      {isLoading || loadingAlicuotas ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-0.5">

          {/* 1. Total facturado antes de impuestos */}
          <Row
            label="Total facturado (antes de impuestos)"
            usd={totalAntesImpuestosUsd}
            bs={totalAntesImpuestosBs}
          />

          {/* 2. Descuentos comerciales — solo si hay */}
          {hayDescuento && (
            <Row
              label="Descuentos comerciales"
              usd={totales.totalDescuentoUsd}
              bs={totales.totalDescuentoBs}
              negativo
            />
          )}

          {/* 3. Sub total — solo cuando hay descuento (evita repetir el mismo número) */}
          {hayDescuento && (
            <Row
              label="Sub total"
              usd={subTotalUsd}
              bs={subTotalBs}
              destacado
            />
          )}

          <div className="my-1 border-t" />

          {/* 4. Exento — solo si hay artículos exentos */}
          {totales.totalExentoUsd > 0.001 && (
            <Row
              label="Exento"
              usd={totales.totalExentoUsd}
              bs={totales.totalExentoBs}
            />
          )}

          {/* 5+6. Base imponible e IVA por alícuota — dinámico */}
          {alicuotas.map((a) => (
            <Fragment key={a.impuestoPct}>
              <Row
                label={`Base imponible ${a.impuestoPct}%`}
                usd={a.baseUsd}
                bs={a.baseBs}
              />
              <Row
                label={`IVA ${a.impuestoPct}%`}
                usd={a.montoIvaUsd}
                bs={a.montoIvaBs}
              />
            </Fragment>
          ))}

          <div className="my-1 border-t" />

          {/* 7. Total facturado final */}
          <Row
            label="Total facturado"
            usd={totales.totalVentasUsd}
            bs={totales.totalVentasBs}
            destacado
          />

          {/* IGTF — solo si aplica */}
          {totales.totalIgtfUsd > 0.001 && (
            <>
              <Row
                label="IGTF"
                usd={totales.totalIgtfUsd}
                bs={totales.totalIgtfBs}
              />
              <div className="my-1 border-t" />
              <Row
                label="Total General (c/IGTF)"
                usd={totales.totalVentasUsd + totales.totalIgtfUsd}
                bs={totales.totalVentasBs + totales.totalIgtfBs}
                destacado
              />
            </>
          )}

        </div>
      )}
    </div>
  )
}
