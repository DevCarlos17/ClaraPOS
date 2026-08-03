import Decimal from 'decimal.js'

// =============================================
// TIPOS
// =============================================

/**
 * Fila de `metodo_cobro_deducciones` ya filtrada por `is_active = 1` en el
 * SELECT (ver `use-sesiones-caja.ts` -> `aplicarComisionSiCorresponde`).
 * Esta funcion PURA no vuelve a filtrar por actividad; asume que el llamador
 * ya aplico `WHERE is_active = 1 ORDER BY orden`.
 */
export interface DeduccionActivaRow {
  id: string
  cuenta_gasto_id: string | null
  concepto: string
  tipo: string
  /** Porcentaje como string decimal, ej. "3" o "2.50" */
  porcentaje: string
  orden: number
}

/** Una deduccion resuelta lista para postear via `insertarGastoDeduccionEnTx`. */
export interface DeduccionAPostear {
  cuentaGastoId: string
  concepto: string
  porcentaje: string
  orden: number
  /** Monto en la moneda NATIVA del metodo de cobro (sin conversion USD/tasa). */
  montoDeduccionNativo: Decimal
}

export interface ResolverDeduccionesCierreParams {
  deducciones: DeduccionActivaRow[]
  /** Monto base en moneda nativa del metodo (ya consolidado: plano, por-lote o suma-de-lotes). */
  montoBaseD: Decimal
  destinoTipo: 'BANCO' | 'CAJA_FUERTE'
  nombreMetodo: string
}

export interface ResolverDeduccionesCierreResult {
  toPost: DeduccionAPostear[]
  warning?: string
}

// =============================================
// resolverDeduccionesCierre
// =============================================

/**
 * Calcula, para un metodo de cobro, los montos de cada deduccion activa
 * (comision bancaria, retencion ISLR, etc.) a postear como gasto durante el
 * cierre de sesion de caja. Funcion PURA: sin I/O, sin `tx`, sin PowerSync.
 *
 * Reglas:
 * - Metodos que liquidan a caja fuerte (efectivo) NUNCA son comision-elegibles
 *   (W5): si tienen deducciones activas configuradas, se omiten con un
 *   `warning` (el llamador debe `console.warn`); no se lanza error.
 * - Una deduccion con porcentaje <= 0 se omite silenciosamente (sin gasto,
 *   sin error) — igual que el guard `comisionPct.gt(0)` de hoy.
 * - Una deduccion activa (porcentaje > 0) SIN `cuenta_gasto_id` configurada
 *   lanza un error (nunca se postea un gasto huerfano).
 * - El monto se calcula siempre sobre `montoBaseD` en su moneda nativa —
 *   jamas se convierte con una tasa de cambio aqui.
 */
export function resolverDeduccionesCierre(
  params: ResolverDeduccionesCierreParams
): ResolverDeduccionesCierreResult {
  const { deducciones, montoBaseD, destinoTipo, nombreMetodo } = params

  if (destinoTipo === 'CAJA_FUERTE') {
    if (deducciones.length === 0) {
      return { toPost: [] }
    }
    return {
      toPost: [],
      warning: `Método "${nombreMetodo}" liquida a caja fuerte (efectivo); las deducciones configuradas no son elegibles para comisión y fueron omitidas.`,
    }
  }

  const toPost: DeduccionAPostear[] = []

  for (const deduccion of deducciones) {
    const porcentaje = new Decimal(deduccion.porcentaje)

    if (porcentaje.lessThanOrEqualTo(0)) continue

    if (!deduccion.cuenta_gasto_id) {
      throw new Error(
        `La deducción "${deduccion.concepto}" del método "${nombreMetodo}" tiene un porcentaje activo (${porcentaje.toFixed(2)}%) pero no tiene una cuenta de gasto configurada. No se puede registrar un gasto huérfano.`
      )
    }

    toPost.push({
      cuentaGastoId: deduccion.cuenta_gasto_id,
      concepto: deduccion.concepto,
      porcentaje: deduccion.porcentaje,
      orden: deduccion.orden,
      montoDeduccionNativo: montoBaseD.times(porcentaje).dividedBy(100),
    })
  }

  return { toPost }
}

// =============================================
// construirNroGastoDeduccion
// =============================================

export interface ConstruirNroGastoDeduccionParams {
  sesionCajaId: string
  metodoCobroId: string
  orden: number
  /** UUID del gasto (generado por el llamador) — garantiza unicidad entre llamadas repetidas por lote. */
  gastoId: string
}

/**
 * Construye el `nro_gasto` deterministico-unico para un gasto de deduccion.
 * Formato: `POS-COM-{sesion8}-{metodo6}-{orden}-{gasto6}`.
 *
 * El sufijo `{gasto6}` es OBLIGATORIO: la rama "por lotes" del cierre
 * (`consolidar_lotes = 0`) llama esta funcion una vez POR LOTE para el mismo
 * metodo, repitiendo `(sesionId, metodoId, orden)` — sin el sufijo del uuid
 * del gasto, colisionaria contra `UNIQUE(empresa_id, nro_gasto)`.
 */
export function construirNroGastoDeduccion(params: ConstruirNroGastoDeduccionParams): string {
  const { sesionCajaId, metodoCobroId, orden, gastoId } = params

  const sesion8 = sesionCajaId.slice(0, 8).toUpperCase()
  const metodo6 = metodoCobroId.slice(0, 6).toUpperCase()
  const gasto6 = gastoId.slice(0, 6).toUpperCase()

  return `POS-COM-${sesion8}-${metodo6}-${orden}-${gasto6}`
}
