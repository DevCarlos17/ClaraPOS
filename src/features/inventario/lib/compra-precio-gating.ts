/**
 * Predicados puros que gobiernan la edicion de precios (PVP) en el flujo de Compras.
 *
 * Motivo: el usuario debe poder editar el PVP/Mayor/Especial de una linea de compra
 * sin haber cambiado el costo. Estos predicados centralizan esa decision para que
 * el formulario (compra-form.tsx) y la persistencia (use-compras.ts) usen la misma
 * logica y no diverjan.
 */

import Decimal from 'decimal.js'

/**
 * Determina si el PVP de una linea debe mantenerse sin actualizar al enviar el
 * formulario de compra.
 *
 * Se actualiza el PVP cuando el usuario abrio el editor ("Editar precios ✎") o
 * cuando algun nivel de precio quedo violado por el nuevo costo (auto-apertura).
 * Ya NO depende de si el costo cambio: un PVP editado sin cambio de costo tambien
 * debe persistirse.
 */
export function calcularNoActualizarPvp(pvpEditando: boolean, algunNivelViolado: boolean): boolean {
  return !pvpEditando && !algunNivelViolado
}

/**
 * Determina si el resumen/confirmacion de la compra debe mostrar informacion de
 * precios para una linea (badge "precios editados"/"precios sin cambio", detalle
 * de niveles). Se muestra si hubo cambio de costo O si el usuario edito el PVP,
 * para dar paridad a la edicion de PVP sin cambio de costo.
 */
export function debeMostrarInfoPvpEnResumen(costoCambio: boolean, pvpEditando: boolean): boolean {
  return costoCambio || pvpEditando
}

export interface AccionesLineaCompra {
  /** Si true, el UPDATE a `productos` debe escribir el nuevo `costo_usd`. */
  actualizarCosto: boolean
  /** Si true, el UPDATE a `productos` debe escribir el/los PVP editados. */
  actualizarPvp: boolean
  /**
   * Si true, debe insertarse una fila de auditoria en `historico_precios`.
   * Es `actualizarCosto || actualizarPvp`: cualquier cambio de costo o de PVP
   * requiere auditoria inmutable, sin importar si el otro campo tambien cambio.
   */
  registrarAuditoria: boolean
}

/**
 * Resuelve, a partir de las dos decisiones del usuario en el formulario
 * (`costo_cambio` y `no_actualizar_pvp`), que acciones debe ejecutar la
 * persistencia de una linea de compra en `productos` y en `historico_precios`.
 *
 * Un solo predicado alimenta ambos gates en use-compras.ts (branch de UPDATE
 * ~L664 y gate de auditoria ~L742) para que no puedan quedar desincronizados.
 */
export function resolverAccionesLineaCompra(
  costoCambio: boolean,
  noActualizarPvp: boolean | undefined
): AccionesLineaCompra {
  const actualizarCosto = costoCambio === true
  // Uso de === false (no !== true): la ausencia de la señal ("no_actualizar_pvp"
  // no provisto) debe tratarse como "no tocar el PVP" por defecto — el valor
  // seguro para un sistema con auditoria inmutable. Solo un `false` EXPLICITO
  // (el usuario pidio actualizar el PVP) habilita la escritura/auditoria.
  const actualizarPvp = noActualizarPvp === false
  const registrarAuditoria = actualizarCosto || actualizarPvp

  return { actualizarCosto, actualizarPvp, registrarAuditoria }
}

/**
 * Resuelve que valor de costo debe escribirse en `productos.costo_usd` (y
 * auditarse como `costo_nuevo` en `historico_precios`) para una linea de compra.
 *
 * Cuando el costo NO cambio (`actualizarCosto = false`, p. ej. una edicion de
 * PVP sin cambio de costo), se debe preservar el costo actual EXACTO
 * (`costoActual`, el valor ya almacenado) en lugar de re-derivar/re-escribir
 * `costoSistema`. `costoSistema` se calcula en el frontend a partir de
 * `costo_unitario_usd` * `tasaFactura` / `tasaInterna` (modo tasa paralela) y
 * puede sufrir drift de punto flotante en decimales bajos aunque el usuario no
 * haya tocado "Nuevo Costo" — ese drift violaria el invariante de auditoria
 * inmutable (`historico_precios.costo_anterior === costo_nuevo` cuando el
 * costo no cambio) y podria filtrarse a `productos.costo_usd`.
 *
 * Cuando el costo SI cambio (`actualizarCosto = true`), se usa `costoSistema`
 * sin modificaciones — comportamiento identico al previo a este fix.
 */
export function resolverCostoAEscribir<T>(actualizarCosto: boolean, costoSistema: T, costoActual: T): T {
  return actualizarCosto ? costoSistema : costoActual
}

/**
 * Decision explicita del usuario sobre el PVP de un nivel de precio, tomada
 * cuando el costo de una linea de compra cambia.
 *
 * - `pendiente`: el usuario aun no decidio; bloquea el envio de la factura
 *   (ver `lineaTieneDecisionBloqueante`).
 * - `mantener_pvp`: conserva el PVP actual del nivel (el margen se ajusta).
 * - `mantener_margen`: conserva el margen % actual del nivel (el PVP se ajusta).
 * - `manual`: el usuario tipeo un PVP/margen explicito (edicion bidireccional).
 */
export type DecisionPvp = 'pendiente' | 'mantener_pvp' | 'mantener_margen' | 'manual'

/**
 * Calcula el margen % resultante de UN nivel de precio si su PVP se mantiene
 * sin cambios ante un nuevo costo. Es la vista base de comparacion que se
 * muestra ANTES de que el usuario tome una decision (permite margen negativo:
 * eso es precisamente lo que distingue Caso A de Caso B via `clasificarCasoLinea`).
 *
 * Formula: (pvpActual - costoNuevo) / costoNuevo * 100
 *
 * Si `costoNuevo` es cero, retorna `Decimal(0)` en lugar de dividir por cero
 * (mismo criterio de seguridad que `bsToUsd` en `src/lib/currency.ts`).
 */
export function calcularMargenSiSeMantienePvp(costoNuevo: Decimal, pvpActual: Decimal): Decimal {
  if (costoNuevo.isZero()) return new Decimal(0)
  return pvpActual.minus(costoNuevo).dividedBy(costoNuevo).times(100)
}

/**
 * Calcula el PVP resultante de UN nivel de precio si su margen % actual se
 * mantiene ante un nuevo costo. Porta a `Decimal` puro la logica que antes
 * vivia inline en `compra-form.tsx` (proyeccion "mantener margen").
 *
 * Formula: max(costoNuevo, costoNuevo * (1 + margenActualPct / 100))
 *
 * El `max` contra `costoNuevo` evita que un margen negativo preexistente
 * proyecte un PVP por debajo del costo nuevo (el PVP nunca debe ser menor
 * al costo que lo origina).
 */
export function calcularPvpSiSeMantieneMargen(costoNuevo: Decimal, margenActualPct: Decimal): Decimal {
  const proyectado = costoNuevo.times(new Decimal(1).plus(margenActualPct.dividedBy(100)))
  return Decimal.max(costoNuevo, proyectado)
}

/** Nivel de precio con su bandera de violacion (costo_nuevo > pvp_actual). */
export interface NivelViolado {
  violado: boolean
}

/**
 * Clasifica una linea de compra con costo cambiado en Caso A o Caso B, a
 * partir de las banderas `violado` ya calculadas por nivel de precio
 * (`pvp_niveles[].violado`, derivadas en cada render/keystroke — nunca
 * persistidas, ver design.md Decision de State Model).
 *
 * - Caso `'A'`: el nuevo costo es rentable en TODOS los niveles (ningun
 *   `violado`). Se ofrecen 3 opciones (Mantener PVP / Mantener margen / Manual).
 * - Caso `'B'`: el nuevo costo supera el PVP de AL MENOS un nivel. Se ofrecen
 *   2 opciones (Recalcular por % / Manual, sin "Mantener PVP") y el/los
 *   niveles violados se resaltan en rojo.
 */
export function clasificarCasoLinea(niveles: NivelViolado[]): 'A' | 'B' {
  return niveles.some((n) => n.violado) ? 'B' : 'A'
}

/** Nivel de precio con los datos minimos para evaluar el gate de decision pendiente. */
export interface NivelDecisionUI {
  violado: boolean
  decision: DecisionPvp
  pvp_input: string
}

/**
 * Determina si una linea de compra debe bloquear el envio de la factura por
 * tener una decision de PVP sin resolver.
 *
 * Reglas (ver design.md, seccion "Blocking Gate"):
 * - Si la linea NO tuvo cambio de costo (`costoCambio === false`), nunca
 *   bloquea — el guard es la primera linea de la funcion, sin excepciones.
 * - Si algun nivel quedo en `decision === 'pendiente'`, bloquea.
 * - Si algun nivel en `decision === 'manual'` o `decision === 'mantener_margen'`
 *   quedo con `pvp_input` vacio o `<= 0`, bloquea (un valor no numerico o
 *   negativo tampoco es un PVP valido para persistir).
 * - Caso contrario (todas las decisiones resueltas con un PVP valido), no
 *   bloquea.
 */
export function lineaTieneDecisionBloqueante(costoCambio: boolean, niveles: NivelDecisionUI[]): boolean {
  if (!costoCambio) return false

  return niveles.some((n) => {
    if (n.decision === 'pendiente') return true
    if (n.decision === 'manual' || n.decision === 'mantener_margen') {
      const trimmed = n.pvp_input.trim()
      if (trimmed === '') return true
      const numero = parseFloat(trimmed)
      return isNaN(numero) || numero <= 0
    }
    return false
  })
}

/** Nivel de precio con los datos necesarios para derivar las senales de
 * persistencia de PVP (`no_actualizar_pvp` / `nuevo_precio_*_usd`) a partir
 * de la decision explicita del usuario. Ver `derivarSenalesPvp`.
 */
export interface NivelSenalPvp {
  orden: number
  decision: DecisionPvp
  pvp_actual_usd: number
  pvp_input: string
}

/**
 * Deriva `no_actualizar_pvp` y el getter de nuevo PVP en USD por nivel, a
 * partir de las decisiones por nivel de una linea de compra (Decision 1 del
 * design: reduccion de senales limpia, `use-compras.ts` sin cambios).
 *
 * Uniforme `mantener_pvp` en TODOS los niveles (o linea sin niveles, p. ej.
 * sin cambio de costo) -> `no_actualizar_pvp=true`, sin nuevo PVP explicito
 * (el servidor conserva el `pvpActual`). Cualquier mezcla de decisiones o
 * decision distinta -> `false` con valores EXPLICITOS por nivel, nunca
 * delegados al fallback de margen del servidor: el guard de margen negativo
 * client-side (compra-form.tsx, pre-submit) necesita un numero concreto para
 * validar contra el costo. Un nivel en `mantener_pvp` DENTRO de una linea
 * mixta retorna su `pvp_actual_usd` congelado (fuerza la rama "provisto" en
 * `use-compras.ts` en lugar de la implicita).
 *
 * La conversion Bs -> USD del `pvp_input` tipeado usa `Decimal` (mismo
 * criterio de seguridad que `bsToUsd`: si no hay tasa de factura configurada,
 * retorna el valor tipeado sin convertir en lugar de dividir por cero).
 */
export function derivarSenalesPvp(
  pvpNiveles: NivelSenalPvp[],
  moneda: 'USD' | 'BS',
  tasaFactura: number
): {
  noActualizarPvp: boolean
  getNewPvpUsdForNivel: (orden: number) => number | undefined
} {
  if (pvpNiveles.length === 0 || pvpNiveles.every((n) => n.decision === 'mantener_pvp')) {
    return { noActualizarPvp: true, getNewPvpUsdForNivel: () => undefined }
  }
  const getNewPvpUsdForNivel = (orden: number): number | undefined => {
    const nivel = pvpNiveles.find((n) => n.orden === orden)
    if (!nivel) return undefined
    if (nivel.decision === 'mantener_pvp') return nivel.pvp_actual_usd
    if (nivel.pvp_input === '') return undefined
    const pvpNum = parseFloat(nivel.pvp_input)
    if (isNaN(pvpNum) || pvpNum <= 0) return undefined
    return moneda === 'USD'
      ? pvpNum
      : (tasaFactura > 0 ? new Decimal(pvpNum).dividedBy(tasaFactura).toNumber() : pvpNum)
  }
  return { noActualizarPvp: false, getNewPvpUsdForNivel }
}
