// Funcion pura que separa los egresos manuales de efectivo (movimientos_metodo_cobro,
// mov_tipo='EGRESO') en 3 buckets para la Card "Arqueo Teorico" del cuadre de caja:
//
//   - devolucionesNc*: reembolsos de efectivo por Nota de Credito
//   - vueltos*:        vueltos entregados a clientes
//   - retiros*:        todo lo demas (EGRESO_MANUAL, EGRESO_TESORERIA, AVANCE,
//                       PRESTAMO, PAGO_PROVEEDOR)
//
// Clasifica por ORIGEN del egreso, NO por punto de entrada (POS vs admin). Esto es
// deliberado: hoy solo el flujo POS + Regla de Oro escribe el egreso compensatorio con
// origen='NCR'. Cuando una futura fase habilite el mismo reembolso de efectivo desde el
// modulo administrativo (Consulta de Factura / NC Tradicional), su origen debe agregarse
// a ORIGENES_DEVOLUCION_NC — el resto de la logica (aca y en el componente que la
// consume) no cambia.
//
// Invariante que este split preserva: retiros + devolucionesNc + vueltos == suma total
// de egresos de efectivo de entrada. No se altera el TOTAL, solo se re-etiqueta.
export const ORIGENES_DEVOLUCION_NC = ['NCR'] as const

export interface MovimientoManualItem {
  metodo_tipo: string
  metodo_moneda: string
  mov_tipo: string
  origen: string
  total: number
}

export interface EgresosArqueoSplit {
  retirosUsd: number
  retirosBsNativo: number
  devolucionesNcUsd: number
  devolucionesNcBsNativo: number
  vueltosUsd: number
  vueltosBsNativo: number
}

export function splitEgresosArqueo(movimientos: MovimientoManualItem[]): EgresosArqueoSplit {
  const esEgresoEfectivo = (m: MovimientoManualItem) =>
    m.metodo_tipo === 'EFECTIVO' && m.mov_tipo === 'EGRESO'
  const esUsd = (m: MovimientoManualItem) => m.metodo_moneda !== 'BS'
  const esBs = (m: MovimientoManualItem) => m.metodo_moneda === 'BS'
  const esDevolucionNc = (m: MovimientoManualItem) =>
    (ORIGENES_DEVOLUCION_NC as readonly string[]).includes(m.origen)
  const esVuelto = (m: MovimientoManualItem) => m.origen === 'VUELTO'

  const sum = (predicate: (m: MovimientoManualItem) => boolean) =>
    movimientos.filter((m) => esEgresoEfectivo(m) && predicate(m)).reduce((s, m) => s + m.total, 0)

  const egresosUsd = sum(esUsd)
  const egresosBsNativo = sum(esBs)
  const devolucionesNcUsd = sum((m) => esUsd(m) && esDevolucionNc(m))
  const devolucionesNcBsNativo = sum((m) => esBs(m) && esDevolucionNc(m))
  const vueltosUsd = sum((m) => esUsd(m) && esVuelto(m))
  const vueltosBsNativo = sum((m) => esBs(m) && esVuelto(m))

  return {
    retirosUsd: egresosUsd - devolucionesNcUsd - vueltosUsd,
    retirosBsNativo: egresosBsNativo - devolucionesNcBsNativo - vueltosBsNativo,
    devolucionesNcUsd,
    devolucionesNcBsNativo,
    vueltosUsd,
    vueltosBsNativo,
  }
}
