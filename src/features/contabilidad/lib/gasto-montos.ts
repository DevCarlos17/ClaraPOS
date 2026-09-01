/**
 * Selectores puros de montos para registros `gastos`.
 *
 * Semantica canonica de columnas (tabla-wide, congelada — ver
 * openspec/changes/gastos-base-iva-costo/design.md):
 * - `base_imponible_usd` = costo real (BASE, sin IVA)
 * - `monto_iva_usd`      = impuesto (IVA), no es costo
 * - `monto_usd`          = total = base + IVA, el desembolso
 *
 * `monto_usd` NUNCA se redefine por tipo de fila (manual vs cargo de compra):
 * ambos orígenes escriben las 3 columnas con el mismo significado. Los
 * reportes deben leer `base_imponible_usd` para el costo, no `monto_usd`.
 */

export interface GastoMontos {
  base_imponible_usd: string
  monto_iva_usd: string
  monto_usd: string
}

function parseOrNull(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === '') return null
  const n = parseFloat(value)
  return Number.isNaN(n) ? null : n
}

/** Costo real del gasto (base imponible). Fallback defensivo a `monto_usd` si falta. */
export function montoCostoGasto(g: GastoMontos): number {
  return parseOrNull(g.base_imponible_usd) ?? parseOrNull(g.monto_usd) ?? 0
}

/** Impuesto (IVA) del gasto. Fallback defensivo a 0 si falta. */
export function montoIvaGasto(g: GastoMontos): number {
  return parseOrNull(g.monto_iva_usd) ?? 0
}

/** Total desembolsado (base + IVA). */
export function montoTotalGasto(g: GastoMontos): number {
  return parseOrNull(g.monto_usd) ?? 0
}

/**
 * Input para {@link deriveGastoTotales}: los campos de `GastoMontos` mas los
 * campos de tasa/moneda/impuesto necesarios para derivar los totales que se
 * muestran en el modal "Detalle de Gasto".
 */
export interface GastoTotalesInput extends GastoMontos {
  moneda_factura: string
  usa_tasa_paralela: number
  tasa: string
  tasa_proveedor: string | null
  tipo_impuesto: string
  porcentaje_iva: string
}

export interface GastoTotalesResult {
  totalProveedorUsd: number
  totalContableUsd: number
  totalBs: number
  baseUsd: number
  ivaUsd: number
  porcentajeIva: number
  esGravable: boolean
  esExento: boolean
  esExonerado: boolean
  usaParalela: boolean
  tasaFactura: number
  tasaInterna: number
}

/**
 * Deriva los totales de un `gasto` para mostrarlos en "Detalle de Gasto".
 *
 * `monto_usd` (leido via `montoTotalGasto`) ya es el total final en USD
 * (base + IVA), convertido UNA sola vez al crear el gasto en
 * `use-gastos.ts::crearGasto` (base_factura / tasaRef + IVA, para
 * `moneda_factura === 'BS'`; o directo, para `moneda_factura === 'USD'`).
 * A diferencia de `facturas_compra` (COMPRA), que si guarda representaciones
 * separadas por tasa proveedor/interna, `gastos` persiste un UNICO total
 * canonico en USD — no existe una segunda cifra "sin convertir" para
 * volver a derivar. Por eso `totalProveedorUsd` y `totalContableUsd` son
 * siempre el mismo valor (`monto_usd`); NUNCA se debe dividir por ninguna
 * tasa a la hora de mostrarlo, sin importar `moneda_factura` ni
 * `usa_tasa_paralela`.
 */
export function deriveGastoTotales(gasto: GastoTotalesInput, tasaValor: number): GastoTotalesResult {
  const tasaInterna = parseOrNull(gasto.tasa) ?? 0
  const tasaFactura = gasto.tasa_proveedor
    ? parseOrNull(gasto.tasa_proveedor) ?? tasaInterna
    : tasaInterna
  const usaParalela = gasto.usa_tasa_paralela === 1 && Boolean(gasto.tasa_proveedor)

  const baseUsd = montoCostoGasto(gasto)
  const ivaUsd = montoIvaGasto(gasto)
  const totalContableUsd = montoTotalGasto(gasto)
  const totalBs = totalContableUsd * tasaValor

  // monto_usd ya esta convertido una unica vez al crear el gasto — no hay una
  // segunda representacion "sin convertir" que derivar aqui (ver docblock).
  const totalProveedorUsd = totalContableUsd

  const porcentajeIva = parseOrNull(gasto.porcentaje_iva) ?? 0
  const esGravable = gasto.tipo_impuesto === 'Gravable' && ivaUsd > 0.005
  const esExento = gasto.tipo_impuesto === 'Exento'
  const esExonerado = gasto.tipo_impuesto === 'Exonerado'

  return {
    totalProveedorUsd,
    totalContableUsd,
    totalBs,
    baseUsd,
    ivaUsd,
    porcentajeIva,
    esGravable,
    esExento,
    esExonerado,
    usaParalela,
    tasaFactura,
    tasaInterna,
  }
}
