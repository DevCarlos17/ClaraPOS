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

/**
 * Excluye del listado de depósitos el que ya fue elegido del OTRO lado del
 * traspaso (origen excluye el destino seleccionado, y viceversa) — capa de
 * UX que se suma al guard real (schema + hook + trigger DB) que rechaza
 * `origen === destino`, no lo reemplaza (spec REQ Exclusión Mutua).
 * `idExcluido` vacío (nada seleccionado del otro lado todavía) es no-op.
 */
export function filtrarDepositosDisponibles<T extends { id: string }>(depositos: T[], idExcluido: string): T[] {
  if (idExcluido === '') return depositos
  return depositos.filter((d) => d.id !== idExcluido)
}

/**
 * Determina si el formulario tiene al menos un artículo cargado (línea con
 * `producto_id` no vacío) — gobierna el bloqueo del select de depósito
 * origen: una vez agregado el primer artículo (manual o via plantilla), no
 * tiene sentido permitir cambiar el origen sin vaciar la tabla primero
 * (spec REQ Búsqueda de Productos Limitada al Origen y Bloqueo de Selección).
 */
export function hayArticulosCargados(lineas: Array<{ producto_id: string }>): boolean {
  return lineas.some((l) => l.producto_id !== '')
}

export interface EstadoTraspasoForm {
  depositoOrigenId: string
  depositoDestinoId: string
  lineas: Array<{ producto_id: string; cantidad: string }>
  /** producto_id -> cantidad_actual en el depósito origen. */
  stockDisponiblePorProducto: Map<string, string>
  /** Productos activos tipo 'P' conocidos por el formulario. */
  productosValidosIds: Set<string>
}

export interface ResultadoPuedeProcesar {
  habilitado: boolean
  motivo?: string
}

/**
 * Predicado único que gobierna si el botón "Registrar Traspaso" puede
 * habilitarse — cubre la matriz completa del REQ Límite de Cantidad
 * Disponible y Habilitación Condicional del Botón, evaluada en este orden:
 * sin líneas -> falta origen/destino -> origen === destino -> línea con
 * producto vacío o inexistente/inactivo en BD -> línea sin cantidad válida
 * (vacía/0/negativa/NaN) -> producto sin stock registrado en origen ->
 * cantidad de alguna línea excede el disponible.
 *
 * Cantidad inválida/vacía/0 SI se valida aquí (corrección post-QA, ver
 * `sdd/traspaso-validaciones-redes-seguridad/qa-hallazgos` BUG 1): la regla
 * de fondo del mantenedor es que el botón solo se habilita cuando TODO el
 * formulario esta completo salvo la descripción — una línea con cantidad
 * vacía o 0 es un formulario incompleto, no debe depender solo del
 * `safeParse` de Zod en el submit.
 */
export function puedeProcesarTraspaso(estado: EstadoTraspasoForm): ResultadoPuedeProcesar {
  const { depositoOrigenId, depositoDestinoId, lineas, stockDisponiblePorProducto, productosValidosIds } = estado

  if (lineas.length === 0) {
    return { habilitado: false, motivo: 'Agregue al menos un producto' }
  }
  if (!depositoOrigenId || !depositoDestinoId) {
    return { habilitado: false, motivo: 'Seleccione el deposito de origen y el deposito de destino' }
  }
  if (depositoOrigenId === depositoDestinoId) {
    return {
      habilitado: false,
      motivo: 'El deposito de origen y el deposito de destino deben ser diferentes',
    }
  }

  for (const linea of lineas) {
    if (!linea.producto_id || !productosValidosIds.has(linea.producto_id)) {
      return { habilitado: false, motivo: 'Todas las lineas deben tener un producto valido' }
    }
  }

  for (const linea of lineas) {
    const cantidad = Number(linea.cantidad)
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return { habilitado: false, motivo: 'Todas las lineas deben tener una cantidad valida mayor a cero' }
    }
  }

  for (const linea of lineas) {
    if (!stockDisponiblePorProducto.has(linea.producto_id)) {
      return {
        habilitado: false,
        motivo: 'Uno de los productos no tiene stock registrado en el deposito de origen',
      }
    }
  }

  for (const linea of lineas) {
    const disponible = Number(stockDisponiblePorProducto.get(linea.producto_id))
    const cantidad = Number(linea.cantidad)
    if (Number.isFinite(cantidad) && cantidad > disponible) {
      return {
        habilitado: false,
        motivo: 'La cantidad de una linea supera el stock disponible en el deposito de origen',
      }
    }
  }

  return { habilitado: true }
}

export type GuardiaDepositoInactivoResultado =
  | { bloqueado: false }
  | { bloqueado: true; lado: 'origen' | 'destino' }

/**
 * Decisión pura de la Guardia `is_active` en Traspaso (mirror de la misma
 * guardia en Venta): rechaza si el depósito origen o destino está inactivo,
 * indicando cuál de los dos lados bloqueó — `crearTraspaso` la invoca ANTES
 * de abrir la `writeTransaction` (fail-fast, evita abrir tx para nada).
 */
export function evaluarGuardiaDepositosActivos(
  origenIsActive: number | undefined,
  destinoIsActive: number | undefined
): GuardiaDepositoInactivoResultado {
  if (origenIsActive === 0) return { bloqueado: true, lado: 'origen' }
  if (destinoIsActive === 0) return { bloqueado: true, lado: 'destino' }
  return { bloqueado: false }
}
