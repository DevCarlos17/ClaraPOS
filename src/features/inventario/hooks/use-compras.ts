import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import { cargarMapaCuentas } from '@/features/contabilidad/hooks/use-cuentas-config'
import { generarAsientosCompra } from '@/features/contabilidad/lib/generar-asientos'

export interface Compra {
  id: string
  proveedor_id: string
  nro_factura: string
  nro_control: string | null
  tasa: string
  total_usd: string
  total_bs: string
  saldo_pend_usd: string
  tipo: string
  status: string
  usuario_id: string
  created_by: string | null
  fecha_factura: string
  created_at: string
}

export interface DetalleCompra {
  id: string
  factura_compra_id: string
  producto_id: string
  cantidad: string
  costo_unitario_usd: string
  created_at: string
}

export interface AbonoCompra {
  id: string
  tipo: string
  referencia: string
  monto: string
  fecha: string
  observacion: string | null
  created_at: string
  moneda_pago: string | null
  monto_moneda: string | null
  tasa_pago: string | null
  monto_usd_interno: string | null
}

export interface LineaCompra {
  producto_id: string
  cantidad: number
  costo_unitario_usd: number    // original invoice cost in USD (for CxP / total factura)
  costo_usd_sistema?: number    // BCV-adjusted cost for inventory (equals costo_unitario_usd when not parallel)
  lote_nro?: string
  lote_fecha_fab?: string
  lote_fecha_venc?: string
}

export interface PagoCompraParam {
  metodo_cobro_id: string
  moneda: 'USD' | 'BS'
  monto: number
  banco_empresa_id: string | null
  referencia?: string
}

export interface CrearCompraParams {
  proveedor_id: string
  tasa: number          // proveedor/invoice rate (for original amounts & CxP)
  tasa_costo?: number   // BCV/internal rate (only when tasa paralela; for inventory cost)
  fecha_factura: string
  nro_factura: string
  nro_control?: string
  moneda: 'USD' | 'BS'
  lineas: LineaCompra[]
  pagos: PagoCompraParam[]
  usuario_id: string
  empresa_id: string
}

export interface CrearCompraResult {
  compraId: string
  nroFactura: string
}

export type CompraConProveedor = Compra & { proveedor_nombre: string; creado_por_nombre: string | null }

export function useCompras() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT c.*, p.razon_social as proveedor_nombre, u.nombre as creado_por_nombre
     FROM facturas_compra c
     LEFT JOIN proveedores p ON c.proveedor_id = p.id
     LEFT JOIN usuarios u ON c.created_by = u.id
     WHERE c.empresa_id = ?
     ORDER BY c.fecha_factura DESC`,
    [empresaId]
  )
  return { compras: (data ?? []) as CompraConProveedor[], isLoading }
}

export function useComprasPorFecha(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const enabled = Boolean(fechaDesde && fechaHasta && empresaId)

  const { data, isLoading } = useQuery(
    enabled
      ? `SELECT c.*, p.razon_social as proveedor_nombre, u.nombre as creado_por_nombre
         FROM facturas_compra c
         LEFT JOIN proveedores p ON c.proveedor_id = p.id
         LEFT JOIN usuarios u ON c.created_by = u.id
         WHERE c.empresa_id = ?
           AND c.fecha_factura >= ?
           AND c.fecha_factura <= ?
         ORDER BY c.fecha_factura DESC`
      : '',
    enabled ? [empresaId, fechaDesde, fechaHasta] : []
  )
  return { compras: (data ?? []) as CompraConProveedor[], isLoading: enabled && isLoading }
}

export function useAbonosCompra(facturaCompraId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const enabled = Boolean(facturaCompraId && empresaId)

  const { data, isLoading } = useQuery(
    enabled
      ? `SELECT * FROM movimientos_cuenta_proveedor
         WHERE empresa_id = ? AND factura_compra_id = ?
         ORDER BY fecha ASC`
      : '',
    enabled ? [empresaId, facturaCompraId] : []
  )
  return {
    abonos: (data ?? []) as AbonoCompra[],
    isLoading: enabled && isLoading,
  }
}

export function useDetalleCompra(compraId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    compraId
      ? `SELECT dc.*, p.codigo as producto_codigo, p.nombre as producto_nombre
         FROM facturas_compra_det dc
         LEFT JOIN productos p ON dc.producto_id = p.id
         WHERE dc.factura_compra_id = ? AND dc.empresa_id = ?`
      : '',
    compraId ? [compraId, empresaId] : []
  )
  return {
    detalle: (data ?? []) as (DetalleCompra & { producto_codigo: string; producto_nombre: string })[],
    isLoading,
  }
}

export type DetalleConProducto = DetalleCompra & { producto_codigo: string; producto_nombre: string }

export async function fetchDetalleParaReporte(
  compraIds: string[],
  empresaId: string
): Promise<Map<string, DetalleConProducto[]>> {
  const result = new Map<string, DetalleConProducto[]>()
  if (compraIds.length === 0) return result

  for (const compraId of compraIds) {
    const { rows } = await db.execute(
      `SELECT dc.*, p.codigo as producto_codigo, p.nombre as producto_nombre
       FROM facturas_compra_det dc
       LEFT JOIN productos p ON dc.producto_id = p.id
       WHERE dc.factura_compra_id = ? AND dc.empresa_id = ?`,
      [compraId, empresaId]
    )
    const items: DetalleConProducto[] = []
    if (rows) {
      for (let i = 0; i < rows.length; i++) {
        items.push(rows.item(i) as DetalleConProducto)
      }
    }
    result.set(compraId, items)
  }
  return result
}

export async function crearCompra(params: CrearCompraParams): Promise<CrearCompraResult> {
  const {
    proveedor_id,
    tasa,
    tasa_costo,
    fecha_factura,
    nro_factura,
    nro_control,
    moneda,
    lineas,
    pagos,
    usuario_id,
    empresa_id,
  } = params

  if (lineas.length === 0) {
    throw new Error('Debe agregar al menos una linea a la compra')
  }

  if (tasa <= 0) {
    throw new Error('La tasa de cambio debe ser mayor a 0')
  }

  let compraId = ''

  await db.writeTransaction(async (tx) => {
    const now = localNow()
    compraId = uuidv4()

    // 0. Obtener deposito principal de la empresa
    const depResult = await tx.execute(
      'SELECT id FROM depositos WHERE empresa_id = ? AND es_principal = 1 AND is_active = 1 LIMIT 1',
      [empresa_id]
    )
    let depositoId: string
    if (depResult.rows && depResult.rows.length > 0) {
      depositoId = (depResult.rows.item(0) as { id: string }).id
    } else {
      const depFallback = await tx.execute(
        'SELECT id FROM depositos WHERE empresa_id = ? AND is_active = 1 LIMIT 1',
        [empresa_id]
      )
      if (!depFallback.rows || depFallback.rows.length === 0) {
        throw new Error('No hay depositos configurados. Cree un deposito primero.')
      }
      depositoId = (depFallback.rows.item(0) as { id: string }).id
    }

    // 0b. Obtener UUID de moneda
    const monedaCode = moneda === 'BS' ? 'VES' : 'USD'
    const monedaResult = await tx.execute(
      'SELECT id FROM monedas WHERE codigo_iso = ? LIMIT 1',
      [monedaCode]
    )
    if (!monedaResult.rows?.length) {
      throw new Error(`No se encontro la moneda ${monedaCode} en el catalogo`)
    }
    const monedaId = (monedaResult.rows.item(0) as { id: string }).id

    // 1. Calcular totales (lineas ya vienen en USD)
    let totalUsd = 0
    for (const linea of lineas) {
      totalUsd += linea.cantidad * linea.costo_unitario_usd
    }
    totalUsd = Number(totalUsd.toFixed(2))
    const totalBs = Number((totalUsd * tasa).toFixed(2))

    // 2. Calcular pagos inmediatos y saldo pendiente
    let totalAbonadoUsd = 0
    for (const pago of pagos) {
      const montoUsd = pago.moneda === 'BS' ? Number((pago.monto / tasa).toFixed(2)) : pago.monto
      totalAbonadoUsd += montoUsd
    }
    totalAbonadoUsd = Number(totalAbonadoUsd.toFixed(2))
    const pendienteUsd = Math.max(0, Number((totalUsd - totalAbonadoUsd).toFixed(2)))
    const tipo: 'CONTADO' | 'CREDITO' = pendienteUsd <= 0.01 ? 'CONTADO' : 'CREDITO'
    const saldoPendUsd = pendienteUsd

    // 3. INSERT facturas_compra (cabecera)
    // tasa       = proveedor/invoice rate (for CxP, original amounts)
    // tasa_costo = BCV rate (for inventory cost, NULL when same as tasa)
    await tx.execute(
      `INSERT INTO facturas_compra (id, proveedor_id, nro_factura, nro_control, deposito_id, moneda_id, tasa, tasa_costo, total_exento_usd, total_base_usd, total_iva_usd, total_igtf_usd, total_usd, total_bs, saldo_pend_usd, tipo, status, fecha_factura, fecha_recepcion, usuario_id, empresa_id, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        compraId,
        proveedor_id,
        nro_factura,
        nro_control ?? null,
        depositoId,
        monedaId,
        tasa.toFixed(4),
        tasa_costo ? tasa_costo.toFixed(4) : null,
        '0.00',
        totalUsd.toFixed(2),
        '0.00',
        '0.00',
        totalUsd.toFixed(2),
        totalBs.toFixed(2),
        saldoPendUsd.toFixed(2),
        tipo,
        'PROCESADA',
        fecha_factura,
        now,
        usuario_id,
        empresa_id,
        now,
        now,
        usuario_id,
      ]
    )

    // 4. Por cada linea: detalle + kardex + actualizar producto
    for (const linea of lineas) {
      const detalleId = uuidv4()
      const subtotalUsd = Number((linea.cantidad * linea.costo_unitario_usd).toFixed(2))
      const subtotalBs = Number((subtotalUsd * tasa).toFixed(2))
      // costoSistema: BCV-adjusted cost for inventory valuation.
      // Equals costo_unitario_usd when not using tasa paralela.
      const costoSistema = linea.costo_usd_sistema ?? linea.costo_unitario_usd

      // 4a. Crear lote si aplica
      let loteId: string | null = null
      if (linea.lote_nro && linea.lote_nro.trim()) {
        loteId = uuidv4()
        await tx.execute(
          `INSERT INTO lotes (id, empresa_id, producto_id, deposito_id, nro_lote, fecha_fabricacion, fecha_vencimiento, cantidad_inicial, cantidad_actual, costo_unitario, factura_compra_id, status, created_at, updated_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', ?, ?, ?)`,
          [
            loteId,
            empresa_id,
            linea.producto_id,
            depositoId,
            linea.lote_nro.trim().toUpperCase(),
            linea.lote_fecha_fab ?? null,
            linea.lote_fecha_venc ?? null,
            linea.cantidad.toFixed(3),
            linea.cantidad.toFixed(3),
            costoSistema.toFixed(2),
            compraId,
            now,
            now,
            usuario_id,
          ]
        )
      }

      // 4b. INSERT facturas_compra_det
      await tx.execute(
        `INSERT INTO facturas_compra_det (id, factura_compra_id, producto_id, deposito_id, cantidad, costo_unitario_usd, costo_usd_sistema, tipo_impuesto, impuesto_pct, subtotal_usd, subtotal_bs, lote_id, empresa_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          detalleId,
          compraId,
          linea.producto_id,
          depositoId,
          linea.cantidad.toFixed(3),
          linea.costo_unitario_usd.toFixed(4),
          costoSistema.toFixed(4),
          'Exento',
          '0.00',
          subtotalUsd.toFixed(2),
          subtotalBs.toFixed(2),
          loteId,
          empresa_id,
          now,
        ]
      )

      // 4c. Leer stock actual del producto
      const prodResult = await tx.execute(
        'SELECT stock FROM productos WHERE id = ?',
        [linea.producto_id]
      )
      if (!prodResult.rows || prodResult.rows.length === 0) {
        throw new Error('Producto no encontrado')
      }
      const stockActual = parseFloat((prodResult.rows.item(0) as { stock: string }).stock)

      // 4d. Calcular nuevo stock
      const stockNuevo = stockActual + linea.cantidad

      // 4e. INSERT movimiento de inventario (entrada por compra) — usa costo sistema (BCV)
      const movId = uuidv4()
      await tx.execute(
        `INSERT INTO movimientos_inventario (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, costo_unitario, lote_id, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, empresa_id, created_at)
         VALUES (?, ?, ?, 'E', 'COM', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movId,
          linea.producto_id,
          depositoId,
          linea.cantidad.toFixed(3),
          stockActual.toFixed(3),
          stockNuevo.toFixed(3),
          costoSistema.toFixed(4),
          loteId,
          compraId,
          `COM-${nro_factura}`,
          `Compra ${nro_factura}`,
          usuario_id,
          now,
          empresa_id,
          now,
        ]
      )

      // 4f. UPDATE producto: stock y costo_usd — usa costo sistema (BCV)
      await tx.execute(
        'UPDATE productos SET stock = ?, costo_usd = ?, updated_at = ? WHERE id = ?',
        [
          stockNuevo.toFixed(3),
          costoSistema.toFixed(4),
          now,
          linea.producto_id,
        ]
      )
    }

    // 5. Registrar movimientos de cuenta del proveedor

    // 5a. Calcular saldo proveedor desde facturas_compra (la nueva factura ya esta insertada)
    // NOTA: NO hacer UPDATE proveedores.saldo_actual — trigger en Supabase lo bloquea (P0001).
    // El saldo se actualiza en Supabase via trigger al insertar movimientos_cuenta_proveedor.
    const sumResult = await tx.execute(
      `SELECT COALESCE(SUM(CAST(saldo_pend_usd AS REAL)), 0.0) as saldo
       FROM facturas_compra WHERE proveedor_id = ? AND empresa_id = ?`,
      [proveedor_id, empresa_id]
    )
    const sumAfterInsert = parseFloat((sumResult.rows?.item(0) as { saldo: string }).saldo) || 0
    // saldo antes de esta factura = sum actual - pendienteUsd (contribucion de la nueva factura)
    let saldoProv = Math.max(0, Number((sumAfterInsert - pendienteUsd).toFixed(2)))

    // 5b. Si hay deuda pendiente: crear entrada FAC
    if (pendienteUsd > 0.01) {
      const nuevoSaldo = Number((saldoProv + pendienteUsd).toFixed(2))
      const movFacId = uuidv4()
      await tx.execute(
        `INSERT INTO movimientos_cuenta_proveedor
           (id, empresa_id, proveedor_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
            observacion, factura_compra_id, doc_origen_id, doc_origen_tipo, fecha, created_at, created_by)
         VALUES (?, ?, ?, 'FAC', ?, ?, ?, ?, ?, ?, ?, 'FACTURA_COMPRA', ?, ?, ?)`,
        [
          movFacId, empresa_id, proveedor_id,
          `FAC-${nro_factura}`,
          pendienteUsd.toFixed(2),
          saldoProv.toFixed(2),
          nuevoSaldo.toFixed(2),
          `Factura compra ${nro_factura}`,
          compraId, compraId,
          now, now, usuario_id,
        ]
      )
      saldoProv = nuevoSaldo
    }

    // 5c. Por cada pago inmediato: crear entrada PAG
    // tasa_interna: para pagos iniciales usar tasa_costo si existe, sino tasa del proveedor
    const tasaInterna = tasa_costo ?? tasa

    for (const pago of pagos) {
      const montoUsd = pago.moneda === 'BS' ? Number((pago.monto / tasa).toFixed(2)) : pago.monto
      if (montoUsd <= 0) continue
      // monto a tasa interna (para contabilidad)
      const montoUsdInterno = pago.moneda === 'BS'
        ? Number((pago.monto / tasaInterna).toFixed(2))
        : pago.monto
      const nuevoSaldo = Math.max(0, Number((saldoProv - montoUsd).toFixed(2)))
      const movPagId = uuidv4()
      await tx.execute(
        `INSERT INTO movimientos_cuenta_proveedor
           (id, empresa_id, proveedor_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
            observacion, factura_compra_id, doc_origen_id, doc_origen_tipo,
            moneda_pago, monto_moneda, tasa_pago, monto_usd_interno,
            fecha, created_at, created_by)
         VALUES (?, ?, ?, 'PAG', ?, ?, ?, ?, ?, ?, ?, 'PAGO', ?, ?, ?, ?, ?, ?, ?)`,
        [
          movPagId, empresa_id, proveedor_id,
          pago.referencia ? pago.referencia : `PAG-${nro_factura}`,
          montoUsd.toFixed(2),
          saldoProv.toFixed(2),
          nuevoSaldo.toFixed(2),
          `Pago inicial compra ${nro_factura}`,
          compraId, compraId,
          pago.moneda,
          pago.monto.toFixed(2),
          tasa.toFixed(4),
          montoUsdInterno.toFixed(2),
          now, now, usuario_id,
        ]
      )
      saldoProv = nuevoSaldo

      // Movimiento bancario si tiene banco asociado
      if (pago.banco_empresa_id) {
        const movBancoId = uuidv4()
        await tx.execute(
          `INSERT INTO movimientos_bancarios
             (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
              doc_origen_id, doc_origen_tipo, referencia, validado, observacion, fecha, created_at, created_by)
           VALUES (?, ?, ?, 'EGRESO', 'PAGO_PROVEEDOR', ?, 0, 0, ?, 'PAGO_CXP', ?, 0, ?, ?, ?, ?)`,
          [
            movBancoId, empresa_id, pago.banco_empresa_id,
            montoUsd.toFixed(2),
            compraId,
            pago.referencia ?? null,
            `Pago compra ${nro_factura}`,
            now, now, usuario_id,
          ]
        )
      }
    }

    // 6. Generar asientos contables (siempre en Bs)
    try {
      const cuentas = await cargarMapaCuentas(tx, empresa_id)
      const pagosContabilidad = pagos.map((p) => ({
        monto_usd: p.moneda === 'BS' ? Number((p.monto / tasa).toFixed(2)) : p.monto,
        banco_empresa_id: p.banco_empresa_id,
      }))
      await generarAsientosCompra(tx, {
        empresaId: empresa_id,
        compraId,
        nroFactura: nro_factura,
        totalUsd,
        esContado: tipo === 'CONTADO',
        banco_empresa_id: null,
        pagos: pagosContabilidad,
        cuentas,
        usuarioId: usuario_id,
        monedaContable: 'BS',
        tasa,
      })
    } catch {
      // Fallo en contabilidad no bloquea la compra
    }
  })

  return { compraId, nroFactura: nro_factura }
}
