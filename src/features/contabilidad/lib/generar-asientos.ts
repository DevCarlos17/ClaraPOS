import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

// ─── Tipos ────────────────────────────────────────────────────

export type ModuloOrigen =
  | 'VENTA'
  | 'PAGO_CXC'
  | 'COMPRA'
  | 'PAGO_CXP'
  | 'GASTO'
  | 'NCR_VENTA'
  | 'NCR_COMPRA'
  | 'NDB'
  | 'MANUAL'
  | 'REVERSO'

export interface LineaAsiento {
  cuenta_contable_id: string
  banco_empresa_id?: string | null
  monto: number // positivo = DEBE, negativo = HABER
  detalle: string
}

export interface ParametrosAsiento {
  empresaId: string
  modulo: ModuloOrigen
  docOrigenId?: string | null
  docOrigenRef?: string | null
  lineas: LineaAsiento[]
  usuarioId: string
  parentId?: string | null
  fechaRegistro?: string
}

type WriteTx = {
  execute: (sql: string, params?: unknown[]) => Promise<{ rows?: { item: (i: number) => unknown; length: number } }>
}

// ─── Generador base ──────────────────────────────────────────

/**
 * Genera los asientos de partida doble dentro de una transaccion existente.
 * Las lineas DEBEN sumar cero (partida doble).
 * Retorna los IDs de los asientos creados.
 */
export async function generarAsientos(
  tx: WriteTx,
  params: ParametrosAsiento
): Promise<string[]> {
  const { empresaId, modulo, docOrigenId, docOrigenRef, lineas, usuarioId, parentId, fechaRegistro } = params

  // Validar partida doble
  const suma = lineas.reduce((acc, l) => acc + l.monto, 0)
  if (Math.abs(suma) > 0.01) {
    throw new Error(`Error de partida doble: los asientos no suman cero (suma = ${suma.toFixed(2)})`)
  }

  if (lineas.length === 0) return []

  // Obtener numero de asiento correlativo por empresa
  const countResult = await tx.execute(
    'SELECT COUNT(*) as cnt FROM libro_contable WHERE empresa_id = ?',
    [empresaId]
  )
  const count = Number((countResult.rows?.item(0) as { cnt: number })?.cnt ?? 0)

  const now = fechaRegistro ?? localNow()
  const ids: string[] = []

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]
    const id = uuidv4()
    // Cada linea tiene su propio nro_asiento correlativo
    const nroAsiento = `LC-${String(count + i + 1).padStart(6, '0')}`

    await tx.execute(
      `INSERT INTO libro_contable (
        id, empresa_id, nro_asiento, fecha_registro,
        modulo_origen, doc_origen_id, doc_origen_ref,
        cuenta_contable_id, banco_empresa_id,
        monto, detalle, estado, parent_id,
        usuario_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?)`,
      [
        id,
        empresaId,
        nroAsiento,
        now,
        modulo,
        docOrigenId ?? null,
        docOrigenRef ?? null,
        linea.cuenta_contable_id,
        linea.banco_empresa_id ?? null,
        linea.monto.toFixed(2),
        linea.detalle,
        parentId ?? null,
        usuarioId,
        now,
      ]
    )
    ids.push(id)
  }

  return ids
}

// ─── Generadores especializados ──────────────────────────────

/**
 * Asientos para una venta.
 * El mapa de cuentas viene de cuentas_config.
 *
 * @param cuentas - mapa clave->cuenta_contable_id
 * @param pagosContado - [{monto_usd, banco_empresa_id?}] pagos al contado
 * @param montoCredito - monto pendiente que va a CxC
 * @param montoProductos - subtotal de productos (tipo='P')
 * @param montoServicios - subtotal de servicios (tipo='S')
 * @param nroFactura - referencia legible
 */
export async function generarAsientosVenta(
  tx: WriteTx,
  params: {
    empresaId: string
    ventaId: string
    nroFactura: string
    pagosContado: Array<{ monto_usd: number; banco_empresa_id: string | null }>
    montoCredito: number
    montoProductos: number
    montoServicios: number
    cuentas: Record<string, string>
    usuarioId: string
  }
): Promise<string[]> {
  const {
    empresaId, ventaId, nroFactura,
    pagosContado, montoCredito,
    montoProductos, montoServicios,
    cuentas, usuarioId,
  } = params

  const lineas: LineaAsiento[] = []

  // DEBE: pagos al contado (positivo)
  for (const pago of pagosContado) {
    if (pago.monto_usd <= 0) continue
    const cuentaBanco = pago.banco_empresa_id
      ? (await getCuentaBanco(tx, pago.banco_empresa_id)) ?? cuentas['BANCO_DEFAULT']
      : cuentas['CAJA_EFECTIVO']

    if (!cuentaBanco) continue
    lineas.push({
      cuenta_contable_id: cuentaBanco,
      banco_empresa_id: pago.banco_empresa_id,
      monto: pago.monto_usd,
      detalle: `Cobro venta ${nroFactura}`,
    })
  }

  // DEBE: credito (CxC)
  if (montoCredito > 0 && cuentas['CXC_CLIENTES']) {
    lineas.push({
      cuenta_contable_id: cuentas['CXC_CLIENTES'],
      monto: montoCredito,
      detalle: `Credito venta ${nroFactura}`,
    })
  }

  // HABER: ingreso por productos (negativo)
  if (montoProductos > 0 && cuentas['INGRESO_VENTA_PRODUCTO']) {
    lineas.push({
      cuenta_contable_id: cuentas['INGRESO_VENTA_PRODUCTO'],
      monto: -montoProductos,
      detalle: `Ingreso productos ${nroFactura}`,
    })
  }

  // HABER: ingreso por servicios (negativo)
  if (montoServicios > 0 && cuentas['INGRESO_VENTA_SERVICIO']) {
    lineas.push({
      cuenta_contable_id: cuentas['INGRESO_VENTA_SERVICIO'],
      monto: -montoServicios,
      detalle: `Ingreso servicios ${nroFactura}`,
    })
  }

  if (lineas.length === 0) return []

  return generarAsientos(tx, {
    empresaId,
    modulo: 'VENTA',
    docOrigenId: ventaId,
    docOrigenRef: nroFactura,
    lineas,
    usuarioId,
  })
}

/**
 * Asientos para un gasto con soporte de pagos multiples.
 * Genera un DEBE por la cuenta de gasto y multiples HABER (uno por pago).
 */
export async function generarAsientosGasto(
  tx: WriteTx,
  params: {
    empresaId: string
    gastoId: string
    nroGasto: string
    cuentaGastoId: string
    monto_usd: number
    pagos: Array<{ monto_usd: number; banco_empresa_id: string | null }>
    cuentas: Record<string, string>
    usuarioId: string
  }
): Promise<string[]> {
  const { empresaId, gastoId, nroGasto, cuentaGastoId, monto_usd, pagos, cuentas, usuarioId } = params

  if (monto_usd <= 0) return []

  const lineas: LineaAsiento[] = [
    {
      cuenta_contable_id: cuentaGastoId,
      monto: monto_usd,
      detalle: `Gasto ${nroGasto}`,
    },
  ]

  for (const pago of pagos) {
    if (pago.monto_usd <= 0) continue
    const cuentaBanco = pago.banco_empresa_id
      ? (await getCuentaBanco(tx, pago.banco_empresa_id)) ?? cuentas['BANCO_DEFAULT']
      : cuentas['CAJA_EFECTIVO']

    lineas.push({
      cuenta_contable_id: cuentaBanco ?? cuentaGastoId,
      banco_empresa_id: pago.banco_empresa_id,
      monto: -pago.monto_usd,
      detalle: `Pago gasto ${nroGasto}`,
    })
  }

  return generarAsientos(tx, {
    empresaId,
    modulo: 'GASTO',
    docOrigenId: gastoId,
    docOrigenRef: nroGasto,
    lineas,
    usuarioId,
  })
}

/**
 * Asientos para un pago de CxC (cliente paga deuda).
 */
export async function generarAsientosPagoCxC(
  tx: WriteTx,
  params: {
    empresaId: string
    pagoId: string
    pagoRef: string
    monto_usd: number
    banco_empresa_id: string | null
    cuentas: Record<string, string>
    usuarioId: string
  }
): Promise<string[]> {
  const { empresaId, pagoId, pagoRef, monto_usd, banco_empresa_id, cuentas, usuarioId } = params

  if (monto_usd <= 0) return []

  const cuentaBanco = banco_empresa_id
    ? (await getCuentaBanco(tx, banco_empresa_id)) ?? cuentas['BANCO_DEFAULT']
    : cuentas['CAJA_EFECTIVO']

  const cuentaCxC = cuentas['CXC_CLIENTES']
  if (!cuentaBanco || !cuentaCxC) return []

  const lineas: LineaAsiento[] = [
    {
      cuenta_contable_id: cuentaBanco,
      banco_empresa_id: banco_empresa_id,
      monto: monto_usd,
      detalle: `Cobro CxC ${pagoRef}`,
    },
    {
      cuenta_contable_id: cuentaCxC,
      monto: -monto_usd,
      detalle: `Abono CxC ${pagoRef}`,
    },
  ]

  return generarAsientos(tx, {
    empresaId,
    modulo: 'PAGO_CXC',
    docOrigenId: pagoId,
    docOrigenRef: pagoRef,
    lineas,
    usuarioId,
  })
}

/**
 * Asientos para una compra de inventario.
 */
export async function generarAsientosCompra(
  tx: WriteTx,
  params: {
    empresaId: string
    compraId: string
    nroFactura: string
    totalUsd: number
    esContado: boolean
    banco_empresa_id: string | null
    cuentas: Record<string, string>
    usuarioId: string
  }
): Promise<string[]> {
  const { empresaId, compraId, nroFactura, totalUsd, esContado, banco_empresa_id, cuentas, usuarioId } = params

  if (totalUsd <= 0) return []

  const cuentaInventario = cuentas['INVENTARIO']
  if (!cuentaInventario) return []

  const lineas: LineaAsiento[] = [
    {
      cuenta_contable_id: cuentaInventario,
      monto: totalUsd,
      detalle: `Compra mercancia ${nroFactura}`,
    },
  ]

  if (esContado) {
    const cuentaBanco = banco_empresa_id
      ? (await getCuentaBanco(tx, banco_empresa_id)) ?? cuentas['BANCO_DEFAULT']
      : cuentas['BANCO_DEFAULT']
    if (cuentaBanco) {
      lineas.push({
        cuenta_contable_id: cuentaBanco,
        banco_empresa_id: banco_empresa_id,
        monto: -totalUsd,
        detalle: `Pago compra ${nroFactura}`,
      })
    }
  } else {
    const cuentaCxP = cuentas['CXP_PROVEEDORES']
    if (cuentaCxP) {
      lineas.push({
        cuenta_contable_id: cuentaCxP,
        monto: -totalUsd,
        detalle: `Credito compra ${nroFactura}`,
      })
    }
  }

  return generarAsientos(tx, {
    empresaId,
    modulo: 'COMPRA',
    docOrigenId: compraId,
    docOrigenRef: nroFactura,
    lineas,
    usuarioId,
  })
}

/**
 * Asientos para nota de credito (anulacion de venta).
 * Invierte los asientos originales y marca los originales como ANULADO.
 */
export async function generarAsientosNCR(
  tx: WriteTx,
  params: {
    empresaId: string
    ncrId: string
    nroNcr: string
    ventaId: string
    totalUsd: number
    afectaCxC: boolean
    banco_empresa_id: string | null
    cuentas: Record<string, string>
    usuarioId: string
  }
): Promise<string[]> {
  const { empresaId, ncrId, nroNcr, ventaId, totalUsd, afectaCxC, banco_empresa_id, cuentas, usuarioId } = params

  if (totalUsd <= 0) return []

  // Marcar asientos originales de la venta como ANULADO
  await tx.execute(
    `UPDATE libro_contable SET estado = 'ANULADO'
     WHERE empresa_id = ? AND doc_origen_id = ? AND modulo_origen = 'VENTA' AND estado = 'PENDIENTE'`,
    [empresaId, ventaId]
  )

  // Crear contra-asientos
  const cuentaDevolucion = cuentas['DEVOLUCION_VENTAS'] ?? cuentas['INGRESO_VENTA_PRODUCTO']
  const cuentaContraparte = afectaCxC
    ? cuentas['CXC_CLIENTES']
    : banco_empresa_id
      ? (await getCuentaBanco(tx, banco_empresa_id)) ?? cuentas['BANCO_DEFAULT']
      : cuentas['CAJA_EFECTIVO']

  if (!cuentaDevolucion || !cuentaContraparte) return []

  const lineas: LineaAsiento[] = [
    {
      cuenta_contable_id: cuentaDevolucion,
      monto: totalUsd,
      detalle: `Devolucion venta ${nroNcr}`,
    },
    {
      cuenta_contable_id: cuentaContraparte,
      banco_empresa_id: afectaCxC ? null : banco_empresa_id,
      monto: -totalUsd,
      detalle: `Contraparte devolucion ${nroNcr}`,
    },
  ]

  return generarAsientos(tx, {
    empresaId,
    modulo: 'NCR_VENTA',
    docOrigenId: ncrId,
    docOrigenRef: nroNcr,
    lineas,
    usuarioId,
  })
}

/**
 * Reverso manual: crea contra-asientos con montos invertidos.
 * Marca el asiento original como ANULADO.
 */
export async function reversarAsientos(
  tx: WriteTx,
  params: {
    empresaId: string
    asientosIds: string[]
    usuarioId: string
  }
): Promise<string[]> {
  const { empresaId, asientosIds, usuarioId } = params

  if (asientosIds.length === 0) return []

  const placeholders = asientosIds.map(() => '?').join(',')
  const result = await tx.execute(
    `SELECT * FROM libro_contable WHERE id IN (${placeholders}) AND empresa_id = ?`,
    [...asientosIds, empresaId]
  )

  if (!result.rows || result.rows.length === 0) return []

  // Marcar originales como ANULADO
  await tx.execute(
    `UPDATE libro_contable SET estado = 'ANULADO' WHERE id IN (${placeholders}) AND empresa_id = ?`,
    [...asientosIds, empresaId]
  )

  const now = localNow()
  const nuevosIds: string[] = []
  const countResult = await tx.execute(
    'SELECT COUNT(*) as cnt FROM libro_contable WHERE empresa_id = ?',
    [empresaId]
  )
  let count = Number((countResult.rows?.item(0) as { cnt: number })?.cnt ?? 0)

  for (let i = 0; i < result.rows.length; i++) {
    const original = result.rows.item(i) as {
      id: string; cuenta_contable_id: string; banco_empresa_id: string | null
      monto: string; detalle: string; modulo_origen: string
      doc_origen_id: string | null; doc_origen_ref: string | null
    }

    const nuevoId = uuidv4()
    const nroAsiento = `LC-${String(count + 1).padStart(6, '0')}`
    count++

    await tx.execute(
      `INSERT INTO libro_contable (
        id, empresa_id, nro_asiento, fecha_registro,
        modulo_origen, doc_origen_id, doc_origen_ref,
        cuenta_contable_id, banco_empresa_id,
        monto, detalle, estado, parent_id,
        usuario_id, created_at
      ) VALUES (?, ?, ?, ?, 'REVERSO', ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?)`,
      [
        nuevoId,
        empresaId,
        nroAsiento,
        now,
        original.doc_origen_id,
        original.doc_origen_ref ? `REV-${original.doc_origen_ref}` : null,
        original.cuenta_contable_id,
        original.banco_empresa_id,
        (-Number(original.monto)).toFixed(2),
        `REVERSO: ${original.detalle}`,
        original.id,
        usuarioId,
        now,
      ]
    )
    nuevosIds.push(nuevoId)
  }

  return nuevosIds
}

/**
 * Asientos para un pago de CxP (empresa paga deuda a proveedor).
 * DEBE: CxP Proveedores (reduce pasivo)
 * HABER: Banco/Caja (sale dinero)
 */
export async function generarAsientosPagoCxP(
  tx: WriteTx,
  params: {
    empresaId: string
    pagoId: string
    pagoRef: string
    monto_usd: number
    banco_empresa_id: string | null
    cuentas: Record<string, string>
    usuarioId: string
  }
): Promise<string[]> {
  const { empresaId, pagoId, pagoRef, monto_usd, banco_empresa_id, cuentas, usuarioId } = params

  if (monto_usd <= 0) return []

  const cuentaCxP = cuentas['CXP_PROVEEDORES']
  const cuentaBanco = banco_empresa_id
    ? (await getCuentaBanco(tx, banco_empresa_id)) ?? cuentas['BANCO_DEFAULT']
    : cuentas['BANCO_DEFAULT']

  if (!cuentaCxP || !cuentaBanco) return []

  const lineas: LineaAsiento[] = [
    {
      cuenta_contable_id: cuentaCxP,
      monto: monto_usd,
      detalle: `Pago CxP ${pagoRef}`,
    },
    {
      cuenta_contable_id: cuentaBanco,
      banco_empresa_id: banco_empresa_id,
      monto: -monto_usd,
      detalle: `Egreso pago CxP ${pagoRef}`,
    },
  ]

  return generarAsientos(tx, {
    empresaId,
    modulo: 'PAGO_CXP',
    docOrigenId: pagoId,
    docOrigenRef: pagoRef,
    lineas,
    usuarioId,
  })
}

// ─── Helper interno ──────────────────────────────────────────

async function getCuentaBanco(
  tx: WriteTx,
  bancoEmpresaId: string
): Promise<string | null> {
  const result = await tx.execute(
    'SELECT cuenta_contable_id FROM bancos_empresa WHERE id = ? LIMIT 1',
    [bancoEmpresaId]
  )
  const row = result.rows?.item(0) as { cuenta_contable_id: string | null } | undefined
  return row?.cuenta_contable_id ?? null
}
