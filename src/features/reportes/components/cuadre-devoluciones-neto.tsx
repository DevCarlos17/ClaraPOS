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
  /** Propinas — Bs y USD ya en equivalente total (cross-convertidas con tasaPromedio, mismo valor que CuadreCajaNoFacturada muestra). */
  propinaUsd: number
  propinaBs: number
}

/**
 * Card 2 "Resumen de Caja" — "TOTAL NETO SESIÓN" (sdd/cuadre-propinas-y-ajustes-izquierda,
 * decision del owner). A diferencia de "TOTAL FACTURADO NETO" (solo factura - NC), este
 * total SI incluye la "caja no facturada en esta sesion": cobros anteriores (CxC de otra
 * sesion) + SAF generado + propinas.
 *
 * Diferencial Cambiario y Negocio asume (absorcion) NO se suman aqui: son faltantes de UNA
 * factura que YA esta contada en facturadoNetoUsd/Bs — solo describen COMO se resolvio el
 * cobro de esa factura (via la Card derecha, pagos-resumen.tsx), no dinero adicional.
 * Sumarlos aqui ademas de contarlos en la factura original seria doble conteo.
 *
 * Propinas SI se suma: es dinero que entro a caja via un metodo de pago sin estar ligado a
 * ninguna factura — ver engram sdd/cuadre-propinas-y-ajustes-izquierda/apply-progress.
 */
export function CuadreTotalNetoSesion({
  facturadoNetoUsd,
  facturadoNetoBs,
  cobrosAnterioresUsd,
  cobrosAnterioresBs,
  anticipoUsd,
  anticipoBs,
  propinaUsd,
  propinaBs,
}: CuadreTotalNetoSesionProps) {
  const netoSesionUsd = facturadoNetoUsd + cobrosAnterioresUsd + anticipoUsd + propinaUsd
  const netoSesionBs = facturadoNetoBs + cobrosAnterioresBs + anticipoBs + propinaBs

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

interface CuadreCajaNoFacturadaProps {
  /** Cobros Anteriores (CxC de sesiones previas) — Bs ya en equivalente (totalCobrosBsEquiv de useCobrosViaPOS), NO nativo. */
  cobrosAnterioresUsd: number
  cobrosAnterioresBs: number
  /** Cobros por Adelantado / SAF generado — Bs NATIVO (solo porcion VES, para display; subestima el total si se usara en calculos). */
  anticipoUsd: number
  anticipoBsNativo: number
  /** Propinas — Bs y USD ya en equivalente total (cross-convertidas con tasaPromedio). */
  propinaUsd: number
  propinaBs: number
}

/**
 * Card 2 "Resumen de Caja" — bloque "Caja no facturada en esta sesión"
 * (sdd/cuadre-propinas-y-ajustes-izquierda). Agrupa dinero/credito que entro a caja esta
 * sesion pero que NO es facturacion de ESTA sesion: Cobros Anteriores (CxC vieja), Cobros
 * por Adelantado (SAF generado) y Propinas (dinero que entro via un metodo de pago, no
 * ligado a ninguna factura).
 *
 * CAMBIO B (decision del owner): Diferencial Cambiario y Negocio asume (absorcion) NO
 * viven aqui — este componente ni siquiera acepta esos props. Son faltantes de UNA factura
 * ya facturada (por tanto ya contada en lo facturado): solo describen COMO se resolvio el
 * cobro de esa factura, y esa descripcion vive exclusivamente en la Card derecha
 * (pagos-resumen.tsx).
 */
export function CuadreCajaNoFacturada({
  cobrosAnterioresUsd,
  cobrosAnterioresBs,
  anticipoUsd,
  anticipoBsNativo,
  propinaUsd,
  propinaBs,
}: CuadreCajaNoFacturadaProps) {
  return (
    <div className="border-t-2 pt-3 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Caja no facturada en esta sesión
      </p>

      {/* Cobros Anteriores (CxC) */}
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Cobros Anteriores (CxC)</span>
        <div className="text-right">
          <div className="text-blue-600">{formatBs(cobrosAnterioresBs)}</div>
          <div className="text-xs text-muted-foreground">{formatUsd(cobrosAnterioresUsd)}</div>
        </div>
      </div>

      {/* Cobros por Adelantado (anticipos sin factura) */}
      {(anticipoUsd > 0.001 || anticipoBsNativo > 0.001) && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Cobros por Adelantado</span>
          <div className="text-right">
            {anticipoBsNativo > 0.001 && (
              <div className="text-indigo-600">{formatBs(anticipoBsNativo)}</div>
            )}
            {anticipoUsd > 0.001 && (
              <div className={anticipoBsNativo > 0.001 ? 'text-xs text-muted-foreground' : 'text-indigo-600'}>
                {formatUsd(anticipoUsd)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Propinas — movidas aqui desde su posicion anterior (entre Facturado y NC) */}
      {(propinaUsd > 0.001 || propinaBs > 0.001) && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Propinas</span>
          <div className="text-right">
            <div className="text-purple-600">{formatBs(propinaBs)}</div>
            <div className="text-xs text-muted-foreground">{formatUsd(propinaUsd)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
