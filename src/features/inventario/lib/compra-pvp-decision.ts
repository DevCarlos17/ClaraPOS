/**
 * Funciones puras que gobiernan el calculo y la edicion del PVP en el flujo
 * de Compras (Paso 2 del wizard mobile + `compra-form.tsx` desktop).
 *
 * Extraidas 1:1 de `compra-form.tsx` L667-899 (`getCostoNuevoUsdForLinea`,
 * `construirPvpNiveles`, el branch por-nivel de `handleDecisionNivel`,
 * `handlePvpNivelInputChange`, `handleMargenNivelInputChange`) — ver
 * design.md decision #3. NO son un hook: el store del wizard
 * (`compra-wizard-store.ts`) necesita invocarlas de forma sincrona desde una
 * action de Zustand, y los hooks de React no se pueden llamar ahi.
 *
 * Parametrizadas: reciben los datos de la linea (costo_input/factor/PVPs
 * actuales) y el contexto de tasas/moneda como argumentos explicitos, sin
 * depender de `setLineas` ni de ningun estado de React. Tanto `LineaUI`
 * (compra-form.tsx) como `LineaWizardCompra` (compra-wizard-store.ts)
 * comparten los mismos nombres/tipos de campo para lo que aqui se necesita,
 * asi que ambas satisfacen `LineaCostoPvp` estructuralmente sin adaptarse.
 */

import Decimal from 'decimal.js'
import {
  calcularMargenSiSeMantienePvp,
  calcularPvpSiSeMantieneMargen,
  type DecisionPvp,
} from './compra-precio-gating'

export type CampoPvp = 'precio_venta_usd' | 'precio_mayor_usd' | 'precio_especial_usd'

/** Estado de edicion de PVP para un nivel de precio especifico. Mismo shape
 * que la interfaz privada `PvpNivelUI` de `compra-form.tsx` — este modulo es
 * su "home" definitivo (ver tasks.md 3a.5/W4a: `compra-wizard-store.ts`
 * importa este tipo en lugar de declarar su propia copia temporal). */
export interface PvpNivelUI {
  orden: number
  nombre: string
  campo: CampoPvp
  /** PVP actual del producto en USD (read-only). */
  pvp_actual_usd: number
  /** PVP editable en moneda display. */
  pvp_input: string
  /** Margen % editable. */
  margen_input: string
  /** true cuando nuevo_costo > pvp_actual_usd. */
  violado: boolean
  /** Decision explicita del usuario sobre este nivel. */
  decision: DecisionPvp
  /** Vista base de comparacion, siempre poblada. */
  margen_si_mantiene_pvp: string
}

export interface NivelPrecioLike {
  orden: number
  nombre: string
}

/** Subconjunto de una linea de compra necesario para el calculo del costo
 * contable y la proyeccion de niveles PVP. */
export interface LineaCostoPvp {
  costo_input: number
  factor: number
  precio_venta_usd: string
  precio_mayor_usd: string
  precio_especial_usd: string
}

export interface TasaContext {
  moneda: 'USD' | 'BS'
  usaTasaParalela: boolean
  tasaInternaNum: number
  tasaFacturaNum: number
}

/** Mapea el orden de un nivel de precio al campo correspondiente en productos. */
function getPvpCampoByOrden(orden: number): CampoPvp {
  if (orden === 1) return 'precio_venta_usd'
  if (orden === 2) return 'precio_mayor_usd'
  return 'precio_especial_usd'
}

/** Obtiene el valor de PVP de una linea para el campo dado (type-safe). */
function getPvpValueFromLinea(l: LineaCostoPvp, campo: CampoPvp): string {
  if (campo === 'precio_venta_usd') return l.precio_venta_usd
  if (campo === 'precio_mayor_usd') return l.precio_mayor_usd
  return l.precio_especial_usd
}

/**
 * Costo CONTABLE de una linea en USD por unidad base — usado para clasificar
 * Caso A/B, proyectar niveles de precio, calcular margenes y resolver
 * decisiones.
 *
 * Los margenes/PVP SIEMPRE se calculan contra el costo CONTABLE (el costo
 * real de reposicion a tasa interna/BCV), NO contra el costo segun factura
 * (tasa proveedor). Con tasa paralela ambos difieren: factura $1 a paralela
 * 1000 / interna 500 -> contable $2; un margen de 30% debe salir de $2, no
 * de $1. Sin tasa paralela, contable == factura y el resultado es identico.
 * Misma formula que `costo_usd_sistema` en el submit de `use-compras.ts`.
 */
export function getCostoNuevoUsdForLinea(
  linea: Pick<LineaCostoPvp, 'costo_input' | 'factor'>,
  ctx: TasaContext
): number {
  const factor = linea.factor > 0 ? linea.factor : 1
  if (ctx.moneda === 'USD') {
    const costoFacturaUsd = new Decimal(linea.costo_input).dividedBy(factor)
    if (ctx.usaTasaParalela && ctx.tasaInternaNum > 0 && ctx.tasaFacturaNum > 0) {
      return costoFacturaUsd.times(ctx.tasaFacturaNum).dividedBy(ctx.tasaInternaNum).toNumber()
    }
    return costoFacturaUsd.toNumber()
  }
  // BS: contable = costo_bs / tasa_interna / factor. Sin paralela, la tasa
  // interna coincide con la de factura, asi que el resultado no cambia.
  const tasaContable = ctx.usaTasaParalela && ctx.tasaInternaNum > 0 ? ctx.tasaInternaNum : ctx.tasaFacturaNum
  return tasaContable > 0
    ? new Decimal(linea.costo_input).dividedBy(tasaContable).dividedBy(factor).toNumber()
    : 0
}

/**
 * Determina si un nuevo costo difiere del costo actual lo suficiente como
 * para requerir una decision de PVP. Normaliza ambos valores a Bs antes de
 * comparar (en USD con tasas altas, Bs 0.01 de diferencia equivale a menos
 * de $0.0001) — mismo criterio que `handleNuevoCostoChange` en
 * `compra-form.tsx`. Umbral: diferencia >= 0.001 Bs se considera cambio.
 */
export function costoTieneCambioSignificativo(
  costoNuevo: number,
  costoActual: number,
  ctx: Pick<TasaContext, 'moneda' | 'tasaFacturaNum'>
): boolean {
  const toBs = (v: number) =>
    ctx.moneda === 'BS' ? v : (ctx.tasaFacturaNum > 0 ? new Decimal(v).times(ctx.tasaFacturaNum).toNumber() : v)
  return Math.abs(toBs(costoNuevo) - toBs(costoActual)) >= 0.001
}

/**
 * Construye la vista base de `pvp_niveles` para una linea a partir de su
 * costo CONTABLE actual (`getCostoNuevoUsdForLinea`). `violado` y
 * `margen_si_mantiene_pvp` salen SIEMPRE del contable, no del costo de
 * factura. Cada nivel arranca en `decision='pendiente'` — el usuario debe
 * elegir explicitamente.
 */
export function construirPvpNiveles(
  linea: LineaCostoPvp,
  ctx: TasaContext & { niveles: NivelPrecioLike[] }
): PvpNivelUI[] {
  const costoNuevoUsd = getCostoNuevoUsdForLinea(linea, ctx)
  return ctx.niveles.map((nivel) => {
    const campo = getPvpCampoByOrden(nivel.orden)
    const pvpActualUsd = parseFloat(getPvpValueFromLinea(linea, campo)) || 0
    const violado = costoNuevoUsd > pvpActualUsd + 0.0001
    const margenSiMantienePvp = calcularMargenSiSeMantienePvp(new Decimal(costoNuevoUsd), new Decimal(pvpActualUsd))
    const pvpDisplay = ctx.moneda === 'USD'
      ? pvpActualUsd
      : new Decimal(pvpActualUsd).times(ctx.tasaFacturaNum).toNumber()

    return {
      orden: nivel.orden,
      nombre: nivel.nombre,
      campo,
      pvp_actual_usd: pvpActualUsd,
      pvp_input: pvpDisplay.toFixed(2),
      margen_input: margenSiMantienePvp.toFixed(1),
      violado,
      decision: 'pendiente' as DecisionPvp,
      margen_si_mantiene_pvp: margenSiMantienePvp.toFixed(1),
    }
  })
}

export interface AplicarDecisionContext {
  costoNuevoUsd: number
  costoUsdActual: number
  moneda: 'USD' | 'BS'
  tasaFacturaNum: number
}

/**
 * Aplica la decision explicita del usuario sobre el PVP de UN nivel de
 * precio, tras un cambio de costo (Caso A/B). `mantener_pvp` congela el PVP
 * actual; `mantener_margen` recalcula el PVP preservando el margen %
 * original del nivel (Caso B lo ofrece como "Recalcular por %"); `manual`
 * habilita edicion bidireccional; `pendiente` revierte la decision.
 */
export function aplicarDecisionNivel(
  n: PvpNivelUI,
  decision: DecisionPvp,
  ctx: AplicarDecisionContext
): PvpNivelUI {
  if (decision === 'pendiente' || decision === 'manual') {
    return { ...n, decision }
  }

  if (decision === 'mantener_pvp') {
    const pvpDisplay = ctx.moneda === 'USD'
      ? n.pvp_actual_usd
      : new Decimal(n.pvp_actual_usd).times(ctx.tasaFacturaNum).toNumber()
    return { ...n, decision, pvp_input: pvpDisplay.toFixed(2), margen_input: n.margen_si_mantiene_pvp }
  }

  // mantener_margen: preserva el margen % ORIGINAL del nivel (antes del
  // cambio de costo), recalcula el PVP — nunca se delega al fallback de
  // margen del servidor (el guard de margen negativo client-side necesita
  // un numero concreto).
  const margenOriginalPct = ctx.costoUsdActual > 0 && n.pvp_actual_usd > 0
    ? new Decimal(n.pvp_actual_usd).minus(ctx.costoUsdActual).dividedBy(ctx.costoUsdActual).times(100)
    : new Decimal(0)
  const pvpUsd = calcularPvpSiSeMantieneMargen(new Decimal(ctx.costoNuevoUsd), margenOriginalPct)
  const pvpDisplay = ctx.moneda === 'USD'
    ? pvpUsd.toNumber()
    : pvpUsd.times(ctx.tasaFacturaNum).toNumber()
  return { ...n, decision, pvp_input: pvpDisplay.toFixed(2), margen_input: margenOriginalPct.toFixed(1) }
}

export interface ActualizarInputContext {
  costoNuevoUsd: number
  moneda: 'USD' | 'BS'
  tasaFacturaNum: number
}

/**
 * Usuario edita el PVP de un nivel especifico -> recalcular su margen.
 * `value` debe llegar YA clampeado (`clampNumeric`, responsabilidad del
 * caller — mismo split que el handler original en `compra-form.tsx`).
 */
export function actualizarPvpInput(
  n: PvpNivelUI,
  value: string,
  ctx: ActualizarInputContext
): PvpNivelUI {
  const pvpNum = parseFloat(value)
  if (isNaN(pvpNum) || pvpNum < 0) return { ...n, pvp_input: value }

  const pvpUsd = ctx.moneda === 'USD'
    ? pvpNum
    : (ctx.tasaFacturaNum > 0 ? new Decimal(pvpNum).dividedBy(ctx.tasaFacturaNum).toNumber() : pvpNum)
  const nuevoMargen = ctx.costoNuevoUsd > 0
    ? new Decimal(pvpUsd).minus(ctx.costoNuevoUsd).dividedBy(ctx.costoNuevoUsd).times(100).toFixed(1)
    : '0.0'
  return { ...n, pvp_input: value, margen_input: nuevoMargen }
}

/**
 * Usuario edita el margen de un nivel especifico -> recalcular su PVP.
 * `value` debe llegar YA clampeado (`clampNumeric`, responsabilidad del
 * caller).
 */
export function actualizarMargenInput(
  n: PvpNivelUI,
  value: string,
  ctx: ActualizarInputContext
): PvpNivelUI {
  const margenNum = parseFloat(value)
  if (isNaN(margenNum)) return { ...n, margen_input: value }

  const nuevoPvpUsd = new Decimal(ctx.costoNuevoUsd).times(new Decimal(1).plus(margenNum / 100)).toNumber()
  const nuevoPvpDisplay = ctx.moneda === 'USD'
    ? nuevoPvpUsd
    : new Decimal(nuevoPvpUsd).times(ctx.tasaFacturaNum).toNumber()
  return { ...n, margen_input: value, pvp_input: Math.max(0, nuevoPvpDisplay).toFixed(2) }
}
