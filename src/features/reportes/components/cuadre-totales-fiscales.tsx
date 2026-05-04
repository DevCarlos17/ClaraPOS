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

  const baseNetaUsd = Math.max(0, totales.baseImponibleUsd - totales.totalNcrUsd)
  const baseNetaBs = Math.max(0, totales.baseImponibleBs - totales.totalNcrBs)

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
          {/* Base imponible */}
          <Row
            label="Base imponible bruta"
            usd={totales.baseImponibleUsd}
            bs={totales.baseImponibleBs}
          />

          {/* NCR / Devoluciones */}
          {totales.totalNcrUsd > 0 && (
            <Row
              label="Devoluciones (NCR)"
              usd={totales.totalNcrUsd}
              bs={totales.totalNcrBs}
              negativo
            />
          )}

          {/* Base neta */}
          <Row
            label="Base imponible neta"
            usd={baseNetaUsd}
            bs={baseNetaBs}
            destacado
          />

          <div className="my-1 border-t" />

          {/* Exento */}
          {totales.totalExentoUsd > 0 && (
            <Row
              label="Ventas exentas"
              usd={totales.totalExentoUsd}
              bs={totales.totalExentoBs}
            />
          )}

          {/* IVA por alicuota */}
          {alicuotas.map((a) => (
            <Row
              key={a.impuestoPct}
              label={`IVA ${a.impuestoPct}% (s/ ${formatBs(a.baseBs)})`}
              usd={a.montoIvaUsd}
              bs={a.montoIvaBs}
            />
          ))}

          {/* IGTF */}
          {totales.totalIgtfUsd > 0 && (
            <Row
              label="IGTF"
              usd={totales.totalIgtfUsd}
              bs={totales.totalIgtfBs}
            />
          )}

          <div className="my-1 border-t" />

          {/* Total facturado */}
          <Row
            label="Total facturado"
            usd={totales.totalFacturadoUsd}
            bs={totales.totalFacturadoBs}
            destacado
          />
        </div>
      )}
    </div>
  )
}
