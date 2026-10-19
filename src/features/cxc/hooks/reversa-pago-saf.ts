import Decimal from 'decimal.js'
import { db } from '@/core/db/powersync/db'

/**
 * Reporte de deteccion de lote SAF generado por un `pago` (slice 3b-i de
 * `cxc-ledger-saldos-redesign`). Consumida por la futura logica de reverso
 * por compensacion (slice 3b-ii, `reversarPagoSafEnTx`) y, mas adelante, por
 * el modal de confirmacion de reverso (fuera de alcance de este change — ver
 * design.md "No UI surface").
 */
export interface DetalleLoteSafDePago {
  /** `true` si el `pago` genero un lote `saf_creditos_lotes` (origen_tipo='PAGO'). */
  generatedLote: boolean
  loteId?: string
  montoOriginalUsd?: number
  saldoDisponibleUsd?: number
  /** `monto_original_usd - saldo_disponible_usd`. */
  montoConsumidoUsd?: number
  /** Filas INMUTABLES originales de `saf_creditos_aplicaciones` — nunca una tabla de detalle nueva (cero riesgo de drift). */
  facturasAfectadas: Array<{ ventaId: string; nroFactura: string; montoAplicadoUsd: number }>
}

interface LoteSafRow {
  id: string
  monto_original_usd: string
  saldo_disponible_usd: string
}

interface AplicacionSafRow {
  venta_id: string
  nro_factura: string
  monto_aplicado_usd: string
}

/**
 * Detecta si un `pago` genero un lote de credito SAF (saldo a favor) y, de
 * ser asi, cuanto fue consumido y que facturas fueron afectadas. PURA
 * LECTURA — cero mutacion, cero `db.writeTransaction` (ver design.md "Read
 * function" de cxc-ledger-saldos-redesign). Usa `db.getAll` directo, mismo
 * patron que los reportes de solo-lectura de este modulo
 * (`cxc-reportes-general.tsx`, `cxc-cliente-reporte.tsx`).
 *
 * Query 1: liga el lote con su `pago` originador via
 * `saf_creditos_lotes.origen_tipo='PAGO' AND origen_id=<pago_id>` (link
 * existente desde slice 3a). Si no hay lote, retorna de inmediato sin
 * disparar la Query 2.
 *
 * Query 2: lee las filas INMUTABLES originales de
 * `saf_creditos_aplicaciones` (join a `ventas` por `nro_factura`) — nunca
 * una tabla de detalle nueva/reconstruida, cero riesgo de drift respecto al
 * ledger real.
 *
 * Ambas queries filtran por `empresa_id` (aislamiento multi-tenant,
 * no-negociable — ver spec Requirement "Multitenant isolation").
 */
export async function detectarLoteSafDePago(
  empresaId: string,
  pagoId: string
): Promise<DetalleLoteSafDePago> {
  const lotes = await db.getAll<LoteSafRow>(
    `SELECT id, monto_original_usd, saldo_disponible_usd
     FROM saf_creditos_lotes
     WHERE origen_tipo = 'PAGO' AND origen_id = ? AND empresa_id = ?`,
    [pagoId, empresaId]
  )

  const lote = lotes[0]
  if (!lote) {
    return { generatedLote: false, facturasAfectadas: [] }
  }

  const montoOriginal = new Decimal(lote.monto_original_usd)
  const saldoDisponible = new Decimal(lote.saldo_disponible_usd)
  const montoConsumido = montoOriginal.minus(saldoDisponible)

  const aplicaciones = await db.getAll<AplicacionSafRow>(
    `SELECT sca.venta_id, v.nro_factura, sca.monto_aplicado_usd
     FROM saf_creditos_aplicaciones sca
     JOIN ventas v ON v.id = sca.venta_id
     WHERE sca.lote_id = ? AND sca.empresa_id = ?`,
    [lote.id, empresaId]
  )

  return {
    generatedLote: true,
    loteId: lote.id,
    montoOriginalUsd: montoOriginal.toNumber(),
    saldoDisponibleUsd: saldoDisponible.toNumber(),
    montoConsumidoUsd: montoConsumido.toNumber(),
    facturasAfectadas: aplicaciones.map((a) => ({
      ventaId: a.venta_id,
      nroFactura: a.nro_factura,
      montoAplicadoUsd: new Decimal(a.monto_aplicado_usd).toNumber(),
    })),
  }
}
