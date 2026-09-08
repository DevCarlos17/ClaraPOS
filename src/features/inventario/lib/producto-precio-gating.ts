/**
 * Funciones puras que gobiernan la proyeccion de PVP al editar el Costo en
 * ProductoForm (Tab "Precios y Fiscalidad").
 *
 * Motivo: editar el Costo (USD o Bs) de un producto NO debe mutar
 * precio_venta_usd/precio_mayor_usd/precio_especial_usd directamente. En su
 * lugar, se calcula una proyeccion (que preserva el margen % configurado por
 * nivel) que el usuario debe aplicar explicitamente. Ver
 * `openspec/changes/producto-form-pvp-gating/`.
 *
 * Tambien vive aqui el back-calculo inverso (margen + PVP -> costo), ver
 * `openspec/changes/producto-costo-backcalculo/`.
 */

import Decimal from 'decimal.js'

/**
 * Calcula el PVP proyectado que preserva el margen % configurado para un
 * nivel de precio dado un nuevo costo.
 *
 * `costo * (1 + margenPct / 100)`, nunca negativo (clamp a 0).
 */
export function calcularPrecioPreservandoMargen(costo: number, margenPct: number): number {
  return Math.max(0, costo * (1 + margenPct / 100))
}

/**
 * Determina si un nuevo costo viola la regla de negocio #7
 * (`precio_venta_usd >= costo_usd`): el costo nunca debe ser mayor o igual
 * al PVP actualmente vigente.
 */
export function calcularViolacionCostoPvp(costoNuevo: number, pvpActual: number): boolean {
  return costoNuevo >= pvpActual
}

/**
 * Fuente del ultimo valor tipeado en un nivel de precio (mayor/especial) al
 * momento de ejecutar el back-calculo de costo. Determina si la cascada debe
 * recalcular ese nivel (`'margen'`) o preservar el valor tipeado a mano
 * (`'precio'`). `null` es el default en modo edicion: "aun no se toco ningun
 * campo de ese nivel esta sesion" (ver design.md, seccion "Last Source"
 * State Model) y se trata igual que `'precio'` (se preserva).
 *
 * @deprecated Modelo "blur-and-anchor" superado por el modo de exploracion
 * continua (`debeExplorarCosto` + `calcularCostoDesdeNivel` +
 * `fijarCostoYCascada`). Se mantiene SOLO porque `producto-form.tsx` aun lo
 * importa (PR en curso `producto-costo-backcalculo`, PR 2 lo elimina junto
 * con `debeBackCalcularCosto`/`backcalcularCostoYCascada`). No usar en
 * codigo nuevo.
 */
export type FuentePrecio = 'margen' | 'precio' | null

/**
 * Predicado centralizado que decide si el back-calculo de costo debe
 * dispararse (solo en blur, nunca por tecla — el caller es responsable de
 * invocarlo unicamente desde handlers de blur). Las 4 condiciones deben
 * cumplirse TODAS (ver spec.md, Requirement "Condiciones de Disparo"):
 *
 * 1. El costo esta vacio (`'0'` explicito NO cuenta como vacio).
 * 2. Hay un margen DETAL cargado (no vacio).
 * 3. Hay un PVP DETAL (o precio final DETAL, ya resuelto por el caller a un
 *    PVP equivalente antes de llamar) mayor a 0.
 * 4. El producto no es un combo.
 *
 * @deprecated Ver `FuentePrecio`. Reemplazado por `debeExplorarCosto`
 * (modo exploracion continua, `openspec/changes/producto-costo-backcalculo/`).
 */
export function debeBackCalcularCosto(p: {
  costoUsd: string
  esCombo: boolean
  margenDetalPct: string
  pvpDetalUsd: number
}): boolean {
  if (p.costoUsd.trim() !== '') return false
  if (p.esCombo) return false
  if (p.margenDetalPct.trim() === '') return false
  if (!(p.pvpDetalUsd > 0)) return false
  return true
}

/**
 * Back-calcula `costo_usd` a partir del margen y PVP DETAL, y cascada el
 * resultado a mayor/especial preservando cualquier precio tipeado a mano.
 *
 * `costo = pvp / (1 + margenDetal / 100)` (margen 0% => costo = pvp). Para
 * cada nivel (mayor/especial): si `ultimaFuente !== 'margen'` se preserva
 * (retorna `null`, el caller no debe tocar ese campo); si es `'margen'`, se
 * recalcula `costo * (1 + margenNivel / 100)` con el margen clampado
 * defensivamente a `>= 0` (protege contra un margen negativo que se haya
 * colado sin pasar por el clamp del formulario).
 *
 * Sin redondeo interno: el caller redondea una sola vez (`.toFixed(2)`) al
 * escribir el estado.
 *
 * @deprecated Ver `FuentePrecio`. Reemplazado por `calcularCostoDesdeNivel`
 * (recalculo continuo desde el nivel editado) + `fijarCostoYCascada`
 * (cascada al anclar), `openspec/changes/producto-costo-backcalculo/`.
 */
export function backcalcularCostoYCascada(input: {
  pvpDetalUsd: Decimal
  margenDetalPct: Decimal
  margenMayorPct: Decimal
  margenEspecialPct: Decimal
  ultimaFuenteMayor: FuentePrecio
  ultimaFuenteEspecial: FuentePrecio
}): { costoUsd: Decimal; mayorUsd: Decimal | null; especialUsd: Decimal | null } {
  const costoUsd = input.pvpDetalUsd.dividedBy(new Decimal(1).plus(input.margenDetalPct.dividedBy(100)))

  const calcularNivel = (fuente: FuentePrecio, margenPct: Decimal): Decimal | null => {
    if (fuente !== 'margen') return null
    const margenClamp = Decimal.max(0, margenPct)
    return costoUsd.times(new Decimal(1).plus(margenClamp.dividedBy(100)))
  }

  return {
    costoUsd,
    mayorUsd: calcularNivel(input.ultimaFuenteMayor, input.margenMayorPct),
    especialUsd: calcularNivel(input.ultimaFuenteEspecial, input.margenEspecialPct),
  }
}

/**
 * Calcula el equivalente en Bs de un costo back-calculado, con guard de tasa
 * invalida (mismo criterio que `bsToUsd` en `src/lib/currency.ts`): si la
 * tasa es `<= 0`, retorna `null` en lugar de escribir un Bs erroneo (0 o
 * negativo), dejando el campo Bs sin tocar. Nunca divide, por lo que no hay
 * riesgo de division por cero.
 */
export function calcularCostoBsBackCalculado(costoUsd: Decimal, tasa: Decimal): Decimal | null {
  if (tasa.lte(0)) return null
  return costoUsd.times(tasa)
}

/**
 * Predicado del modo "exploracion continua" (reemplaza el modelo
 * "blur-and-anchor" de `debeBackCalcularCosto`): mientras el usuario no haya
 * decidido un costo propio, cada `onChange` de margen/PVP/final de
 * cualquier nivel recalcula el costo en vivo (ver design.md, Decision 2 y 4;
 * spec.md, Requirement "Modo Exploracion — Activacion").
 *
 * Exploracion activa cuando:
 * - `costoEsPreview` es `true` (el valor actual de costo_usd/costo_bs fue
 *   escrito por el propio sistema como preview, no tipeado por el usuario —
 *   el primer recalculo ya deja de estar "vacio" pero sigue siendo
 *   explorable), O
 * - AMBOS costos (`costoUsd` y `costoBs`) estan vacios (`trim() === ''`).
 *
 * El caller (producto-form.tsx) es responsable de excluir combos: nunca
 * llama a esta funcion, o siempre pasa un costo fijo, para productos con
 * `esCombo === true` (costo `0` fijo, ver spec.md).
 */
export function debeExplorarCosto(p: {
  costoUsd: string
  costoBs: string
  costoEsPreview: boolean
}): boolean {
  if (p.costoEsPreview) return true
  return p.costoUsd.trim() === '' && p.costoBs.trim() === ''
}

/**
 * Back-calcula el costo desde el PVP y margen % de UN nivel de precio
 * (detal, mayor o especial — el caller decide cual, pasando los valores
 * frescos de ese nivel). Reemplaza `backcalcularCostoYCascada` en el modo de
 * exploracion continua: no cascada por si sola (ver `fijarCostoYCascada`
 * para eso), solo resuelve el costo del nivel editado.
 *
 * `costo = pvp / (1 + margen / 100)` (margen 0% => costo = pvp).
 *
 * Si el input es un precio final (con IVA), el caller debe resolverlo a PVP
 * primero (`pvp = final / (1 + iva/100)`) antes de llamar a esta funcion —
 * no recibe `ivaPct` porque esa resolucion es responsabilidad del caller
 * (ver design.md, seccion "Nuevas Funciones Puras").
 *
 * Retorna `null` cuando `pvpUsd <= 0`: no hay nada que calcular todavia
 * (equivalente a la condicion 3 de `debeBackCalcularCosto`, pero evaluada
 * dentro de la funcion de calculo en vez de en un predicado de disparo
 * separado).
 *
 * Retorna `null` tambien cuando `margenPct <= -100`: el divisor
 * `1 + margenPct / 100` seria `<= 0`, produciendo `Infinity` (division por
 * cero en `-100`) o un costo NEGATIVO (margenes por debajo de `-100`). Un
 * margen `<= -100%` no corresponde a ningun costo real, asi que no se
 * calcula (guard defensivo: el margen puede llegar sin pasar por el clamp
 * del formulario, p.ej. margenes stale derivados de `costo > pvp` al cargar
 * un producto existente).
 *
 * Sin redondeo interno: el caller redondea una sola vez (`.toFixed(2)`) al
 * escribir el estado.
 */
export function calcularCostoDesdeNivel(p: { pvpUsd: Decimal; margenPct: Decimal }): Decimal | null {
  if (p.pvpUsd.lte(0)) return null
  const divisor = new Decimal(1).plus(p.margenPct.dividedBy(100))
  if (divisor.lte(0)) return null
  return p.pvpUsd.dividedBy(divisor)
}

/**
 * Cascada ejecutada al presionar el boton "Fijar costo" (ver spec.md,
 * Requirement "Boton 'Fijar Costo'"): ancla el costo y recalcula el PVP de
 * los 3 niveles de precio desde sus margenes % actuales.
 *
 * `precio = costo * (1 + margenNivel / 100)`, con el margen de cada nivel
 * clampado defensivamente a `>= 0` (protege contra un margen negativo que se
 * haya colado sin pasar por el clamp del formulario — mismo criterio que
 * `backcalcularCostoYCascada`).
 *
 * A diferencia de `backcalcularCostoYCascada`, esta funcion SIEMPRE cascada
 * los 3 niveles (no hay nocion de "preservar precio tipeado a mano": al
 * fijar, el costo es la fuente de verdad y los 3 PVP se derivan de el).
 *
 * Sin redondeo interno: el caller redondea una sola vez (`.toFixed(2)`) al
 * escribir el estado.
 */
export function fijarCostoYCascada(p: {
  costoUsd: Decimal
  margenDetalPct: Decimal
  margenMayorPct: Decimal
  margenEspecialPct: Decimal
}): { detalUsd: Decimal; mayorUsd: Decimal; especialUsd: Decimal } {
  const calcularNivel = (margenPct: Decimal): Decimal => {
    const margenClamp = Decimal.max(0, margenPct)
    return p.costoUsd.times(new Decimal(1).plus(margenClamp.dividedBy(100)))
  }

  return {
    detalUsd: calcularNivel(p.margenDetalPct),
    mayorUsd: calcularNivel(p.margenMayorPct),
    especialUsd: calcularNivel(p.margenEspecialPct),
  }
}
