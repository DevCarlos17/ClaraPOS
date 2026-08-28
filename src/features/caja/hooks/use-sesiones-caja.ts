import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import Decimal from 'decimal.js'
import { toStorageString } from '@/lib/currency'
import { formatSesionId } from '@/lib/format'
import {
  consolidarMetodoATesoreriaEnTx,
  type DestinoConsolidacion,
} from '@/features/tesoreria/hooks/use-traspasos'
import { insertarGastoDeduccionEnTx } from '@/features/contabilidad/hooks/use-gastos'
import {
  resolverDeduccionesCierre,
  type DeduccionActivaRow,
} from '@/features/caja/lib/deducciones-cierre'
import { debeExcluirseDeConsolidacionCierre } from '@/features/caja/lib/consolidacion-cierre'
import { resolverMontoConsolidacionLote } from '@/features/caja/lib/resolucion-monto-consolidacion'

// ─── Interfaces ─────────────────────────────────────────────

export interface SesionCaja {
  id: string
  empresa_id: string
  caja_id: string
  usuario_apertura_id: string
  fecha_apertura: string
  monto_apertura_usd: string
  monto_apertura_bs: string
  usuario_cierre_id: string | null
  fecha_cierre: string | null
  monto_sistema_usd: string | null
  monto_fisico_usd: string | null
  diferencia_usd: string | null
  // 0041: saldos VES independientes del USD
  monto_sistema_bs: string | null
  monto_fisico_bs: string | null
  diferencia_bs: string | null
  observaciones_cierre: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface AbrirSesionParams {
  caja_id: string
  monto_apertura_usd: number
  monto_apertura_bs?: number
  usuario_id: string
  empresa_id: string
}

export interface CerrarSesionParams {
  monto_fisico_usd: number
  /** Conteo fisico de efectivo en Bs declarado por el cajero */
  monto_fisico_bs?: number
  /**
   * Total sistema en USD calculado por el cuadre (suma de todos los metodos: efectivo + otros).
   * Si se provee, se usa directamente en lugar de recalcular solo desde pagos efectivo.
   */
  monto_sistema_usd?: number
  observaciones_cierre?: string
  usuario_cierre_id: string
  /** Conteo fisico por metodo: keyed por metodo_cobro_id, valor en moneda nativa del metodo */
  conteoFisicoPorMetodo?: Record<string, number>
  /** Tasa del dia para convertir Bs → USD en el calculo de diferencia */
  tasaDelDia?: number
}

// ─── Interfaces extendidas ───────────────────────────────────

export interface SesionCajaConNombre extends SesionCaja {
  caja_nombre: string | null
}

// ─── Hooks de lectura ────────────────────────────────────────

/**
 * Retorna todas las sesiones con status ABIERTA de la empresa actual,
 * enriquecidas con el nombre de la caja.
 */
export function useSesionesActivas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data: sesionesData, isLoading } = useQuery(
    `SELECT * FROM sesiones_caja WHERE empresa_id = ? AND status = 'ABIERTA' ORDER BY fecha_apertura ASC`,
    [empresaId]
  )

  const { data: cajasData } = useQuery(
    `SELECT id, nombre FROM cajas WHERE empresa_id = ?`,
    [empresaId]
  )

  const cajaMap = new Map(
    ((cajasData ?? []) as { id: string; nombre: string }[]).map((c) => [c.id, c.nombre])
  )

  const sesiones: SesionCajaConNombre[] = ((sesionesData ?? []) as SesionCaja[]).map((s) => ({
    ...s,
    caja_nombre: cajaMap.get(s.caja_id) ?? null,
  }))

  return { sesiones, isLoading }
}

/**
 * Retorna las sesiones CERRADAS mas recientes de la empresa actual.
 * Las sesiones activas se consultan por separado con useSesionesActivas.
 */
export function useSesionesCaja(limite: number = 10) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    empresaId
      ? `SELECT * FROM sesiones_caja
         WHERE empresa_id = ? AND status = 'CERRADA'
         ORDER BY fecha_apertura DESC
         LIMIT ?`
      : '',
    empresaId ? [empresaId, limite] : []
  )

  return { sesiones: (data ?? []) as SesionCaja[], isLoading }
}

// ─── Interface: SesionCajaHistorial ──────────────────────────

export interface SesionCajaHistorial extends SesionCaja {
  cajero_nombre: string | null
  total_facturado_usd: number
}

/**
 * Retorna el historial de sesiones CERRADAS enriquecido con:
 *   - Nombre del cajero (JOIN usuarios)
 *   - Total facturado en USD (subquery ventas)
 * Usado en la tabla de historial de sesiones.
 */
export function useSesionesCajaHistorial(limite: number = 10) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    empresaId
      ? `SELECT s.*,
               u.nombre as cajero_nombre,
               COALESCE((
                 SELECT SUM(CAST(v.total_usd AS REAL))
                 FROM ventas v
                 WHERE v.sesion_caja_id = s.id AND v.status != 'ANULADA'
               ), 0) as total_facturado_usd
         FROM sesiones_caja s
         LEFT JOIN usuarios u ON u.id = s.usuario_apertura_id
         WHERE s.empresa_id = ? AND s.status = 'CERRADA'
         ORDER BY s.fecha_apertura DESC
         LIMIT ?`
      : '',
    empresaId ? [empresaId, limite] : []
  )

  return { sesiones: (data ?? []) as SesionCajaHistorial[], isLoading }
}

/**
 * Retorna la sesion de caja actualmente abierta (status = 'ABIERTA') del usuario actual.
 * Filtra por empresa_id Y usuario_apertura_id para que cada cajero vea solo su propia sesion.
 * Retorna null si no hay sesion activa para este usuario.
 */
export function useSesionActiva() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const usuarioId = user?.id ?? ''

  const { data, isLoading } = useQuery(
    empresaId && usuarioId
      ? `SELECT * FROM sesiones_caja
         WHERE empresa_id = ? AND status = 'ABIERTA' AND usuario_apertura_id = ?
         ORDER BY fecha_apertura DESC
         LIMIT 1`
      : '',
    empresaId && usuarioId ? [empresaId, usuarioId] : []
  )

  const sesion = ((data ?? []) as SesionCaja[])[0] ?? null

  return { sesion, isLoading }
}

// ─── Hook: useSaldoSesionCaja ────────────────────────────────

/**
 * Calcula el saldo de efectivo disponible en la sesion activa.
 * Formula: apertura + pagos_efectivo + ingresos_manual - egresos_manual - avances - prestamos
 * Esto refleja el dinero fisico real en caja en tiempo real.
 */
export function useSaldoSesionCaja(sesionCajaId: string | undefined) {
  const id = sesionCajaId ?? ''

  const { data: sesionData, isLoading: l1 } = useQuery(
    id ? 'SELECT monto_apertura_usd, monto_apertura_bs FROM sesiones_caja WHERE id = ?' : '',
    id ? [id] : []
  )

  const { data: pagosData, isLoading: l2 } = useQuery(
    id
      ? `SELECT
           COALESCE(SUM(CASE WHEN mo.codigo_iso = 'USD' THEN CAST(p.monto_usd AS REAL) ELSE 0 END), 0) AS ventas_usd,
           COALESCE(SUM(CASE WHEN mo.codigo_iso != 'USD' THEN CAST(p.monto AS REAL) ELSE 0 END), 0) AS ventas_bs
         FROM pagos p
         JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
         JOIN monedas mo ON p.moneda_id = mo.id
         WHERE p.sesion_caja_id = ? AND mc.tipo = 'EFECTIVO' AND p.is_reversed = 0`
      : '',
    id ? [id] : []
  )

  const { data: movsData, isLoading: l3 } = useQuery(
    id
      ? `SELECT
           mmc.origen,
           COALESCE(SUM(CASE WHEN mo.codigo_iso = 'USD' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) AS total_usd,
           COALESCE(SUM(CASE WHEN mo.codigo_iso != 'USD' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) AS total_bs
         FROM movimientos_metodo_cobro mmc
         JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
         JOIN monedas mo ON mc.moneda_id = mo.id
         WHERE mmc.sesion_caja_id = ?
           AND mc.tipo = 'EFECTIVO'
           AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO',
                             'INGRESO_TESORERIA', 'EGRESO_TESORERIA')
         GROUP BY mmc.origen`
      : '',
    id ? [id] : []
  )

  const sesion = (sesionData ?? [])[0] as
    | { monto_apertura_usd: string; monto_apertura_bs: string }
    | undefined
  const aperturaUsd = new Decimal(sesion?.monto_apertura_usd ?? '0')
  const aperturaBs  = new Decimal(sesion?.monto_apertura_bs  ?? '0')

  const pagosRow = (pagosData ?? [])[0] as
    | { ventas_usd: number; ventas_bs: number }
    | undefined
  const ventasUsd = new Decimal(pagosRow?.ventas_usd ?? 0)
  const ventasBs  = new Decimal(pagosRow?.ventas_bs  ?? 0)

  type MovRow = { origen: string; total_usd: number; total_bs: number }
  const movsMap = new Map<string, { usd: Decimal; bs: Decimal }>()
  for (const row of (movsData ?? []) as MovRow[]) {
    movsMap.set(row.origen, { usd: new Decimal(row.total_usd), bs: new Decimal(row.total_bs) })
  }

  const ingManualUsd    = movsMap.get('INGRESO_MANUAL')?.usd    ?? new Decimal(0)
  const ingManualBs     = movsMap.get('INGRESO_MANUAL')?.bs     ?? new Decimal(0)
  const egrManualUsd    = movsMap.get('EGRESO_MANUAL')?.usd     ?? new Decimal(0)
  const egrManualBs     = movsMap.get('EGRESO_MANUAL')?.bs      ?? new Decimal(0)
  const avancesUsd      = movsMap.get('AVANCE')?.usd            ?? new Decimal(0)
  const avancesBs       = movsMap.get('AVANCE')?.bs             ?? new Decimal(0)
  const prestamosUsd    = movsMap.get('PRESTAMO')?.usd          ?? new Decimal(0)
  const prestamosBs     = movsMap.get('PRESTAMO')?.bs           ?? new Decimal(0)
  // pos-tesoreria-integration: include POS↔Treasury transfers in session balance
  const ingTesoreriaUsd = movsMap.get('INGRESO_TESORERIA')?.usd ?? new Decimal(0)
  const ingTesoBs       = movsMap.get('INGRESO_TESORERIA')?.bs  ?? new Decimal(0)
  const egrTesoreriaUsd = movsMap.get('EGRESO_TESORERIA')?.usd  ?? new Decimal(0)
  const egrTesoBs       = movsMap.get('EGRESO_TESORERIA')?.bs   ?? new Decimal(0)

  const saldoUsdD = Decimal.max(
    new Decimal(0),
    aperturaUsd
      .plus(ventasUsd)
      .plus(ingManualUsd)
      .plus(ingTesoreriaUsd)
      .minus(egrManualUsd)
      .minus(avancesUsd)
      .minus(prestamosUsd)
      .minus(egrTesoreriaUsd)
  )

  const saldoBsD = Decimal.max(
    new Decimal(0),
    aperturaBs
      .plus(ventasBs)
      .plus(ingManualBs)
      .plus(ingTesoBs)
      .minus(egrManualBs)
      .minus(avancesBs)
      .minus(prestamosBs)
      .minus(egrTesoBs)
  )

  return { saldoUsd: saldoUsdD.toNumber(), saldoBs: saldoBsD.toNumber(), isLoading: l1 || l2 || l3 }
}

// ─── Interface: SesionActivaDashboard ────────────────────────

export interface SesionActivaDashboard {
  id: string
  empresa_id: string
  caja_id: string
  caja_nombre: string | null
  cajera_nombre: string | null
  fecha_apertura: string
  monto_apertura_usd: string
  monto_apertura_bs: string
  // Saldo actual calculado
  saldoUsd: number
  saldoBs: number
  // Estadisticas de la sesion
  totalFacturas: number
  totalFacturadoUsd: number
  totalArticulos: number
  // Tiempo y KPIs
  horasTranscurridas: number
  factHora: number
  itemsHora: number
  atv: number   // Average Transaction Value (USD por factura)
  upt: number   // Units Per Transaction (articulos por factura)
  // Score comparativo dentro del turno (0-100)
  score: number
}

// ─── Hook: useSesionesActivasDashboard ───────────────────────

/**
 * Hook de dashboard para sesiones activas.
 * Ejecuta 5 queries multi-sesion para agregar en una sola pasada:
 *   - Nombres de caja y cajera via JOIN
 *   - Saldo actual por sesion (apertura + pagos + movimientos)
 *   - Estadisticas de facturacion: total USD, conteo facturas, articulos
 *   - KPIs calculados: fact/hora, ATV, UPT
 *   - Score comparativo normalizado entre cajeras del turno
 */
export function useSesionesActivasDashboard() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  // Q1: Sesiones activas enriquecidas con nombre de caja y cajera
  const { data: sesionesData, isLoading: l1 } = useQuery(
    empresaId
      ? `SELECT s.id, s.empresa_id, s.caja_id, s.fecha_apertura,
                s.monto_apertura_usd, s.monto_apertura_bs,
                c.nombre as caja_nombre,
                u.nombre as cajera_nombre
         FROM sesiones_caja s
         LEFT JOIN cajas c ON c.id = s.caja_id
         LEFT JOIN usuarios u ON u.id = s.usuario_apertura_id
         WHERE s.empresa_id = ? AND s.status = 'ABIERTA'
         ORDER BY s.fecha_apertura ASC`
      : '',
    empresaId ? [empresaId] : []
  )

  type SesionBaseRow = {
    id: string; empresa_id: string; caja_id: string; fecha_apertura: string
    monto_apertura_usd: string; monto_apertura_bs: string
    caja_nombre: string | null; cajera_nombre: string | null
  }

  const sesionesBase = (sesionesData ?? []) as SesionBaseRow[]
  const sesionIds = sesionesBase.map(s => s.id)
  const inPh = sesionIds.map(() => '?').join(', ')
  const hasIds = sesionIds.length > 0

  // Q2: Estadisticas de ventas por sesion
  const { data: ventasData, isLoading: l2 } = useQuery(
    hasIds
      ? `SELECT sesion_caja_id,
               COUNT(*) as total_facturas,
               COALESCE(SUM(CAST(total_usd AS REAL)), 0) as total_facturado_usd
         FROM ventas
         WHERE sesion_caja_id IN (${inPh}) AND status != 'ANULADA'
         GROUP BY sesion_caja_id`
      : '',
    hasIds ? sesionIds : []
  )

  // Q3: Articulos por sesion
  const { data: artsData, isLoading: l3 } = useQuery(
    hasIds
      ? `SELECT v.sesion_caja_id,
               COALESCE(SUM(CAST(vd.cantidad AS REAL)), 0) as total_articulos
         FROM ventas v
         JOIN ventas_det vd ON vd.venta_id = v.id
         WHERE v.sesion_caja_id IN (${inPh}) AND v.status != 'ANULADA'
         GROUP BY v.sesion_caja_id`
      : '',
    hasIds ? sesionIds : []
  )

  // Q4: Pagos en efectivo por sesion (para saldo)
  const { data: pagosData, isLoading: l4 } = useQuery(
    hasIds
      ? `SELECT p.sesion_caja_id,
               COALESCE(SUM(CASE WHEN mo.codigo_iso = 'USD' THEN CAST(p.monto_usd AS REAL) ELSE 0 END), 0) as ventas_usd,
               COALESCE(SUM(CASE WHEN mo.codigo_iso != 'USD' THEN CAST(p.monto AS REAL) ELSE 0 END), 0) as ventas_bs
         FROM pagos p
         JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
         JOIN monedas mo ON p.moneda_id = mo.id
         WHERE p.sesion_caja_id IN (${inPh}) AND mc.tipo = 'EFECTIVO' AND p.is_reversed = 0
         GROUP BY p.sesion_caja_id`
      : '',
    hasIds ? sesionIds : []
  )

  // Q5: Movimientos manuales por sesion (para saldo)
  const { data: movsData, isLoading: l5 } = useQuery(
    hasIds
      ? `SELECT mmc.sesion_caja_id, mmc.origen,
               COALESCE(SUM(CASE WHEN mo.codigo_iso = 'USD' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) as total_usd,
               COALESCE(SUM(CASE WHEN mo.codigo_iso != 'USD' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) as total_bs
         FROM movimientos_metodo_cobro mmc
         JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
         JOIN monedas mo ON mc.moneda_id = mo.id
         WHERE mmc.sesion_caja_id IN (${inPh})
           AND mc.tipo = 'EFECTIVO'
           AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO',
                             'INGRESO_TESORERIA', 'EGRESO_TESORERIA')
         GROUP BY mmc.sesion_caja_id, mmc.origen`
      : '',
    hasIds ? sesionIds : []
  )

  // ─── Construir mapas de lookup ───────────────────────────────

  type VentasRow = { sesion_caja_id: string; total_facturas: number; total_facturado_usd: number }
  const ventasMap = new Map<string, { facturas: number; facturado: number }>()
  for (const r of (ventasData ?? []) as VentasRow[]) {
    ventasMap.set(r.sesion_caja_id, { facturas: r.total_facturas, facturado: r.total_facturado_usd })
  }

  type ArtsRow = { sesion_caja_id: string; total_articulos: number }
  const artsMap = new Map<string, number>()
  for (const r of (artsData ?? []) as ArtsRow[]) {
    artsMap.set(r.sesion_caja_id, r.total_articulos)
  }

  type PagosRow = { sesion_caja_id: string; ventas_usd: number; ventas_bs: number }
  const pagosMap = new Map<string, { usd: number; bs: number }>()
  for (const r of (pagosData ?? []) as PagosRow[]) {
    pagosMap.set(r.sesion_caja_id, { usd: r.ventas_usd, bs: r.ventas_bs })
  }

  type MovsRow = { sesion_caja_id: string; origen: string; total_usd: number; total_bs: number }
  const movsMap = new Map<string, Map<string, { usd: number; bs: number }>>()
  for (const r of (movsData ?? []) as MovsRow[]) {
    if (!movsMap.has(r.sesion_caja_id)) movsMap.set(r.sesion_caja_id, new Map())
    movsMap.get(r.sesion_caja_id)!.set(r.origen, { usd: r.total_usd, bs: r.total_bs })
  }

  // ─── Calcular KPIs por sesion ────────────────────────────────

  const now = Date.now()

  const sesionesConKpis = sesionesBase.map(s => {
    const v       = ventasMap.get(s.id) ?? { facturas: 0, facturado: 0 }
    const arts    = artsMap.get(s.id) ?? 0
    const pagos   = pagosMap.get(s.id) ?? { usd: 0, bs: 0 }
    const movs    = movsMap.get(s.id) ?? new Map<string, { usd: number; bs: number }>()

    const aperturaUsd  = new Decimal(s.monto_apertura_usd ?? '0')
    const aperturaBs   = new Decimal(s.monto_apertura_bs  ?? '0')

    const ingManualUsd    = new Decimal(movs.get('INGRESO_MANUAL')?.usd    ?? 0)
    const ingManualBs     = new Decimal(movs.get('INGRESO_MANUAL')?.bs     ?? 0)
    const egrManualUsd    = new Decimal(movs.get('EGRESO_MANUAL')?.usd     ?? 0)
    const egrManualBs     = new Decimal(movs.get('EGRESO_MANUAL')?.bs      ?? 0)
    const avancesUsd      = new Decimal(movs.get('AVANCE')?.usd            ?? 0)
    const avancesBs       = new Decimal(movs.get('AVANCE')?.bs             ?? 0)
    const prestamosUsd    = new Decimal(movs.get('PRESTAMO')?.usd          ?? 0)
    const prestamosBs     = new Decimal(movs.get('PRESTAMO')?.bs           ?? 0)
    // pos-tesoreria-integration: include POS↔Treasury transfers in session balance
    const ingTesoreriaUsd = new Decimal(movs.get('INGRESO_TESORERIA')?.usd ?? 0)
    const ingTesoBs       = new Decimal(movs.get('INGRESO_TESORERIA')?.bs  ?? 0)
    const egrTesoreriaUsd = new Decimal(movs.get('EGRESO_TESORERIA')?.usd  ?? 0)
    const egrTesoBs       = new Decimal(movs.get('EGRESO_TESORERIA')?.bs   ?? 0)
    const pagosUsd        = new Decimal(pagos.usd)
    const pagosBs         = new Decimal(pagos.bs)

    const saldoUsd = Decimal.max(
      new Decimal(0),
      aperturaUsd
        .plus(pagosUsd)
        .plus(ingManualUsd)
        .plus(ingTesoreriaUsd)
        .minus(egrManualUsd)
        .minus(avancesUsd)
        .minus(prestamosUsd)
        .minus(egrTesoreriaUsd)
    ).toNumber()

    const saldoBs = Decimal.max(
      new Decimal(0),
      aperturaBs
        .plus(pagosBs)
        .plus(ingManualBs)
        .plus(ingTesoBs)
        .minus(egrManualBs)
        .minus(avancesBs)
        .minus(prestamosBs)
        .minus(egrTesoBs)
    ).toNumber()

    const horasTranscurridas = Math.max(0.1, (now - new Date(s.fecha_apertura).getTime()) / 3_600_000)
    const totalArticulos = Math.round(arts)
    const factHora = v.facturas / horasTranscurridas
    const itemsHora = arts / horasTranscurridas
    const atv = v.facturas > 0 ? v.facturado / v.facturas : 0
    const upt = v.facturas > 0 ? arts / v.facturas : 0

    return {
      id: s.id,
      empresa_id: s.empresa_id,
      caja_id: s.caja_id,
      caja_nombre: s.caja_nombre ?? null,
      cajera_nombre: s.cajera_nombre ?? null,
      fecha_apertura: s.fecha_apertura,
      monto_apertura_usd: s.monto_apertura_usd,
      monto_apertura_bs: s.monto_apertura_bs,
      saldoUsd,
      saldoBs,
      totalFacturas: v.facturas,
      totalFacturadoUsd: v.facturado,
      totalArticulos,
      horasTranscurridas,
      factHora,
      itemsHora,
      atv,
      upt,
      score: 0,
    }
  })

  // ─── Score comparativo normalizado ───────────────────────────

  const soloUna = sesionesConKpis.length <= 1
  const maxFactHora  = Math.max(...sesionesConKpis.map(s => s.factHora),  0.001)
  const maxItemsHora = Math.max(...sesionesConKpis.map(s => s.itemsHora), 0.001)

  const sesiones: SesionActivaDashboard[] = sesionesConKpis.map(s => ({
    ...s,
    score: soloUna
      ? 100
      : Math.round(((s.factHora / maxFactHora) * 0.5 + (s.itemsHora / maxItemsHora) * 0.5) * 100),
  }))

  return {
    sesiones,
    isLoading: l1 || l2 || l3 || l4 || l5,
    soloUna,
  }
}

// ─── Hook: useSesionEstadisticas ─────────────────────────────

/**
 * Estadisticas de rendimiento de una sesion en tiempo real.
 * Cuenta facturas, total facturado en USD y total de articulos procesados.
 * Solo incluye ventas no anuladas.
 */
export function useSesionEstadisticas(sesionCajaId: string | undefined) {
  const id = sesionCajaId ?? ''

  const { data: ventasData, isLoading: l1 } = useQuery(
    id
      ? `SELECT
           COUNT(*) as total_facturas,
           COALESCE(SUM(CAST(total_usd AS REAL)), 0) as total_facturado_usd
         FROM ventas
         WHERE sesion_caja_id = ? AND status != 'ANULADA'`
      : '',
    id ? [id] : []
  )

  const { data: artsData, isLoading: l2 } = useQuery(
    id
      ? `SELECT COALESCE(SUM(CAST(vd.cantidad AS REAL)), 0) as total_articulos
         FROM ventas v
         JOIN ventas_det vd ON vd.venta_id = v.id
         WHERE v.sesion_caja_id = ? AND v.status != 'ANULADA'`
      : '',
    id ? [id] : []
  )

  const row = (ventasData ?? [])[0] as
    | { total_facturas: number; total_facturado_usd: number }
    | undefined
  const artsRow = (artsData ?? [])[0] as { total_articulos: number } | undefined

  return {
    totalFacturas: row?.total_facturas ?? 0,
    totalFacturadoUsd: row?.total_facturado_usd ?? 0,
    totalArticulos: Math.round(artsRow?.total_articulos ?? 0),
    isLoading: l1 || l2,
  }
}

// ─── Funcion: abrirSesionCaja ────────────────────────────────

/**
 * Abre una nueva sesion de caja con status 'ABIERTA'.
 * Retorna el id de la sesion creada.
 */
export async function abrirSesionCaja(params: AbrirSesionParams): Promise<string> {
  const { caja_id, monto_apertura_usd, monto_apertura_bs = 0, usuario_id, empresa_id } = params

  if (monto_apertura_usd < 0) {
    throw new Error('El monto de apertura no puede ser negativo')
  }
  if (monto_apertura_bs < 0) {
    throw new Error('El monto de apertura en Bs no puede ser negativo')
  }

  const id = uuidv4()
  const now = localNow()
  const montoAperturaUsdD = new Decimal(monto_apertura_usd)
  const montoAperturaBsD  = new Decimal(monto_apertura_bs)

  await db.writeTransaction(async (tx) => {
    // Validar que no haya ya una sesion abierta para esta caja (Plan B)
    const existente = await tx.execute(
      `SELECT sc.id, u.nombre as usuario_nombre
       FROM sesiones_caja sc
       LEFT JOIN usuarios u ON u.id = sc.usuario_apertura_id
       WHERE sc.empresa_id = ? AND sc.caja_id = ? AND sc.status = 'ABIERTA'
       LIMIT 1`,
      [empresa_id, caja_id]
    )

    if (existente.rows && existente.rows.length > 0) {
      const row = existente.rows.item(0) as { usuario_nombre: string | null }
      const quien = row.usuario_nombre ? ` Responsable actual: ${row.usuario_nombre}.` : ''
      throw new Error(`Esta caja ya tiene una sesion abierta.${quien} Solicita el cierre antes de continuar.`)
    }

    await tx.execute(
      `INSERT INTO sesiones_caja (
         id, empresa_id, caja_id, usuario_apertura_id, fecha_apertura,
         monto_apertura_usd, monto_apertura_bs, usuario_cierre_id, fecha_cierre,
         monto_sistema_usd, monto_fisico_usd, diferencia_usd,
         observaciones_cierre, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 'ABIERTA', ?, ?)`,
      [id, empresa_id, caja_id, usuario_id, now, toStorageString(montoAperturaUsdD), toStorageString(montoAperturaBsD), now, now]
    )
  })

  return id
}

// ─── Funcion: cerrarSesionCaja ───────────────────────────────

/**
 * Cierra una sesion de caja activa.
 *
 * Calcula saldos esperados por divisa de forma independiente (USD y VES):
 *   monto_sistema_X = apertura_X + pagos_efectivo_X + ingresos_manuales_X
 *                     - egresos_manuales_X - vueltos_X
 *   diferencia_X    = monto_fisico_X - monto_sistema_X
 *
 * Tambien genera sesiones_caja_detalle con el desglose por metodo de cobro.
 */
export async function cerrarSesionCaja(id: string, params: CerrarSesionParams): Promise<void> {
  const {
    monto_fisico_usd,
    monto_fisico_bs = 0,
    monto_sistema_usd: montoSistemaUsdParam,
    observaciones_cierre,
    usuario_cierre_id,
    conteoFisicoPorMetodo,
    tasaDelDia,
  } = params

  if (monto_fisico_usd < 0) throw new Error('El monto fisico USD no puede ser negativo')
  if (monto_fisico_bs < 0) throw new Error('El monto fisico Bs no puede ser negativo')

  const now = localNow()
  const montoFisicoUsdD = new Decimal(monto_fisico_usd)
  const montoFisicoBsD  = new Decimal(monto_fisico_bs)

  await db.writeTransaction(async (tx) => {
    // 1. Leer sesion y validar que este abierta
    const result = await tx.execute(
      `SELECT status, monto_apertura_usd, monto_apertura_bs, empresa_id
       FROM sesiones_caja WHERE id = ?`,
      [id]
    )

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Sesion de caja no encontrada')
    }

    const sesion = result.rows.item(0) as {
      status: string
      monto_apertura_usd: string
      monto_apertura_bs: string
      empresa_id: string
    }

    if (sesion.status !== 'ABIERTA') {
      throw new Error('La sesion de caja ya fue cerrada')
    }

    const aperturaUsd = new Decimal(sesion.monto_apertura_usd || '0')
    const aperturaBs  = new Decimal(sesion.monto_apertura_bs ?? '0')
    const empresaId   = sesion.empresa_id

    // 2a. Pagos en EFECTIVO cobrados en USD (monto nativo = USD)
    const pagosEfectivoUsdResult = await tx.execute(
      `SELECT COALESCE(SUM(CAST(p.monto AS REAL)), 0) as total
       FROM pagos p
       JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
       JOIN monedas mo ON p.moneda_id = mo.id
       WHERE p.sesion_caja_id = ?
         AND mc.tipo = 'EFECTIVO'
         AND mo.codigo_iso = 'USD'
         AND COALESCE(p.is_reversed, 0) = 0`,
      [id]
    )
    const pagosEfectivoUsd = new Decimal(
      (pagosEfectivoUsdResult.rows?.item(0) as { total: number } | undefined)?.total ?? 0
    )

    // 2b. Pagos en EFECTIVO cobrados en VES (monto nativo = Bs)
    const pagosEfectivoBsResult = await tx.execute(
      `SELECT COALESCE(SUM(CAST(p.monto AS REAL)), 0) as total
       FROM pagos p
       JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
       JOIN monedas mo ON p.moneda_id = mo.id
       WHERE p.sesion_caja_id = ?
         AND mc.tipo = 'EFECTIVO'
         AND mo.codigo_iso = 'VES'
         AND COALESCE(p.is_reversed, 0) = 0`,
      [id]
    )
    const pagosEfectivoBs = new Decimal(
      (pagosEfectivoBsResult.rows?.item(0) as { total: number } | undefined)?.total ?? 0
    )

    // 3a. Movimientos manuales en USD (incluye orígenes POS↔Tesorería)
    const movsManualUsdResult = await tx.execute(
      `SELECT mmc.origen, COALESCE(SUM(CAST(mmc.monto AS REAL)), 0) as total
       FROM movimientos_metodo_cobro mmc
       JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
       JOIN monedas mo ON mc.moneda_id = mo.id
       WHERE mmc.sesion_caja_id = ?
         AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO', 'VUELTO',
                            'INGRESO_TESORERIA', 'EGRESO_TESORERIA')
         AND mo.codigo_iso = 'USD'
       GROUP BY mmc.origen`,
      [id]
    )

    let ingresosManualUsd = new Decimal(0)
    let egresosManualUsd  = new Decimal(0)
    if (movsManualUsdResult.rows) {
      for (let i = 0; i < movsManualUsdResult.rows.length; i++) {
        const row = movsManualUsdResult.rows.item(i) as { origen: string; total: number }
        if (row.origen === 'INGRESO_MANUAL' || row.origen === 'INGRESO_TESORERIA') {
          ingresosManualUsd = ingresosManualUsd.plus(new Decimal(row.total))
        } else {
          // EGRESO_MANUAL, AVANCE, PRESTAMO, VUELTO y EGRESO_TESORERIA son salidas de efectivo
          egresosManualUsd = egresosManualUsd.plus(new Decimal(row.total))
        }
      }
    }

    // 3b. Movimientos manuales en VES (incluye orígenes POS↔Tesorería)
    const movsManualBsResult = await tx.execute(
      `SELECT mmc.origen, COALESCE(SUM(CAST(mmc.monto AS REAL)), 0) as total
       FROM movimientos_metodo_cobro mmc
       JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
       JOIN monedas mo ON mc.moneda_id = mo.id
       WHERE mmc.sesion_caja_id = ?
         AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO', 'VUELTO',
                            'INGRESO_TESORERIA', 'EGRESO_TESORERIA')
         AND mo.codigo_iso = 'VES'
       GROUP BY mmc.origen`,
      [id]
    )

    let ingresosManualBs = new Decimal(0)
    let egresosManualBs  = new Decimal(0)
    if (movsManualBsResult.rows) {
      for (let i = 0; i < movsManualBsResult.rows.length; i++) {
        const row = movsManualBsResult.rows.item(i) as { origen: string; total: number }
        if (row.origen === 'INGRESO_MANUAL' || row.origen === 'INGRESO_TESORERIA') {
          ingresosManualBs = ingresosManualBs.plus(new Decimal(row.total))
        } else {
          egresosManualBs = egresosManualBs.plus(new Decimal(row.total))
        }
      }
    }

    // 4. Calcular saldos esperados por divisa
    //    Para USD: si el caller provee monto_sistema_usd (calculado por el cuadre UI sumando
    //    todos los metodos), se usa ese valor directamente para mantener consistencia con lo
    //    mostrado al usuario. Si no, se calcula solo desde pagos efectivo (fallback).
    //    Para Bs: siempre desde efectivo (los otros metodos son USD en este sistema).
    const montoSistemaUsdFromDB = aperturaUsd
      .plus(pagosEfectivoUsd)
      .plus(ingresosManualUsd)
      .minus(egresosManualUsd)

    const montoSistemaUsd = montoSistemaUsdParam !== undefined
      ? new Decimal(montoSistemaUsdParam)
      : montoSistemaUsdFromDB

    const montoSistemaBs = aperturaBs
      .plus(pagosEfectivoBs)
      .plus(ingresosManualBs)
      .minus(egresosManualBs)

    const diferenciaUsd = montoFisicoUsdD.minus(montoSistemaUsd)
    const diferenciaBs  = montoFisicoBsD.minus(montoSistemaBs)

    // NOTA (cierre-consolidacion-tesoreria, Opcion 1): el UPDATE status = 'CERRADA'
    // se hace AL FINAL de esta writeTransaction (paso 10), NO aqui. El trigger Postgres
    // fn_validate_sesion_abierta (migracion 0041) rechaza cualquier INSERT en
    // movimientos_metodo_cobro cuyo sesion_caja_id apunte a una sesion que ya NO esta
    // ABIERTA. La consolidacion a Tesoreria (pasos 8-9) inserta EGRESO en esa tabla, por
    // lo que debe correr con la sesion todavia ABIERTA. Todo sigue dentro de la misma
    // writeTransaction: si algo falla, rollback total y la sesion permanece ABIERTA.

    // 6. Poblar sesiones_caja_detalle con desglose por metodo de cobro
    // Obtener todos los metodos usados en pagos de esta sesion
    // total_pagos se calcula en la MONEDA NATIVA del metodo (USD -> monto_usd,
    // resto -> monto). Mezclar USD y Bs en una misma suma viola la regla bimonetaria
    // y subvaluaba los metodos en Bs por un factor de ~tasa (cierre-consolidacion-tesoreria).
    const metodosUsadosResult = await tx.execute(
      `SELECT p.metodo_cobro_id, mc.moneda_id, mo.codigo_iso as moneda_codigo,
              COALESCE(SUM(
                CASE WHEN mo.codigo_iso = 'USD'
                     THEN CAST(p.monto_usd AS REAL)
                     ELSE CAST(p.monto AS REAL) END
              ), 0) as total_pagos,
              COUNT(*) as num_transacciones
       FROM pagos p
       JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
       JOIN monedas mo ON mc.moneda_id = mo.id
       WHERE p.sesion_caja_id = ? AND COALESCE(p.is_reversed, 0) = 0
       GROUP BY p.metodo_cobro_id, mc.moneda_id, mo.codigo_iso`,
      [id]
    )

    // Movimientos manuales (incluyendo VUELTO) agrupados por metodo de cobro
    const movsManualPorMetodoResult = await tx.execute(
      `SELECT metodo_cobro_id,
              SUM(CASE WHEN tipo = 'INGRESO' THEN CAST(monto AS REAL) ELSE 0 END) as total_ingreso,
              SUM(CASE WHEN tipo = 'EGRESO' THEN CAST(monto AS REAL) ELSE 0 END) as total_egreso
       FROM movimientos_metodo_cobro
       WHERE sesion_caja_id = ?
         AND origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO', 'VUELTO',
                       'INGRESO_TESORERIA', 'EGRESO_TESORERIA')
       GROUP BY metodo_cobro_id`,
      [id]
    )

    const movsManualPorMetodo = new Map<string, { ingreso: number; egreso: number }>()
    if (movsManualPorMetodoResult.rows) {
      for (let i = 0; i < movsManualPorMetodoResult.rows.length; i++) {
        const row = movsManualPorMetodoResult.rows.item(i) as {
          metodo_cobro_id: string
          total_ingreso: number
          total_egreso: number
        }
        movsManualPorMetodo.set(row.metodo_cobro_id, {
          ingreso: row.total_ingreso,
          egreso: row.total_egreso,
        })
      }
    }

    // cierre-consolidacion-tesoreria (PR2): acumula el total_sistema por metodo de cobro
    // ya calculado en este loop, para reutilizarlo en el step 9 sin recalcular.
    // totalFisicoNativo (cierre-tesoreria-monto-reportado-lote): monto contado/reportado
    // por el cajero para el metodo, en la misma moneda nativa. Se propaga hasta el loop
    // de consolidacion para que la rama sin-lotes use lo reportado, nunca totalSistemaD.
    const consolidacionPorMetodo = new Map<
      string,
      { totalSistemaD: Decimal; monedaId: string; totalFisicoNativo: Decimal | null }
    >()

    if (metodosUsadosResult.rows) {
      for (let i = 0; i < metodosUsadosResult.rows.length; i++) {
        const row = metodosUsadosResult.rows.item(i) as {
          metodo_cobro_id: string
          moneda_id: string
          moneda_codigo: string
          total_pagos: number
          num_transacciones: number
        }

        const manual = movsManualPorMetodo.get(row.metodo_cobro_id) ?? { ingreso: 0, egreso: 0 }
        // totalSistemaD ahora esta en la MONEDA NATIVA del metodo (ver query arriba).
        const totalSistemaD = new Decimal(row.total_pagos)
          .plus(new Decimal(manual.ingreso))
          .minus(new Decimal(manual.egreso))

        // Calcular total_fisico y diferencia si se recibio conteo del usuario.
        // conteoFisicoPorMetodo esta en moneda nativa y totalSistemaD tambien:
        // la diferencia se calcula nativo vs nativo (sin conversion de tasa).
        let totalFisicoD: Decimal | null = null
        let diferenciaValor: Decimal | null = null
        if (conteoFisicoPorMetodo && row.metodo_cobro_id in conteoFisicoPorMetodo) {
          totalFisicoD = new Decimal(conteoFisicoPorMetodo[row.metodo_cobro_id])
          diferenciaValor = totalFisicoD.minus(totalSistemaD)
        }

        if (row.metodo_cobro_id) {
          consolidacionPorMetodo.set(row.metodo_cobro_id, {
            totalSistemaD,
            monedaId: row.moneda_id,
            totalFisicoNativo: totalFisicoD,
          })
        }

        const detalleId = uuidv4()
        await tx.execute(
          `INSERT OR IGNORE INTO sesiones_caja_detalle
             (id, sesion_caja_id, metodo_cobro_id, moneda_id, total_sistema, total_fisico, diferencia, num_transacciones, empresa_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            detalleId,
            id,
            row.metodo_cobro_id,
            row.moneda_id,
            toStorageString(totalSistemaD),
            totalFisicoD !== null ? toStorageString(totalFisicoD) : null,
            diferenciaValor !== null ? toStorageString(diferenciaValor) : null,
            row.num_transacciones,
            empresaId,
            now,
          ]
        )
      }
    }

    // 7. Snapshot SAF: si hubo saldo a favor aplicado en esta sesion, insertar
    //    una fila virtual en sesiones_caja_detalle para el historial de cierre.
    //    metodo_cobro_id = NULL y moneda_id = NULL identifican la fila como SAF virtual.
    //    Requiere migration 0052 que relaja las restricciones NOT NULL en esas columnas.
    const safResult = await tx.execute(
      `SELECT
         COALESCE(SUM(CAST(monto AS REAL)), 0) as saf_total,
         COUNT(*) as saf_count
       FROM movimientos_cuenta
       WHERE tipo = 'SAF'
         AND sesion_caja_id = ?
         AND sesion_caja_id IS NOT NULL
         AND empresa_id = ?`,
      [id, empresaId]
    )

    const safRow = safResult.rows?.item(0) as { saf_total: number; saf_count: number } | undefined
    const safTotal = new Decimal(safRow?.saf_total ?? 0)
    const safCount = Number(safRow?.saf_count ?? 0)

    if (safTotal.gt(0)) {
      await tx.execute(
        `INSERT OR IGNORE INTO sesiones_caja_detalle
           (id, sesion_caja_id, metodo_cobro_id, moneda_id, total_sistema, total_fisico,
            diferencia, num_transacciones, empresa_id, created_at)
         VALUES (?, ?, NULL, NULL, ?, NULL, NULL, ?, ?, ?)`,
        [
          uuidv4(),
          id,
          toStorageString(safTotal),
          safCount,
          empresaId,
          now,
        ]
      )
    }

    // 8-9. NEW (cierre-consolidacion-tesoreria, PR2): consolidacion automatica hacia
    // Tesoreria de cada metodo usado en la sesion con saldo positivo. Se ejecuta DENTRO
    // de esta misma writeTransaction — cualquier fallo (destino sin configurar, cuenta
    // de comision sin configurar, tasa faltante) revierte TODO el cierre y la sesion
    // permanece ABIERTA.
    //
    // conciliacion-lotes-pos (fix WARNING #2, verify-report obs #608): el set de metodos
    // a consolidar es la UNION de (a) metodos con pagos no-reversados y saldo positivo
    // (comportamiento original, sin cambios) y (b) metodos con lotes POS capturados en
    // lotes_pos_cuadre para esta sesion. Sin esta union, un metodo tipo='PUNTO' cuyos
    // pagos fueron TODOS reversados no aparece en (a) (metodosUsadosResult filtra
    // is_reversed=0 y no genera fila) pero SI puede tener lotes cargados por el cajero
    // (usePagosPorMetodo, que dirige el cuadre UI, no filtra is_reversed y deja verlo) —
    // sin la union esos lotes se descartaban en silencio al cerrar, sin error y sin
    // traspaso a Tesoreria (perdida de dinero silenciosa).
    const metodosConLotesResult = await tx.execute(
      `SELECT DISTINCT metodo_cobro_id FROM lotes_pos_cuadre
       WHERE empresa_id = ? AND sesion_caja_id = ?`,
      [empresaId, id]
    )
    const metodoIdsConLotes = new Set<string>()
    if (metodosConLotesResult.rows) {
      for (let i = 0; i < metodosConLotesResult.rows.length; i++) {
        const row = metodosConLotesResult.rows.item(i) as { metodo_cobro_id: string }
        if (row.metodo_cobro_id) metodoIdsConLotes.add(row.metodo_cobro_id)
      }
    }

    const metodosParaConsolidarBase = Array.from(consolidacionPorMetodo.entries()).filter(
      ([metodoCobroId, v]) => metodoCobroId && v.totalSistemaD.gt(0)
    )
    const metodoIdsBase = new Set(metodosParaConsolidarBase.map(([metodoCobroId]) => metodoCobroId))
    // Metodos que SOLO tienen lotes (sin pagos no-reversados con saldo positivo). Se
    // agregan con un placeholder de totalSistemaD/monedaId que nunca se usa: mas abajo
    // (paso 9) todo metodo con lotes SIEMPRE toma la rama `lotesDelMetodo.length > 0`,
    // que reemplaza totalSistemaD por la suma de lotes y resuelve monedaId desde la
    // config real del metodo (ver `monedaIdBase || config.moneda_id`).
    const metodoIdsSoloLotes = Array.from(metodoIdsConLotes).filter((mid) => !metodoIdsBase.has(mid))

    const metodosParaConsolidar: [
      string,
      { totalSistemaD: Decimal; monedaId: string; totalFisicoNativo: Decimal | null },
    ][] = [
      ...metodosParaConsolidarBase,
      ...metodoIdsSoloLotes.map(
        (mid) =>
          [mid, { totalSistemaD: new Decimal(0), monedaId: '', totalFisicoNativo: null }] as [
            string,
            { totalSistemaD: Decimal; monedaId: string; totalFisicoNativo: Decimal | null },
          ]
      ),
    ]

    if (metodosParaConsolidar.length > 0) {
      // 8. Batch SELECT de la configuracion de Tesoreria de los metodos usados
      const idsConsolidar = metodosParaConsolidar.map(([metodoId]) => metodoId)
      const inPhConsolidar = idsConsolidar.map(() => '?').join(', ')

      const metodosConfigResult = await tx.execute(
        `SELECT mc.id AS metodo_cobro_id, mc.nombre, mc.tipo, mc.banco_empresa_id, mc.caja_fuerte_id,
                mc.moneda_id, mo.codigo_iso AS moneda_codigo, mc.consolidar_lotes, mc.deposito_directo
         FROM metodos_cobro mc
         JOIN monedas mo ON mc.moneda_id = mo.id
         WHERE mc.id IN (${inPhConsolidar}) AND mc.empresa_id = ?`,
        [...idsConsolidar, empresaId]
      )

      type MetodoConfigRow = {
        metodo_cobro_id: string
        nombre: string
        tipo: string
        banco_empresa_id: string | null
        caja_fuerte_id: string | null
        moneda_id: string
        moneda_codigo: string
        consolidar_lotes: number
        deposito_directo: number
      }
      const metodosConfigMap = new Map<string, MetodoConfigRow>()
      if (metodosConfigResult.rows) {
        for (let i = 0; i < metodosConfigResult.rows.length; i++) {
          const row = metodosConfigResult.rows.item(i) as MetodoConfigRow
          metodosConfigMap.set(row.metodo_cobro_id, row)
        }
      }

      // conciliacion-lotes-pos (PR-C): lotes POS cargados para esta sesion (cuadre-conteo-fisico.tsx,
      // PR-B), agrupados por metodo_cobro_id. Solo metodos tipo='PUNTO' con lotes cargados en el
      // cuadre tendran entradas aqui; el resto sigue el camino totalSistemaD sin cambios (SC-13).
      const lotesResult = await tx.execute(
        `SELECT metodo_cobro_id, nro_lote, monto
         FROM lotes_pos_cuadre
         WHERE empresa_id = ? AND sesion_caja_id = ?`,
        [empresaId, id]
      )
      type LoteRow = { metodo_cobro_id: string; nro_lote: string; monto: string }
      const lotesPorMetodoMap = new Map<string, LoteRow[]>()
      if (lotesResult.rows) {
        for (let i = 0; i < lotesResult.rows.length; i++) {
          const row = lotesResult.rows.item(i) as LoteRow
          if (!lotesPorMetodoMap.has(row.metodo_cobro_id)) {
            lotesPorMetodoMap.set(row.metodo_cobro_id, [])
          }
          lotesPorMetodoMap.get(row.metodo_cobro_id)!.push(row)
        }
      }

      // 9. Consolidar cada metodo con saldo positivo hacia Tesoreria
      for (const [
        metodoCobroId,
        // totalSistemaD ya no se usa dentro del loop: ambas ramas (lotes y sin-lotes)
        // consolidan por el monto reportado, nunca por el total sistema.
        { totalSistemaD: _totalSistemaD, monedaId: monedaIdBase, totalFisicoNativo },
      ] of metodosParaConsolidar) {
        const config = metodosConfigMap.get(metodoCobroId)
        if (!config) {
          throw new Error(
            `No se encontro la configuracion del metodo de cobro para consolidar el cierre de caja.`
          )
        }
        if (debeExcluirseDeConsolidacionCierre(config)) continue
        const nombreMetodo = config.nombre
        // conciliacion-lotes-pos (fix WARNING #2): metodos incorporados solo por tener
        // lotes traen monedaId placeholder (''); se resuelve desde la config real del
        // metodo (misma fuente que ya usa consolidacionPorMetodo para el resto: mc.moneda_id).
        const monedaId = monedaIdBase || config.moneda_id

        // Resolver destino: EFECTIVO -> caja fuerte propia del metodo; otro tipo -> banco.
        // El origen se DERIVA siempre del tipo de destino (nunca al reves) para que
        // BANCO siempre use CIERRE_CONSOLIDACION y CAJA_FUERTE siempre use DEPOSITO_CIERRE.
        let destino: DestinoConsolidacion
        let destinoMonedaId: string
        if (config.tipo === 'EFECTIVO') {
          if (!config.caja_fuerte_id) {
            throw new Error(
              `El metodo de cobro "${nombreMetodo}" (EFECTIVO) no tiene una caja fuerte de destino configurada. ` +
              `Configura la caja fuerte correspondiente en Configuracion > Metodos de Cobro antes de cerrar la sesion.`
            )
          }
          destino = { tipo: 'CAJA_FUERTE', id: config.caja_fuerte_id }
          const cfRes = await tx.execute(
            'SELECT moneda_id FROM caja_fuerte WHERE id = ? AND empresa_id = ?',
            [config.caja_fuerte_id, empresaId]
          )
          if (!cfRes.rows?.length) {
            throw new Error(`No se encontro la caja fuerte de destino del metodo "${nombreMetodo}".`)
          }
          destinoMonedaId = String((cfRes.rows.item(0) as { moneda_id: string }).moneda_id)
        } else {
          if (!config.banco_empresa_id) {
            throw new Error(
              `El metodo de cobro "${nombreMetodo}" no tiene un banco de destino configurado. ` +
              `Configura el banco correspondiente en Configuracion > Metodos de Cobro antes de cerrar la sesion.`
            )
          }
          destino = { tipo: 'BANCO', id: config.banco_empresa_id }
          const bcoRes = await tx.execute(
            'SELECT moneda_id FROM bancos_empresa WHERE id = ? AND empresa_id = ?',
            [config.banco_empresa_id, empresaId]
          )
          if (!bcoRes.rows?.length) {
            throw new Error(`No se encontro el banco de destino del metodo "${nombreMetodo}".`)
          }
          destinoMonedaId = String((bcoRes.rows.item(0) as { moneda_id: string }).moneda_id)
        }

        // W4: la moneda del destino debe coincidir con la moneda del metodo, si no,
        // se depositaria un monto en la moneda equivocada. Falla el cierre (rollback).
        if (destinoMonedaId !== config.moneda_id) {
          throw new Error(
            `El destino configurado para el metodo "${nombreMetodo}" tiene una moneda distinta ` +
            `a la del metodo. Revisa la configuracion de la caja fuerte/banco de destino.`
          )
        }

        const origenDestino = destino.tipo === 'CAJA_FUERTE' ? 'DEPOSITO_CIERRE' : 'CIERRE_CONSOLIDACION'

        // Deducciones del cierre (comision-consolidacion-cierre, PR-Pieza-1): N conceptos
        // por metodo (comision bancaria, retencion ISLR, otros) via `metodo_cobro_deducciones`
        // en vez del antiguo `comision_pct` unico. Factorizada para reutilizarse sobre el monto
        // correcto (totalSistemaD, suma de lotes, o lote individual) sin duplicar la logica W5
        // en cada rama (conciliacion-lotes-pos, PR-C).
        const aplicarComisionSiCorresponde = async (montoBaseD: Decimal): Promise<void> => {
          const deduccionesResult = await tx.execute(
            `SELECT id, cuenta_gasto_id, concepto, tipo, porcentaje, orden
             FROM metodo_cobro_deducciones
             WHERE metodo_cobro_id = ? AND empresa_id = ? AND is_active = 1
             ORDER BY orden`,
            [metodoCobroId, empresaId]
          )
          const deducciones: DeduccionActivaRow[] = []
          if (deduccionesResult.rows) {
            for (let i = 0; i < deduccionesResult.rows.length; i++) {
              deducciones.push(deduccionesResult.rows.item(i) as DeduccionActivaRow)
            }
          }

          const { toPost, warning } = resolverDeduccionesCierre({
            deducciones,
            montoBaseD,
            destinoTipo: destino.tipo,
            nombreMetodo,
          })

          // W5: un metodo EFECTIVO (o cualquier destino no-BANCO) con deducciones activas
          // configuradas es un error de config; no se cobra deduccion sobre efectivo, pero
          // se deja rastro para que sea detectable.
          if (warning) {
            console.warn(`[cierre] ${warning}`)
            return
          }

          if (toPost.length === 0) return

          const monedaCodigo: 'USD' | 'VES' = config.moneda_codigo === 'VES' ? 'VES' : 'USD'
          if (monedaCodigo === 'VES' && !((tasaDelDia ?? 0) > 0)) {
            throw new Error(
              `No se puede registrar las deducciones del cierre en Bs: falta la tasa del dia para el cierre.`
            )
          }

          for (const deduccion of toPost) {
            const gastoId = uuidv4()

            await insertarGastoDeduccionEnTx(tx, {
              empresaId,
              metodoCobroId,
              bancoEmpresaId: destino.id,
              montoDeduccionNativo: toStorageString(deduccion.montoDeduccionNativo),
              monedaCodigo,
              tasa: tasaDelDia ?? 0,
              cuentaGastoId: deduccion.cuentaGastoId,
              concepto: deduccion.concepto,
              porcentaje: deduccion.porcentaje,
              orden: deduccion.orden,
              sesionCajaId: id,
              gastoId,
              usuarioId: usuario_cierre_id,
            })
          }
        }

        // conciliacion-lotes-pos (PR-C): metodos tipo='PUNTO' con lotes cargados en el cuadre
        // enrutan el monto de la consolidacion segun los lotes, REEMPLAZANDO totalSistemaD —
        // nunca sumado encima (evita doble conteo, decision de mayor riesgo del design.md).
        // sesiones_caja_detalle.total_sistema (paso 6) sigue derivado de pagos sin cambios; la
        // brecha vs. el total de lotes se ve como diferencia normal, no como bloqueante.
        const lotesDelMetodo = lotesPorMetodoMap.get(metodoCobroId) ?? []

        if (lotesDelMetodo.length > 0) {
          const sumaLotesD = lotesDelMetodo.reduce(
            (acc, lote) => acc.plus(new Decimal(lote.monto)),
            new Decimal(0)
          )

          if (config.consolidar_lotes === 1) {
            const nrosLotes = lotesDelMetodo.map((lote) => lote.nro_lote).join(', ')
            await consolidarMetodoATesoreriaEnTx(tx, {
              sesionCajaId: id,
              metodoCobroId,
              destino,
              monto: toStorageString(sumaLotesD),
              monedaId,
              empresaId,
              userId: usuario_cierre_id,
              origenDestino,
              skipSaldoCheck: true,
              descripcion: `Consolidacion cierre de caja - sesion ${formatSesionId(id)} - Lotes: ${nrosLotes}`,
            })

            await aplicarComisionSiCorresponde(sumaLotesD)
          } else {
            for (const lote of lotesDelMetodo) {
              const montoLoteD = new Decimal(lote.monto)

              await consolidarMetodoATesoreriaEnTx(tx, {
                sesionCajaId: id,
                metodoCobroId,
                destino,
                monto: toStorageString(montoLoteD),
                monedaId,
                empresaId,
                userId: usuario_cierre_id,
                origenDestino,
                skipSaldoCheck: true,
                descripcion: `Consolidacion cierre de caja - sesion ${formatSesionId(id)} - Lote ${lote.nro_lote}`,
              })

              await aplicarComisionSiCorresponde(montoLoteD)
            }
          }
        } else {
          // Camino existente: metodo sin lotes cargados consolida por MONTO REPORTADO (no
          // totalSistemaD) tanto en el deposito a Tesoreria como en la base de comision —
          // MISMA fuente de verdad para que ambos numeros no puedan divergir (cierre-tesoreria-
          // monto-reportado-lote). Deja esta rama consistente con la rama de lotes, que ya
          // reutiliza sumaLotesD/montoLoteD para ambas llamadas.
          const montoReportadoD = resolverMontoConsolidacionLote({ totalFisicoNativo })

          await consolidarMetodoATesoreriaEnTx(tx, {
            sesionCajaId: id,
            metodoCobroId,
            destino,
            monto: toStorageString(montoReportadoD),
            monedaId,
            empresaId,
            userId: usuario_cierre_id,
            origenDestino,
            skipSaldoCheck: true,
            descripcion: `Consolidacion cierre de caja - sesion ${formatSesionId(id)}`,
          })

          await aplicarComisionSiCorresponde(montoReportadoD)
        }
      }
    }

    // 10. Actualizar la sesion a CERRADA con saldos por divisa. Se ejecuta como ULTIMO
    // write de la writeTransaction (Opcion 1): todos los INSERT en movimientos_metodo_cobro
    // de la consolidacion (pasos 8-9) ya ocurrieron con la sesion todavia ABIERTA, evitando
    // el rechazo del trigger fn_validate_sesion_abierta. Si el cierre completo se revierte,
    // la sesion queda ABIERTA.
    await tx.execute(
      `UPDATE sesiones_caja SET
         status = 'CERRADA',
         usuario_cierre_id = ?,
         fecha_cierre = ?,
         monto_sistema_usd = ?,
         monto_fisico_usd = ?,
         diferencia_usd = ?,
         monto_sistema_bs = ?,
         monto_fisico_bs = ?,
         diferencia_bs = ?,
         observaciones_cierre = ?,
         updated_at = ?
       WHERE id = ?`,
      [
        usuario_cierre_id,
        now,
        toStorageString(montoSistemaUsd),
        toStorageString(montoFisicoUsdD),
        toStorageString(diferenciaUsd),
        toStorageString(montoSistemaBs),
        toStorageString(montoFisicoBsD),
        toStorageString(diferenciaBs),
        observaciones_cierre ?? null,
        now,
        id,
      ]
    )
  })

}
