import Decimal from 'decimal.js'
import { db } from '@/core/db/powersync/db'
import { detectarLoteSafDePago } from '@/features/cxc/hooks/reversa-pago-saf'

/**
 * Factura afectada por el reverso de un ingreso de tesoreria, ya sea via
 * pago directo o via lote de credito SAF consumido. Mismo shape que
 * `DetalleLoteSafDePago.facturasAfectadas` (`reversa-pago-saf.ts`) para que
 * el futuro panel (slice 1b) pueda tratar ambos arreglos de forma uniforme.
 */
export interface FacturaAfectadaPreview {
  ventaId: string
  nroFactura: string
  montoAplicadoUsd: number
}

export type EstadoPreviewFacturasAfectadas = 'OK' | 'LEGACY'

/**
 * Resultado del preview. `estado: 'LEGACY'` distingue un ingreso
 * `TRANSFERENCIA_CLIENTE` sin filas en `movimientos_bancarios_pagos` (sin
 * trazabilidad, anterior al puente) de `estado: 'OK'` con 0 facturas
 * afectadas (trazabilidad confirmada, simplemente no hay facturas) — ver
 * spec Requirement "Estado legacy para ingresos sin trazabilidad".
 */
export interface PreviewFacturasAfectadas {
  estado: EstadoPreviewFacturasAfectadas
  facturasDirectas: FacturaAfectadaPreview[]
  facturasSaf: FacturaAfectadaPreview[]
  totalUsd: number
}

interface BridgeRow {
  pago_id: string
  monto_aplicado_usd: string
  venta_id: string | null
  nro_factura: string | null
}

/**
 * Resuelve, dado un `ingreso_id` (`movimientos_bancarios.id`), las facturas
 * alcanzables via el puente `movimientos_bancarios_pagos` — directas
 * (`pagos.venta_id` no-NULL) y via SAF (reusando `detectarLoteSafDePago`
 * para cada `pago_id`, sin reimplementar el join
 * `saf_creditos_lotes`→`saf_creditos_aplicaciones`→`ventas`). PURA LECTURA
 * — cero `db.writeTransaction`, mismo patron que `detectarLoteSafDePago`
 * (ver exploracion `sdd/reverso-abono-tesoreria/explore-preview-facturas-
 * afectadas`, hallazgo 1: un `pago_id` nunca tiene `venta_id` no-NULL Y
 * genera lote SAF simultaneamente — son mutuamente excluyentes, por lo que
 * llamar `detectarLoteSafDePago` para TODOS los `pago_id` del puente
 * (incluidos los directos) es un no-op barato para estos ultimos).
 *
 * Snapshot bajo demanda (no `useQuery` reactivo) — el llamador (panel del
 * slice 1b) decide cuando invocarla (al abrir el modal), nunca una
 * suscripcion live.
 *
 * Filtra `(p.is_reversed IS NULL OR p.is_reversed = 0)` en la query del
 * puente — convencion establecida en 8+ sitios del modulo CxC/Tesoreria
 * (ver exploracion, hallazgo 3): un pago ya reversado desde CxC no debe
 * aparecer como "afectado" por el reverso de tesoreria.
 *
 * Aislamiento multi-tenant: la query filtra `empresa_id` (no-negociable).
 */
export async function previewFacturasAfectadas(
  empresaId: string,
  ingresoId: string
): Promise<PreviewFacturasAfectadas> {
  const bridgeRows = await db.getAll<BridgeRow>(
    `SELECT mbp.pago_id, mbp.monto_aplicado_usd, p.venta_id, v.nro_factura
     FROM movimientos_bancarios_pagos mbp
     JOIN pagos p ON p.id = mbp.pago_id
     LEFT JOIN ventas v ON v.id = p.venta_id
     WHERE mbp.ingreso_id = ? AND mbp.empresa_id = ? AND (p.is_reversed IS NULL OR p.is_reversed = 0)`,
    [ingresoId, empresaId]
  )

  if (bridgeRows.length === 0) {
    return { estado: 'LEGACY', facturasDirectas: [], facturasSaf: [], totalUsd: 0 }
  }

  const facturasDirectas: FacturaAfectadaPreview[] = []
  const facturasSaf: FacturaAfectadaPreview[] = []

  for (const row of bridgeRows) {
    if (row.venta_id) {
      facturasDirectas.push({
        ventaId: row.venta_id,
        nroFactura: row.nro_factura ?? '',
        montoAplicadoUsd: new Decimal(row.monto_aplicado_usd).toNumber(),
      })
    }

    const detalle = await detectarLoteSafDePago(empresaId, row.pago_id)
    if (detalle.generatedLote) {
      facturasSaf.push(...detalle.facturasAfectadas)
    }
  }

  const totalUsd = [...facturasDirectas, ...facturasSaf]
    .reduce((acc, f) => acc.plus(f.montoAplicadoUsd), new Decimal(0))
    .toNumber()

  return { estado: 'OK', facturasDirectas, facturasSaf, totalUsd }
}
