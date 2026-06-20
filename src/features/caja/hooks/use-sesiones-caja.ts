import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import Decimal from 'decimal.js'
import { bsToUsd, toStorageString } from '@/lib/currency'
import Decimal from 'decimal.js'
import { bsToUsd, toStorageString } from '@/lib/currency'

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
           AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO')
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

  const ingManualUsd = movsMap.get('INGRESO_MANUAL')?.usd ?? new Decimal(0)
  const ingManualBs  = movsMap.get('INGRESO_MANUAL')?.bs  ?? new Decimal(0)
  const egrManualUsd = movsMap.get('EGRESO_MANUAL')?.usd  ?? new Decimal(0)
  const egrManualBs  = movsMap.get('EGRESO_MANUAL')?.bs   ?? new Decimal(0)
  const avancesUsd   = movsMap.get('AVANCE')?.usd ?? new Decimal(0)
  const avancesBs    = movsMap.get('AVANCE')?.bs  ?? new Decimal(0)
  const prestamosUsd = movsMap.get('PRESTAMO')?.usd ?? new Decimal(0)
  const prestamosBs  = movsMap.get('PRESTAMO')?.bs  ?? new Decimal(0)

  const saldoUsdD = Decimal.max(
    new Decimal(0),
    aperturaUsd.plus(ventasUsd).plus(ingManualUsd).minus(egrManualUsd).minus(avancesUsd).minus(prestamosUsd)
  )

  const saldoBsD = Decimal.max(
    new Decimal(0),
    aperturaBs.plus(ventasBs).plus(ingManualBs).minus(egrManualBs).minus(avancesBs).minus(prestamosBs)
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
           AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO')
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

    const ingManualUsd = new Decimal(movs.get('INGRESO_MANUAL')?.usd ?? 0)
    const ingManualBs  = new Decimal(movs.get('INGRESO_MANUAL')?.bs  ?? 0)
    const egrManualUsd = new Decimal(movs.get('EGRESO_MANUAL')?.usd  ?? 0)
    const egrManualBs  = new Decimal(movs.get('EGRESO_MANUAL')?.bs   ?? 0)
    const avancesUsd   = new Decimal(movs.get('AVANCE')?.usd ?? 0)
    const avancesBs    = new Decimal(movs.get('AVANCE')?.bs  ?? 0)
    const prestamosUsd = new Decimal(movs.get('PRESTAMO')?.usd ?? 0)
    const prestamosBs  = new Decimal(movs.get('PRESTAMO')?.bs  ?? 0)
    const pagosUsd     = new Decimal(pagos.usd)
    const pagosBs      = new Decimal(pagos.bs)

    const saldoUsd = Decimal.max(
      new Decimal(0),
      aperturaUsd.plus(pagosUsd).plus(ingManualUsd).minus(egrManualUsd).minus(avancesUsd).minus(prestamosUsd)
    ).toNumber()

    const saldoBs = Decimal.max(
      new Decimal(0),
      aperturaBs.plus(pagosBs).plus(ingManualBs).minus(egrManualBs).minus(avancesBs).minus(prestamosBs)
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

    // 3a. Movimientos manuales en USD (INGRESO_MANUAL, EGRESO_MANUAL, AVANCE, PRESTAMO, VUELTO)
    const movsManualUsdResult = await tx.execute(
      `SELECT mmc.origen, COALESCE(SUM(CAST(mmc.monto AS REAL)), 0) as total
       FROM movimientos_metodo_cobro mmc
       JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
       JOIN monedas mo ON mc.moneda_id = mo.id
       WHERE mmc.sesion_caja_id = ?
         AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO', 'VUELTO')
         AND mo.codigo_iso = 'USD'
       GROUP BY mmc.origen`,
      [id]
    )

    let ingresosManualUsd = new Decimal(0)
    let egresosManualUsd  = new Decimal(0)
    if (movsManualUsdResult.rows) {
      for (let i = 0; i < movsManualUsdResult.rows.length; i++) {
        const row = movsManualUsdResult.rows.item(i) as { origen: string; total: number }
        if (row.origen === 'INGRESO_MANUAL') {
          ingresosManualUsd = ingresosManualUsd.plus(new Decimal(row.total))
        } else {
          // EGRESO_MANUAL, AVANCE, PRESTAMO y VUELTO son salidas de efectivo
          egresosManualUsd = egresosManualUsd.plus(new Decimal(row.total))
        }
      }
    }

    // 3b. Movimientos manuales en VES
    const movsManualBsResult = await tx.execute(
      `SELECT mmc.origen, COALESCE(SUM(CAST(mmc.monto AS REAL)), 0) as total
       FROM movimientos_metodo_cobro mmc
       JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
       JOIN monedas mo ON mc.moneda_id = mo.id
       WHERE mmc.sesion_caja_id = ?
         AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO', 'VUELTO')
         AND mo.codigo_iso = 'VES'
       GROUP BY mmc.origen`,
      [id]
    )

    let ingresosManualBs = new Decimal(0)
    let egresosManualBs  = new Decimal(0)
    if (movsManualBsResult.rows) {
      for (let i = 0; i < movsManualBsResult.rows.length; i++) {
        const row = movsManualBsResult.rows.item(i) as { origen: string; total: number }
        if (row.origen === 'INGRESO_MANUAL') {
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

    // 5. Actualizar la sesion a CERRADA con saldos por divisa
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

    // 6. Poblar sesiones_caja_detalle con desglose por metodo de cobro
    // Obtener todos los metodos usados en pagos de esta sesion
    const metodosUsadosResult = await tx.execute(
      `SELECT p.metodo_cobro_id, mc.moneda_id,
              COALESCE(SUM(CAST(p.monto_usd AS REAL)), 0) as total_pagos,
              COUNT(*) as num_transacciones
       FROM pagos p
       JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
       WHERE p.sesion_caja_id = ? AND COALESCE(p.is_reversed, 0) = 0
       GROUP BY p.metodo_cobro_id, mc.moneda_id`,
      [id]
    )

    // Movimientos manuales (incluyendo VUELTO) agrupados por metodo de cobro
    const movsManualPorMetodoResult = await tx.execute(
      `SELECT metodo_cobro_id,
              SUM(CASE WHEN tipo = 'INGRESO' THEN CAST(monto AS REAL) ELSE 0 END) as total_ingreso,
              SUM(CASE WHEN tipo = 'EGRESO' THEN CAST(monto AS REAL) ELSE 0 END) as total_egreso
       FROM movimientos_metodo_cobro
       WHERE sesion_caja_id = ?
         AND origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO', 'VUELTO')
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

    if (metodosUsadosResult.rows) {
      for (let i = 0; i < metodosUsadosResult.rows.length; i++) {
        const row = metodosUsadosResult.rows.item(i) as {
          metodo_cobro_id: string
          moneda_id: string
          total_pagos: number
          num_transacciones: number
        }

        const manual = movsManualPorMetodo.get(row.metodo_cobro_id) ?? { ingreso: 0, egreso: 0 }
        const totalSistemaD = new Decimal(row.total_pagos)
          .plus(new Decimal(manual.ingreso))
          .minus(new Decimal(manual.egreso))

        // Calcular total_fisico y diferencia si se recibio conteo del usuario
        let totalFisicoNativo: number | null = null
        let diferenciaValor: Decimal | null = null
        if (conteoFisicoPorMetodo && row.metodo_cobro_id in conteoFisicoPorMetodo) {
          totalFisicoNativo = conteoFisicoPorMetodo[row.metodo_cobro_id]
          const totalFisicoD = new Decimal(totalFisicoNativo)
          // Convertir a USD para calcular diferencia homogenea
          const fisicoUsd =
            row.moneda_id !== 'USD' && (tasaDelDia ?? 0) > 0
              ? bsToUsd(totalFisicoD, new Decimal(tasaDelDia!))
              : totalFisicoD
          diferenciaValor = fisicoUsd.minus(totalSistemaD)
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
            totalFisicoNativo !== null ? toStorageString(new Decimal(totalFisicoNativo)) : null,
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
  })

}
