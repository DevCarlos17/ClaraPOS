import { formatUsd, formatBs } from '@/lib/currency'

interface CuadreDevolucionesNetoProps {
  /** "Total Facturado (ventas)" ya calculado por la card (incluye IGTF, mismo campo que ya se pinta arriba). */
  totalFacturadoUsd: number
  totalFacturadoBs: number
  /** Total global de Notas de Credito de la sesion — reutiliza useIvaPorAlicuotaNC (Card 1), a tasa HISTORICA de cada NC. */
  totalNcrUsd: number
  totalNcrBs: number
}

/**
 * Card 2 "Resumen de Caja" — linea unica de devoluciones (SIN desglose
 * contado/credito, eso vive en Card 3 "Cobros por Metodo") + Total Neto de
 * la sesion. Diseno cerrado: engram sdd/nc-cuadre/card2-diseno.
 */
export function CuadreDevolucionesNeto({
  totalFacturadoUsd,
  totalFacturadoBs,
  totalNcrUsd,
  totalNcrBs,
}: CuadreDevolucionesNetoProps) {
  const netoUsd = totalFacturadoUsd - totalNcrUsd
  const netoBs = totalFacturadoBs - totalNcrBs

  return (
    <>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">(−) Notas de Crédito</span>
        <div className="text-right">
          <div className="text-red-600">-{formatBs(totalNcrBs)}</div>
          <div className="text-xs text-muted-foreground">-{formatUsd(totalNcrUsd)}</div>
        </div>
      </div>

      <div className="flex justify-between text-sm border-t pt-2">
        <span className="font-semibold">TOTAL NETO SESIÓN</span>
        <div className="text-right">
          <div className="font-semibold">{formatBs(netoBs)}</div>
          <div className="text-xs text-muted-foreground">{formatUsd(netoUsd)}</div>
        </div>
      </div>
    </>
  )
}
