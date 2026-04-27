import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import { cargarMapaCuentas } from '@/features/contabilidad/hooks/use-cuentas-config'
import { generarAsientosGasto, reversarAsientos, leerMonedaContable } from '@/features/contabilidad/lib/generar-asientos'

// ─── Interfaces ─────────────────────────────────────────────

export interface Gasto {
  id: string
  empresa_id: string
  nro_gasto: string
  nro_factura: string | null
  nro_control: string | null
  cuenta_id: string
  proveedor_id: string | null
  descripcion: string
  fecha: string
  moneda_id: string
  moneda_factura: string          // 'USD' | 'BS'
  usa_tasa_paralela: number       // 0 | 1
  tasa: string                    // tasa interna
  tasa_proveedor: string | null   // tasa del proveedor (paralela)
  monto_factura: string           // importe original en moneda_factura
  monto_usd: string               // total contable USD
  monto_bs: string
  saldo_pendiente_usd: string
  metodo_cobro_id: string | null
  banco_empresa_id: string | null
  referencia: string | null
  observaciones: string | null
  status: string
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface GastoPago {
  metodo_cobro_id: string
  banco_empresa_id?: string
  moneda: 'USD' | 'BS'
  monto_moneda: number       // monto en moneda original
  tasa_pago: number          // tasa usada (proveedor para BS paralela, interna para BS sin paralela)
  monto_usd: number          // USD a tasa proveedor (para saldo_pendiente)
  monto_usd_interno: number  // USD a tasa interna (para contabilidad)
  referencia?: string
}

// ─── Helpers ────────────────────────────────────────────────

function buildDateRange(
  fechaDesde: string,
  fechaHasta: string
): { start: string; end: string } {
  return {
    start: `${fechaDesde}T00:00:00.000Z`,
    end: `${fechaHasta}T23:59:59.999Z`,
  }
}

// ─── Hooks ──────────────────────────────────────────────────

/**
 * Lista de gastos con nombre de cuenta y proveedor via JOIN.
 * Filtra por rango de fechas cuando ambos parametros estan presentes.
 * Ordenados por fecha descendente.
 */
export function useGastos(fechaDesde?: string, fechaHasta?: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const hasDateFilter = Boolean(fechaDesde && fechaHasta)

  const params = hasDateFilter
    ? (() => {
        const { start, end } = buildDateRange(fechaDesde!, fechaHasta!)
        return [empresaId, start, end]
      })()
    : [empresaId]

  const { data, isLoading } = useQuery(
    hasDateFilter
      ? `SELECT g.*,
           pc.nombre as cuenta_nombre,
           p.razon_social as proveedor_nombre,
           u.nombre as created_by_nombre
         FROM gastos g
         LEFT JOIN plan_cuentas pc ON g.cuenta_id = pc.id
         LEFT JOIN proveedores p ON g.proveedor_id = p.id
         LEFT JOIN usuarios u ON g.created_by = u.id
         WHERE g.empresa_id = ?
           AND g.fecha >= ?
           AND g.fecha <= ?
         ORDER BY g.fecha DESC`
      : '',
    hasDateFilter ? params : []
  )

  return {
    gastos: (data ?? []) as (Gasto & {
      cuenta_nombre: string
      proveedor_nombre: string | null
      created_by_nombre: string | null
    })[],
    isLoading: hasDateFilter && isLoading,
  }
}

// ─── Funciones de escritura ──────────────────────────────────

/**
 * Crea un nuevo gasto con soporte de multiples pagos.
 * Genera nro_gasto con formato GTO-XXXX (secuencial por empresa).
 * Inserta filas en gasto_pagos para cada pago.
 * El gasto queda en status REGISTRADO (no se puede editar, solo anular).
 */
export async function crearGasto(data: {
  cuenta_id: string
  proveedor_id?: string
  nro_factura?: string
  nro_control?: string
  descripcion: string
  fecha: string
  moneda_id: string
  moneda_factura: 'USD' | 'BS'
  usa_tasa_paralela: boolean
  tasa: number              // tasa interna
  tasa_proveedor?: number   // tasa del proveedor (solo cuando usa_tasa_paralela)
  monto_factura: number     // importe original en moneda_factura
  monto_usd: number         // total contable USD (calculado)
  pagos: GastoPago[]
  observaciones?: string
  empresa_id: string
  created_by?: string
}): Promise<{ gastoId: string; nroGasto: string }> {
  let gastoId = ''
  let nroGasto = ''

  await db.writeTransaction(async (tx) => {
    const now = localNow()
    gastoId = uuidv4()

    // Resolver moneda_id: el formulario pasa el codigo ISO (ej: 'USD'), necesitamos el UUID
    const monedaResult = await tx.execute(
      'SELECT id FROM monedas WHERE codigo_iso = ? LIMIT 1',
      [data.moneda_id]
    )
    const monedaId = (monedaResult.rows?.item(0) as { id: string } | undefined)?.id
    if (!monedaId) throw new Error(`Moneda no encontrada: ${data.moneda_id}`)

    // Calcular monto en Bs a partir del total contable USD y la tasa interna
    const montoBs = Number((data.monto_usd * data.tasa).toFixed(2))

    // Monto desde la perspectiva del proveedor en USD:
    // - Factura USD: el valor nominal de la factura
    // - Factura BS: BS / tasa_proveedor (o tasa_interna si no usa paralela)
    const montoProveedorUsd = (() => {
      if (data.moneda_factura === 'USD') return data.monto_factura
      const tasaRef = data.usa_tasa_paralela && data.tasa_proveedor
        ? data.tasa_proveedor
        : data.tasa
      return tasaRef > 0 ? Number((data.monto_factura / tasaRef).toFixed(2)) : data.monto_usd
    })()

    // Saldo pendiente = perspectiva proveedor - sum de abonos al tipo proveedor
    const totalAbonadoProveedorUsd = data.pagos.reduce((s, p) => s + p.monto_usd, 0)
    const saldoPendiente = Number(Math.max(0, montoProveedorUsd - totalAbonadoProveedorUsd).toFixed(2))

    // Generar nro_gasto secuencial por empresa (formato GTO-XXXX)
    const countResult = await tx.execute(
      'SELECT COUNT(*) as cnt FROM gastos WHERE empresa_id = ?',
      [data.empresa_id]
    )
    const count = Number((countResult.rows?.item(0) as { cnt: number })?.cnt ?? 0)
    nroGasto = `GTO-${String(count + 1).padStart(4, '0')}`

    // nro_factura: usar el proporcionado o generar uno automático
    const nroFactura = data.nro_factura?.trim()
      || `AUTO-${data.fecha.replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`

    // Primer pago para campos legacy de backward compat
    const primerPago = data.pagos[0]

    await tx.execute(
      `INSERT INTO gastos (
         id, empresa_id, nro_gasto, nro_factura, nro_control, cuenta_id, proveedor_id, descripcion,
         fecha, moneda_id, moneda_factura, usa_tasa_paralela, tasa, tasa_proveedor,
         monto_factura, monto_usd, monto_bs, saldo_pendiente_usd,
         metodo_cobro_id, banco_empresa_id, referencia, observaciones,
         status, created_at, updated_at, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTRADO', ?, ?, ?)`,
      [
        gastoId,
        data.empresa_id,
        nroGasto,
        nroFactura,
        data.nro_control?.trim() ?? null,
        data.cuenta_id,
        data.proveedor_id ?? null,
        data.descripcion,
        data.fecha,
        monedaId,
        data.moneda_factura,
        data.usa_tasa_paralela ? 1 : 0,
        data.tasa.toFixed(4),
        data.tasa_proveedor ? data.tasa_proveedor.toFixed(4) : null,
        data.monto_factura.toFixed(2),
        data.monto_usd.toFixed(2),
        montoBs.toFixed(2),
        saldoPendiente.toFixed(2),
        primerPago?.metodo_cobro_id ?? null,
        primerPago?.banco_empresa_id ?? null,
        primerPago?.referencia ?? null,
        data.observaciones ?? null,
        now,
        now,
        data.created_by ?? null,
      ]
    )

    // Insertar filas en gasto_pagos para cada pago (backward compat)
    for (const pago of data.pagos) {
      const pagoId = uuidv4()
      await tx.execute(
        `INSERT INTO gasto_pagos (
           id, empresa_id, gasto_id, metodo_cobro_id, banco_empresa_id,
           monto_usd, referencia, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pagoId,
          data.empresa_id,
          gastoId,
          pago.metodo_cobro_id,
          pago.banco_empresa_id ?? null,
          pago.monto_usd.toFixed(2),
          pago.referencia ?? null,
          now,
        ]
      )
    }

    // Crear movimientos_cuenta_proveedor para pagos iniciales cuando hay proveedor
    if (data.proveedor_id && data.pagos.length > 0) {
      try {
        // Saldo del proveedor DESPUES de insertar el gasto (ya incluye saldo_pendiente reducido)
        const sumResult = await tx.execute(
          `SELECT
             COALESCE((SELECT SUM(CAST(saldo_pend_usd AS REAL)) FROM facturas_compra WHERE proveedor_id = ? AND empresa_id = ?), 0)
             + COALESCE((SELECT SUM(CAST(saldo_pendiente_usd AS REAL)) FROM gastos WHERE proveedor_id = ? AND empresa_id = ? AND status = 'REGISTRADO'), 0)
             as saldo`,
          [data.proveedor_id, data.empresa_id, data.proveedor_id, data.empresa_id]
        )
        const saldoPostGasto = parseFloat((sumResult.rows?.item(0) as { saldo: string }).saldo) || 0
        // Reconstruir el saldo ANTES de los abonos: saldoPostGasto ya tiene saldo_pendiente reducido
        // saldoAntes = saldoPostGasto + totalAbonado (restauramos los pagos para el audit trail)
        let saldoRunning = Number((saldoPostGasto + totalAbonadoProveedorUsd).toFixed(2))

        for (const pago of data.pagos) {
          const saldoAntes = saldoRunning
          const nuevoSaldo = Math.max(0, Number((saldoRunning - pago.monto_usd).toFixed(2)))
          saldoRunning = nuevoSaldo

          await tx.execute(
            `INSERT INTO movimientos_cuenta_proveedor
               (id, empresa_id, proveedor_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
                observacion, factura_compra_id, doc_origen_id, doc_origen_tipo,
                moneda_pago, monto_moneda, tasa_pago, monto_usd_interno,
                fecha, created_at, created_by)
             VALUES (?, ?, ?, 'PAG', ?, ?, ?, ?, ?, NULL, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?)`,
            [
              uuidv4(), data.empresa_id, data.proveedor_id,
              `PAG-${nroGasto}`,
              pago.monto_usd.toFixed(2),
              saldoAntes.toFixed(2),
              nuevoSaldo.toFixed(2),
              `Pago inicial gasto ${nroGasto}`,
              gastoId,
              pago.moneda,
              pago.monto_moneda.toFixed(2),
              pago.tasa_pago.toFixed(4),
              pago.monto_usd_interno.toFixed(2),
              now, now, data.created_by ?? null,
            ]
          )
        }
      } catch {
        // No bloquear el gasto si falla la creacion de movimientos de proveedor
      }
    }

    // Crear movimientos bancarios para pagos con cuenta bancaria
    try {
      for (const pago of data.pagos) {
        if (pago.banco_empresa_id && pago.monto_usd > 0) {
          const movBancoId = uuidv4()
          await tx.execute(
            `INSERT INTO movimientos_bancarios
               (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
                doc_origen_id, doc_origen_tipo, referencia, validado, observacion, fecha, created_at, created_by)
             VALUES (?, ?, ?, 'EGRESO', 'GASTO', ?, 0, 0, ?, 'GASTO', ?, 0, ?, ?, ?, ?)`,
            [
              movBancoId, data.empresa_id, pago.banco_empresa_id,
              pago.monto_usd.toFixed(2),
              gastoId,
              pago.referencia ?? null,
              `Gasto ${nroGasto}`,
              now, now, data.created_by ?? null,
            ]
          )
        }
      }
    } catch {
      // No bloquear el gasto si falla el movimiento bancario
    }

    // Generar asientos contables
    try {
      const [cuentas, monedaContable] = await Promise.all([
        cargarMapaCuentas(tx, data.empresa_id),
        leerMonedaContable(tx, data.empresa_id),
      ])
      await generarAsientosGasto(tx, {
        empresaId: data.empresa_id,
        gastoId,
        nroGasto,
        cuentaGastoId: data.cuenta_id,
        monto_usd: data.monto_usd,
        pagos: data.pagos.map((p) => ({
          monto_usd: p.monto_usd,
          monto_usd_interno: p.monto_usd_interno,
          banco_empresa_id: p.banco_empresa_id ?? null,
        })),
        cuentas,
        usuarioId: data.created_by ?? '',
        monedaContable,
        tasa: data.tasa,
        saldoPendienteProveedorUsd: saldoPendiente,
      })
    } catch {
      // Si falla la contabilidad no bloqueamos el gasto
    }
  })

  return { gastoId, nroGasto }
}

/**
 * Anula un gasto cambiando su status a ANULADO.
 * El registro es inmutable: solo se puede anular, no editar ni eliminar.
 * Genera asientos de reverso en el libro contable.
 */
export async function anularGasto(id: string, usuarioId?: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const now = localNow()

    // Verificar que el gasto existe y no esta ya anulado
    const gastoResult = await tx.execute(
      'SELECT status, empresa_id FROM gastos WHERE id = ?',
      [id]
    )
    if (!gastoResult.rows || gastoResult.rows.length === 0) {
      throw new Error('Gasto no encontrado')
    }
    const gasto = gastoResult.rows.item(0) as { status: string; empresa_id: string }
    if (gasto.status === 'ANULADO') {
      throw new Error('Este gasto ya fue anulado')
    }

    await tx.execute(
      "UPDATE gastos SET status = 'ANULADO', updated_at = ? WHERE id = ?",
      [now, id]
    )

    // Reversar asientos contables del gasto (crea contra-asientos, no solo marca ANULADO)
    if (usuarioId) {
      try {
        const asientosResult = await tx.execute(
          `SELECT id FROM libro_contable WHERE empresa_id = ? AND doc_origen_id = ? AND modulo_origen = 'GASTO' AND estado = 'PENDIENTE'`,
          [gasto.empresa_id, id]
        )
        const asientosIds: string[] = []
        if (asientosResult.rows) {
          for (let i = 0; i < asientosResult.rows.length; i++) {
            asientosIds.push((asientosResult.rows.item(i) as { id: string }).id)
          }
        }
        if (asientosIds.length > 0) {
          await reversarAsientos(tx, {
            empresaId: gasto.empresa_id,
            asientosIds,
            usuarioId,
          })
        }
      } catch {
        // No bloquear la anulacion si falla la contabilidad
      }
    }
  })
}

// ─── CXP: Interfaces ─────────────────────────────────────────

export interface GastoPendiente {
  id: string
  nro_gasto: string
  nro_factura: string | null
  fecha: string
  monto_usd: string
  saldo_pendiente_usd: string
  descripcion: string
  cuenta_nombre: string | null
  tasa: string
  tasa_proveedor: string | null
  usa_tasa_paralela: number
}

export interface GastoAbonoItem {
  id: string
  tipo: string
  referencia: string
  monto: string
  saldo_anterior: string
  saldo_nuevo: string
  observacion: string | null
  fecha: string
  created_at: string
  moneda_pago: string | null
  monto_moneda: string | null
  tasa_pago: string | null
  monto_usd_interno: string | null
}

export interface PagoGastoParams {
  gasto_id: string
  proveedor_id: string
  metodo_cobro_id: string
  banco_empresa_id: string | null
  moneda: 'USD' | 'BS'
  tasa: number
  tasaInternaPago?: number
  monto: number
  fechaPago: string
  referencia?: string
  empresa_id: string
  usuario_id: string
}

export interface ReversarPagoGastoParams {
  abonoId: string
  gastoId: string
  proveedorId: string
  empresaId: string
  usuarioId: string
}

// ─── CXP: Hooks de lectura ────────────────────────────────────

export function useGastosPendientesProveedor(proveedorId: string | null) {
  const { data, isLoading } = useQuery(
    proveedorId
      ? `SELECT g.id, g.nro_gasto, g.nro_factura, g.fecha,
             g.monto_usd, g.saldo_pendiente_usd, g.descripcion,
             g.tasa, g.tasa_proveedor, g.usa_tasa_paralela,
             pc.nombre as cuenta_nombre
           FROM gastos g
           LEFT JOIN plan_cuentas pc ON g.cuenta_id = pc.id
           WHERE g.proveedor_id = ?
             AND g.status = 'REGISTRADO'
             AND CAST(g.saldo_pendiente_usd AS REAL) > 0.01
           ORDER BY g.fecha ASC`
      : '',
    proveedorId ? [proveedorId] : []
  )
  return { gastosPendientes: (data ?? []) as GastoPendiente[], isLoading }
}

export function useAbonosGasto(gastoId: string) {
  const { data, isLoading } = useQuery(
    gastoId
      ? `SELECT id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
             observacion, fecha, created_at,
             moneda_pago, monto_moneda, tasa_pago, monto_usd_interno
           FROM movimientos_cuenta_proveedor
           WHERE doc_origen_id = ? AND doc_origen_tipo = 'GASTO'
           ORDER BY created_at ASC`
      : '',
    gastoId ? [gastoId] : []
  )
  return { abonos: (data ?? []) as GastoAbonoItem[], isLoading }
}

// ─── CXP: Funciones de escritura ─────────────────────────────

/**
 * Registra un pago sobre un gasto desde el panel CXP.
 * Reduce saldo_pendiente_usd del gasto.
 * Crea movimiento_cuenta_proveedor tipo PAG con doc_origen_tipo = 'GASTO'.
 */
export async function registrarPagoGasto(params: PagoGastoParams): Promise<void> {
  const {
    gasto_id, proveedor_id, banco_empresa_id,
    moneda, tasa, tasaInternaPago, monto,
    fechaPago, referencia, empresa_id, usuario_id,
  } = params

  if (tasa <= 0) throw new Error('La tasa debe ser mayor a 0')
  if (monto <= 0) throw new Error('El monto debe ser mayor a 0')

  await db.writeTransaction(async (tx) => {
    const now = localNow()

    const gastoResult = await tx.execute(
      'SELECT nro_gasto, nro_factura, saldo_pendiente_usd, tasa FROM gastos WHERE id = ? AND empresa_id = ?',
      [gasto_id, empresa_id]
    )
    if (!gastoResult.rows?.length) throw new Error('Gasto no encontrado')
    const gasto = gastoResult.rows.item(0) as {
      nro_gasto: string; nro_factura: string | null; saldo_pendiente_usd: string; tasa: string
    }
    const saldoGasto = parseFloat(gasto.saldo_pendiente_usd)

    const montoUsd = moneda === 'BS' ? Number((monto / tasa).toFixed(2)) : monto

    let montoUsdInterno: number
    if (moneda === 'BS') {
      const tasaInt = tasaInternaPago ?? parseFloat(gasto.tasa) ?? tasa
      montoUsdInterno = tasaInt > 0 ? Number((monto / tasaInt).toFixed(2)) : montoUsd
    } else {
      montoUsdInterno = montoUsd
    }

    if (montoUsd > saldoGasto + 0.01) {
      throw new Error(
        `El pago ($${montoUsd.toFixed(2)}) excede el saldo pendiente ($${saldoGasto.toFixed(2)}) del gasto ${gasto.nro_gasto}`
      )
    }

    // Saldo combinado del proveedor (facturas + gastos) para el audit trail
    const sumResult = await tx.execute(
      `SELECT
         COALESCE((SELECT SUM(CAST(saldo_pend_usd AS REAL)) FROM facturas_compra WHERE proveedor_id = ? AND empresa_id = ?), 0)
         + COALESCE((SELECT SUM(CAST(saldo_pendiente_usd AS REAL)) FROM gastos WHERE proveedor_id = ? AND empresa_id = ? AND status = 'REGISTRADO'), 0)
         as saldo`,
      [proveedor_id, empresa_id, proveedor_id, empresa_id]
    )
    const saldoProv = parseFloat((sumResult.rows?.item(0) as { saldo: string }).saldo) || 0
    const nuevoSaldoProv = Math.max(0, Number((saldoProv - montoUsd).toFixed(2)))

    const nuevoSaldoGasto = Math.max(0, Number((saldoGasto - montoUsd).toFixed(2)))
    await tx.execute(
      'UPDATE gastos SET saldo_pendiente_usd = ?, updated_at = ? WHERE id = ?',
      [nuevoSaldoGasto.toFixed(2), now, gasto_id]
    )

    const movId = uuidv4()
    const ref = referencia || `PAG-${gasto.nro_gasto}`
    await tx.execute(
      `INSERT INTO movimientos_cuenta_proveedor
         (id, empresa_id, proveedor_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
          observacion, factura_compra_id, doc_origen_id, doc_origen_tipo,
          moneda_pago, monto_moneda, tasa_pago, monto_usd_interno,
          fecha, created_at, created_by)
       VALUES (?, ?, ?, 'PAG', ?, ?, ?, ?, ?, NULL, ?, 'GASTO', ?, ?, ?, ?, ?, ?, ?)`,
      [
        movId, empresa_id, proveedor_id,
        ref,
        montoUsd.toFixed(2),
        saldoProv.toFixed(2),
        nuevoSaldoProv.toFixed(2),
        `Pago gasto ${gasto.nro_gasto}${gasto.nro_factura ? ` - Fact. ${gasto.nro_factura}` : ''}`,
        gasto_id,
        moneda,
        monto.toFixed(2),
        tasa.toFixed(4),
        montoUsdInterno.toFixed(2),
        fechaPago,
        now, usuario_id,
      ]
    )

    try {
      if (banco_empresa_id && montoUsd > 0) {
        const movBancoId = uuidv4()
        await tx.execute(
          `INSERT INTO movimientos_bancarios
             (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
              doc_origen_id, doc_origen_tipo, referencia, validado, observacion, fecha, created_at, created_by)
           VALUES (?, ?, ?, 'EGRESO', 'PAGO_GASTO', ?, 0, 0, ?, 'GASTO', ?, 0, ?, ?, ?, ?)`,
          [
            movBancoId, empresa_id, banco_empresa_id,
            montoUsd.toFixed(2),
            gasto_id,
            referencia ?? null,
            `Pago gasto ${gasto.nro_gasto}`,
            fechaPago, now, usuario_id,
          ]
        )
      }
    } catch {
      // No bloquear el pago si falla el movimiento bancario
    }
  })
}

/**
 * Reversa un pago (PAG) de gasto desde CXP.
 * Restaura saldo_pendiente_usd y crea movimiento DEV en movimientos_cuenta_proveedor.
 */
export async function reversarPagoGasto(params: ReversarPagoGastoParams): Promise<void> {
  const { abonoId, gastoId, proveedorId, empresaId, usuarioId } = params

  await db.writeTransaction(async (tx) => {
    const now = localNow()

    const abonoResult = await tx.execute(
      `SELECT monto, tipo, referencia
       FROM movimientos_cuenta_proveedor
       WHERE id = ? AND empresa_id = ? AND doc_origen_tipo = 'GASTO'`,
      [abonoId, empresaId]
    )
    if (!abonoResult.rows?.length) throw new Error('Abono no encontrado')
    const abono = abonoResult.rows.item(0) as { monto: string; tipo: string; referencia: string }
    if (abono.tipo !== 'PAG') throw new Error('Solo se pueden reversar movimientos de tipo PAG')
    const montoAbono = parseFloat(abono.monto)

    const gastoResult = await tx.execute(
      'SELECT nro_gasto, saldo_pendiente_usd, monto_usd FROM gastos WHERE id = ? AND empresa_id = ?',
      [gastoId, empresaId]
    )
    if (!gastoResult.rows?.length) throw new Error('Gasto no encontrado')
    const gasto = gastoResult.rows.item(0) as { nro_gasto: string; saldo_pendiente_usd: string; monto_usd: string }
    const saldoGasto = parseFloat(gasto.saldo_pendiente_usd)
    const totalUsd = parseFloat(gasto.monto_usd)

    const sumResult = await tx.execute(
      `SELECT
         COALESCE((SELECT SUM(CAST(saldo_pend_usd AS REAL)) FROM facturas_compra WHERE proveedor_id = ? AND empresa_id = ?), 0)
         + COALESCE((SELECT SUM(CAST(saldo_pendiente_usd AS REAL)) FROM gastos WHERE proveedor_id = ? AND empresa_id = ? AND status = 'REGISTRADO'), 0)
         as saldo`,
      [proveedorId, empresaId, proveedorId, empresaId]
    )
    const saldoProvAnterior = parseFloat((sumResult.rows?.item(0) as { saldo: string }).saldo) || 0

    const nuevoSaldoGasto = Math.min(totalUsd, Number((saldoGasto + montoAbono).toFixed(2)))
    await tx.execute(
      'UPDATE gastos SET saldo_pendiente_usd = ?, updated_at = ? WHERE id = ?',
      [nuevoSaldoGasto.toFixed(2), now, gastoId]
    )

    const nuevoSaldoProv = Number((saldoProvAnterior + montoAbono).toFixed(2))
    await tx.execute(
      `INSERT INTO movimientos_cuenta_proveedor
         (id, empresa_id, proveedor_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
          observacion, factura_compra_id, doc_origen_id, doc_origen_tipo, fecha, created_at, created_by)
       VALUES (?, ?, ?, 'DEV', ?, ?, ?, ?, ?, NULL, ?, 'GASTO', ?, ?, ?)`,
      [
        uuidv4(), empresaId, proveedorId,
        `DEV-${abono.referencia}`,
        montoAbono.toFixed(2),
        saldoProvAnterior.toFixed(2),
        nuevoSaldoProv.toFixed(2),
        `Reversa de abono ${abono.referencia} - Gasto ${gasto.nro_gasto}`,
        gastoId,
        now, now, usuarioId,
      ]
    )
  })
}
