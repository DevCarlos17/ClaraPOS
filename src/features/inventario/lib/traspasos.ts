/**
 * Funciones puras (sin I/O) para el modulo de Traspasos entre depositos.
 *
 * La escritura atomica (INSERT de cabecera/detalle, `SELECT ... COUNT(*)`,
 * lectura de `inventario_stock` de origen, y las dos llamadas a
 * `upsertStockDeposito`) vive en el hook `use-traspasos.ts` (Slice 3b) — este
 * modulo solo contiene la logica que puede probarse sin PowerSync.
 *
 * Ver openspec/changes/inventario-multideposito/design.md — seccion
 * "Traspasos Feature Design".
 */

import Decimal from 'decimal.js'

/**
 * Calcula el `correlativo_usuario` del proximo traspaso a partir del conteo
 * de traspasos previos de ese usuario (mismo criterio que el correlativo de
 * facturas por caja: `COUNT(*) + 1`, computado dentro de la misma
 * `writeTransaction` — spec TRI/Correlativo incrementa por usuario).
 */
export function computeCorrelativoUsuario(countExistente: number): number {
  return countExistente + 1
}

export interface BuildTraspasoKardexPairParams {
  /** ID pre-generado (uuidv4) para la fila de salida en `movimientos_inventario`. */
  movSalidaId: string
  /** ID pre-generado (uuidv4) para la fila de entrada en `movimientos_inventario`. */
  movEntradaId: string
  empresa_id: string
  producto_id: string
  depositoOrigenId: string
  depositoDestinoId: string
  /** Cantidad transferida, siempre positiva (misma magnitud en ambas filas). */
  cantidad: Decimal
  usuario_id: string
  fecha: string
  /** ID de `traspasos_inventario` (cabecera) — comparte `doc_origen_id` entre salida y entrada. */
  traspasoId: string
  /** Referencia legible opcional (ej. correlativo formateado). */
  docOrigenRef?: string | null
}

/**
 * Fila "estatica" del kardex generada por un traspaso — deliberadamente NO
 * incluye `stock_anterior`/`stock_nuevo`: esos campos requieren una lectura
 * en vivo de `inventario_stock` dentro de la `writeTransaction` (Slice 3b),
 * y por lo tanto no pueden calcularse en una funcion pura. El llamador
 * combina esta fila con esos dos campos antes de ejecutar el INSERT.
 */
export interface TraspasoKardexRow {
  id: string
  empresa_id: string
  producto_id: string
  deposito_id: string
  tipo: 'E' | 'S'
  origen: 'TRA'
  /** Formateada a 3 decimales (`.toFixed(3)`), igual que el resto del kardex. */
  cantidad: string
  doc_origen_id: string
  doc_origen_ref: string | null
  usuario_id: string
  fecha: string
}

export interface TraspasoKardexPair {
  salida: TraspasoKardexRow
  entrada: TraspasoKardexRow
}

/**
 * Construye el par de filas de kardex (salida desde el deposito origen +
 * entrada al deposito destino) que un traspaso debe escribir, SIN ejecutar
 * SQL — pura, testeable sin PowerSync (spec TRI/Traspaso individual mueve
 * stock A→B atomicamente, TRI/Traspaso por Lote).
 */
export function buildTraspasoKardexPair(params: BuildTraspasoKardexPairParams): TraspasoKardexPair {
  const {
    movSalidaId,
    movEntradaId,
    empresa_id,
    producto_id,
    depositoOrigenId,
    depositoDestinoId,
    cantidad,
    usuario_id,
    fecha,
    traspasoId,
    docOrigenRef = null,
  } = params

  const cantidadStr = cantidad.toFixed(3)

  const salida: TraspasoKardexRow = {
    id: movSalidaId,
    empresa_id,
    producto_id,
    deposito_id: depositoOrigenId,
    tipo: 'S',
    origen: 'TRA',
    cantidad: cantidadStr,
    doc_origen_id: traspasoId,
    doc_origen_ref: docOrigenRef,
    usuario_id,
    fecha,
  }

  const entrada: TraspasoKardexRow = {
    id: movEntradaId,
    empresa_id,
    producto_id,
    deposito_id: depositoDestinoId,
    tipo: 'E',
    origen: 'TRA',
    cantidad: cantidadStr,
    doc_origen_id: traspasoId,
    doc_origen_ref: docOrigenRef,
    usuario_id,
    fecha,
  }

  return { salida, entrada }
}
