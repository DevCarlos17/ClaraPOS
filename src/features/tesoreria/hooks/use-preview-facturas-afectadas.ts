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
  /**
   * Monto equivalente en la moneda nativa del pago (`montoAplicadoUsd *
   * tasa`), NUNCA leido de `pagos.monto` (ese es el monto COMPLETO del
   * pago, no el aplicado a esta fila puente especifica — ver docstring de
   * `previewFacturasAfectadas`).
   */
  montoAplicadoNativo: number
  /** `monedas.codigo_iso` crudo (p.ej. 'VES', 'USD'), tomado de la fila puente. */
  monedaCodigo: string
  /** `metodos_cobro.nombre` del pago que origino esta fila puente. */
  metodoNombre: string
  /** Tasa de cambio vigente al momento del pago (`pagos.tasa`). */
  tasa: number
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
  /** `pagos.tasa` — tasa vigente al momento del pago. */
  tasa: string
  /** `metodos_cobro.nombre`, via JOIN `pagos.metodo_cobro_id`. */
  metodo_nombre: string
  /** `monedas.codigo_iso`, via LEFT JOIN `pagos.moneda_id`. */
  codigo_iso: string | null
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
    `SELECT mbp.pago_id, mbp.monto_aplicado_usd, p.venta_id, v.nro_factura,
            p.tasa, mc.nombre AS metodo_nombre, mon.codigo_iso
     FROM movimientos_bancarios_pagos mbp
     JOIN pagos p ON p.id = mbp.pago_id
     LEFT JOIN ventas v ON v.id = p.venta_id
     JOIN metodos_cobro mc ON mc.id = p.metodo_cobro_id
     LEFT JOIN monedas mon ON mon.id = p.moneda_id
     WHERE mbp.ingreso_id = ? AND mbp.empresa_id = ? AND (p.is_reversed IS NULL OR p.is_reversed = 0)`,
    [ingresoId, empresaId]
  )

  if (bridgeRows.length === 0) {
    return { estado: 'LEGACY', facturasDirectas: [], facturasSaf: [], totalUsd: 0 }
  }

  const facturasDirectas: FacturaAfectadaPreview[] = []
  const facturasSaf: FacturaAfectadaPreview[] = []

  for (const row of bridgeRows) {
    // Campos de moneda/metodo/tasa de la FILA PUENTE — se derivan una sola
    // vez por fila y se reusan tanto para el push directo como para el
    // enriquecimiento de las entradas SAF de esta misma fila (ver spec
    // Requirement "Resolucion de facturas via SAF": ambos arreglos reciben
    // los mismos campos, tomados del mismo pago_id, nunca de
    // `detectarLoteSafDePago`).
    const montoAplicadoUsd = new Decimal(row.monto_aplicado_usd)
    const tasa = new Decimal(row.tasa)
    const montoAplicadoNativo = montoAplicadoUsd.times(tasa).toNumber()
    const monedaCodigo = row.codigo_iso ?? 'USD'
    const metodoNombre = row.metodo_nombre

    if (row.venta_id) {
      facturasDirectas.push({
        ventaId: row.venta_id,
        nroFactura: row.nro_factura ?? '',
        montoAplicadoUsd: montoAplicadoUsd.toNumber(),
        montoAplicadoNativo,
        monedaCodigo,
        metodoNombre,
        tasa: tasa.toNumber(),
      })
    }

    const detalle = await detectarLoteSafDePago(empresaId, row.pago_id)
    if (detalle.generatedLote) {
      // Enriquecimiento en el SPREAD del loop — `detectarLoteSafDePago`
      // (reversa-pago-saf.ts) NO se modifica, permanece puro/compartido
      // con `use-reverso-abono-directo.ts`.
      facturasSaf.push(
        ...detalle.facturasAfectadas.map((f) => ({
          ...f,
          montoAplicadoNativo,
          monedaCodigo,
          metodoNombre,
          tasa: tasa.toNumber(),
        }))
      )
    }
  }

  const totalUsd = [...facturasDirectas, ...facturasSaf]
    .reduce((acc, f) => acc.plus(f.montoAplicadoUsd), new Decimal(0))
    .toNumber()

  return { estado: 'OK', facturasDirectas, facturasSaf, totalUsd }
}
