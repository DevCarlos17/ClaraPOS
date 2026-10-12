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
 * contado/credito, eso vive en Card 3 "Cobros por Metodo") + "TOTAL FACTURADO
 * NETO" (facturado - NC). Diseno cerrado: engram sdd/nc-cuadre/card2-diseno.
 *
 * RELABEL (sdd/cuadre-cobros-anteriores-y-neto-sesion, Option A del owner):
 * este total se llamaba "TOTAL NETO SESIÓN" — se renombra a "TOTAL FACTURADO
 * NETO" porque ese nombre describe mejor lo que calcula (facturado neto de
 * NC, SIN caja no facturada). El nuevo "TOTAL NETO SESIÓN" (que SI incluye
 * caja no facturada) vive en CuadreTotalNetoSesion, mas abajo en este mismo
 * archivo, y se renderiza DESPUES del bloque "Caja no facturada en esta
 * sesion" en cuadre-page.tsx.
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
        <span className="font-semibold">TOTAL FACTURADO NETO</span>
        <div className="text-right">
          <div className="font-semibold">{formatBs(netoBs)}</div>
          <div className="text-xs text-muted-foreground">{formatUsd(netoUsd)}</div>
        </div>
      </div>
    </>
  )
}

interface CuadreTotalNetoSesionProps {
  /** "TOTAL FACTURADO NETO" ya calculado (facturado - NC), mismo valor que CuadreDevolucionesNeto muestra arriba. */
  facturadoNetoUsd: number
  facturadoNetoBs: number
  /** Cobros Anteriores (CxC de sesiones previas) — Bs ya en equivalente (totalCobrosBsEquiv de useCobrosViaPOS), NO nativo. */
  cobrosAnterioresUsd: number
  cobrosAnterioresBs: number
  /** Cobros por Adelantado / SAF generado — Bs en equivalente via usdToBs(anticipoUsd, tasa), NO anticipoBsNativo (subestima). */
  anticipoUsd: number
  anticipoBs: number
  /** Diferencial cambiario neto — solo se suma si hayDiferencial=true. */
  diferencialUsd?: number
  diferencialBs?: number
  hayDiferencial?: boolean
  /** Negocio asume (absorcion) — solo se suma si hayAbsorcion=true. */
  absorcionUsd?: number
  absorcionBs?: number
  hayAbsorcion?: boolean
}

/**
 * Card 2 "Resumen de Caja" — "TOTAL NETO SESIÓN" (sdd/cuadre-cobros-anteriores-y-neto-sesion,
 * Option A del owner). A diferencia de "TOTAL FACTURADO NETO" (solo factura - NC), este total
 * SI incluye la "caja no facturada en esta sesion": cobros anteriores (CxC de otra sesion) +
 * SAF generado + diferencial/absorcion cuando existen. Debe renderizarse DESPUES del bloque
 * "Caja no facturada en esta sesion" en cuadre-page.tsx, y debe calzar numericamente con
 * TOTAL COBRADO (Card derecha, pagos-resumen.tsx) en cualquier escenario balanceado — ver
 * engram #5346 (grafo de dependencias confirmado 100% aislado / seguro).
 */
export function CuadreTotalNetoSesion({
  facturadoNetoUsd,
  facturadoNetoBs,
  cobrosAnterioresUsd,
  cobrosAnterioresBs,
  anticipoUsd,
  anticipoBs,
  diferencialUsd = 0,
  diferencialBs = 0,
  hayDiferencial = false,
  absorcionUsd = 0,
  absorcionBs = 0,
  hayAbsorcion = false,
}: CuadreTotalNetoSesionProps) {
  const netoSesionUsd =
    facturadoNetoUsd + cobrosAnterioresUsd + anticipoUsd + (hayDiferencial ? diferencialUsd : 0) + (hayAbsorcion ? absorcionUsd : 0)
  const netoSesionBs =
    facturadoNetoBs + cobrosAnterioresBs + anticipoBs + (hayDiferencial ? diferencialBs : 0) + (hayAbsorcion ? absorcionBs : 0)

  return (
    <div className="flex justify-between text-sm border-t-2 pt-3">
      <span className="font-semibold">TOTAL NETO SESIÓN</span>
      <div className="text-right">
        <div className="font-semibold">{formatBs(netoSesionBs)}</div>
        <div className="text-xs text-muted-foreground">{formatUsd(netoSesionUsd)}</div>
      </div>
    </div>
  )
}
