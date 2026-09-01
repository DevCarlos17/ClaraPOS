import Decimal from 'decimal.js'

// =============================================
// TIPOS
// =============================================

/**
 * Tipos validos de `movimientos_cuenta.tipo` (ver `movimientos_cuenta_tipo_check`
 * en migrations/0057). Espejo del CHECK constraint de Postgres.
 */
export type TipoMovimientoCuenta = 'FAC' | 'NDB' | 'PAG' | 'NCR' | 'SAF' | 'REV' | 'SAL'

type DecimalInput = string | number | Decimal

// Tipos cuyo saldo_nuevo NO se recalcula: el trigger Postgres confia en el
// valor provisto por la aplicacion (ver migrations/0088_fix_saf_trigger_sign.sql).
// SAF cubre dos direcciones (reduccion de deuda / consumo de credito) que el
// trigger no puede distinguir solo con `monto` (siempre positivo). REV/SAL ya
// tenian este tratamiento desde 0061_restore_trigger_context.sql.
const TIPOS_QUE_CONFIAN_EN_SALDO_PROVISTO: ReadonlySet<TipoMovimientoCuenta> = new Set([
  'SAF',
  'REV',
  'SAL',
])

// =============================================
// calcularSaldoNuevoMovimientoCuenta
// =============================================

/**
 * Calcula `saldo_nuevo` para una fila de `movimientos_cuenta`, espejando 1:1
 * la logica de `actualizar_saldo_cliente()` (trigger BEFORE INSERT en Postgres,
 * ver migrations/0088_fix_saf_trigger_sign.sql). Funcion PURA: sin I/O, sin tx.
 *
 * - FAC/NDB: `saldoAnterior + monto` (aumenta deuda).
 * - PAG/NCR: `saldoAnterior - monto` (reduce deuda).
 * - SAF/REV/SAL: el trigger NO recalcula — confia en `saldoNuevoProvisto`.
 *   Lanza si se omite, porque el trigger tampoco puede inferirlo.
 *
 * Fuente unica de verdad compartida entre `aplicarPagoFacturaEnTx` (PAG) y los
 * tests unitarios; NO prueba que el trigger SQL coincida — ver checklist de
 * verificacion manual en openspec/changes/saldo-a-favor-fix/manual-verify.md.
 */
export function calcularSaldoNuevoMovimientoCuenta(
  tipo: TipoMovimientoCuenta,
  saldoAnterior: DecimalInput,
  monto: DecimalInput,
  saldoNuevoProvisto?: DecimalInput
): Decimal {
  const anterior = new Decimal(saldoAnterior)
  const montoD = new Decimal(monto)

  if (tipo === 'FAC' || tipo === 'NDB') {
    return anterior.plus(montoD)
  }

  if (tipo === 'PAG' || tipo === 'NCR') {
    return anterior.minus(montoD)
  }

  if (TIPOS_QUE_CONFIAN_EN_SALDO_PROVISTO.has(tipo)) {
    if (saldoNuevoProvisto === undefined || saldoNuevoProvisto === null) {
      throw new Error(
        `El movimiento tipo '${tipo}' requiere saldoNuevoProvisto — el trigger de Postgres confia en este valor y no lo recalcula.`
      )
    }
    return new Decimal(saldoNuevoProvisto)
  }

  throw new Error(`Tipo de movimiento de cuenta desconocido: '${tipo}'`)
}

// =============================================
// esSaldoSafConsistente
// =============================================

/**
 * Replica la asercion de consistencia del trigger para filas `tipo='SAF'`:
 * el CAMBIO de saldo (`|saldoNuevo - saldoAnterior|`) debe coincidir con
 * `monto` dentro de una tolerancia de 0.005, sin importar la direccion
 * (consumo de credito suma, reduccion de deuda resta — ambas validas).
 *
 * NO valida la direccion en si (es ambigua por diseno para SAF); solo
 * detecta corrupcion de magnitud como el bug historico de saldo duplicado
 * (ver migrations/0088_fix_saf_trigger_sign.sql).
 */
export function esSaldoSafConsistente(
  saldoAnterior: DecimalInput,
  monto: DecimalInput,
  saldoNuevo: DecimalInput
): boolean {
  const anterior = new Decimal(saldoAnterior)
  const montoD = new Decimal(monto)
  const nuevo = new Decimal(saldoNuevo)

  const diferencia = nuevo.minus(anterior).abs().minus(montoD).abs()
  return diferencia.lessThanOrEqualTo('0.005')
}
