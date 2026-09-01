import Decimal from 'decimal.js'

type DecimalInput = string | number | Decimal

/**
 * Calcula el credito standing (saldo a favor) disponible de un cliente a
 * partir de sus movimientos de creacion (`tipo='SAFC'`) y consumo (`tipo='SAF'`)
 * en `movimientos_cuenta`. Funcion PURA: sin I/O.
 *
 * `disponible = MAX(0, creado - consumido)`. El clamp defensivo cubre datos
 * inconsistentes (consumo > creacion no deberia ocurrir, pero nunca debe
 * traducirse en un disponible negativo).
 *
 * Ver diseno: openspec/changes/cxc-saldo-favor-modelo/design.md (Decision 1).
 */
export function calcularCreditoDisponible(
  creado: DecimalInput,
  consumido: DecimalInput
): Decimal {
  const disponible = new Decimal(creado).minus(new Decimal(consumido))
  return disponible.isNegative() ? new Decimal(0) : disponible
}

/**
 * Calcula el credito disponible del LIMITE de credito de un cliente:
 * `disponible = MAX(0, limite - deudaFacturas)`.
 *
 * DELIBERADAMENTE de 2 argumentos: el saldo a favor (SAF) NUNCA es un termino
 * de esta formula. El limite mide EXPOSICION (cuanto puede llegar a deber un
 * cliente), no se agranda por prepagos existentes — ver Decision 3 (corregida)
 * en openspec/changes/cxc-saldo-favor-modelo/design.md. Sumar saldo a favor
 * aqui fue evaluado y RECHAZADO por el usuario: permitiria facturar a credito
 * por encima del limite real (agujero de control financiero).
 */
export function calcularDisponibleCredito(
  limite: DecimalInput,
  deuda: DecimalInput
): Decimal {
  const disponible = new Decimal(limite).minus(new Decimal(deuda))
  return disponible.isNegative() ? new Decimal(0) : disponible
}
