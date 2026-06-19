import { useQuery } from '@powersync/react'
import Decimal from 'decimal.js'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import { toStorageString } from '@/lib/currency'
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
  tipo_impuesto?: 'Gravable' | 'Exento' | 'Exonerado'
  impuesto_pct?: number         // IVA percentage (e.g. 16 for 16%)
  lote_nro?: string
  lote_fecha_fab?: string
  lote_fecha_venc?: string
  /**
   * Si false (o undefined), el costo no cambio respecto al sistema: solo se actualiza stock,
   * no se toca costo_usd ni precios en productos.
   */
  costo_cambio?: boolean
  /**
   * Si true, el usuario decidio mantener el pvp actual: NO actualizar precio_venta_usd.
   * Ignorado cuando costo_cambio = false.
   */
  no_actualizar_pvp?: boolean
  /**
   * PVP en USD definido por el usuario en el formulario.
   * Si se provee, se usa directamente en lugar del auto-calculo por margen.
   * Ignorado cuando no_actualizar_pvp = true o costo_cambio = false.
   */
  nuevo_precio_venta_usd?: number
  /**
   * Precio mayor en USD definido por el usuario. Si se provee, se usa directamente.
   * Si no se provee, se auto-calcula manteniendo el margen actual del precio mayor.
   */
  nuevo_precio_mayor_usd?: number
  /**
   * Precio especial en USD definido por el usuario. Si se provee, se usa directamente.
   * Si no se provee, se auto-calcula manteniendo el margen actual del precio especial.
   */
  nuevo_precio_especial_usd?: number
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

export interface ReversarCompraParams {
  compraId: string
  usuarioId: string
  empresaId: string
}

export async function reversarCompra(params: ReversarCompraParams): Promise<void> {
  const { compraId, usuarioId, empresaId } = params

  await db.writeTransaction(async (tx) => {
    const now = localNow()

    // 1. Obtener factura
    const compraRes = await tx.execute(
      'SELECT * FROM facturas_compra WHERE id = ? AND empresa_id = ?',
      [compraId, empresaId]
    )
    if (!compraRes.rows?.length) throw new Error('Factura no encontrada')
    const compra = compraRes.rows.item(0) as {
      id: string; proveedor_id: string; nro_factura: string; tipo: string; status: string
      total_usd: string; saldo_pend_usd: string
    }

    // 2. Validar status
    if (compra.status !== 'PROCESADA') {
      throw new Error(`La factura tiene status "${compra.status}" y no puede ser reversada`)
    }

    // 3. Para CREDITO: no puede tener abonos registrados
    if (compra.tipo === 'CREDITO') {
      const pagRes = await tx.execute(
        "SELECT COUNT(*) as cnt FROM movimientos_cuenta_proveedor WHERE factura_compra_id = ? AND tipo = 'PAG' AND empresa_id = ?",
        [compraId, empresaId]
      )
      const pagCount = Number((pagRes.rows?.item(0) as { cnt: string | number })?.cnt ?? 0)
      if (pagCount > 0) {
        throw new Error('La factura tiene abonos registrados. Reverse los abonos individualmente desde el modulo CxP antes de reversar la factura.')
      }
    }

    // 4. Obtener lineas de detalle
    const detRes = await tx.execute(
      'SELECT * FROM facturas_compra_det WHERE factura_compra_id = ? AND empresa_id = ?',
      [compraId, empresaId]
    )
    type LineaDet = {
      id: string; producto_id: string; deposito_id: string
      cantidad: string; costo_usd_sistema: string | null; costo_unitario_usd: string; lote_id: string | null
    }
    const lineas: LineaDet[] = []
    if (detRes.rows) {
      for (let i = 0; i < detRes.rows.length; i++) {
        lineas.push(detRes.rows.item(i) as LineaDet)
      }
    }
    if (lineas.length === 0) throw new Error('La factura no tiene lineas de detalle')

    // 5. Por cada linea: validar stock y crear Kardex inverso (salida por devolucion)
    for (const linea of lineas) {
      const qty = new Decimal(linea.cantidad)
      const costoSistema = new Decimal(linea.costo_usd_sistema ?? linea.costo_unitario_usd)

      const prodRes = await tx.execute(
        'SELECT stock, costo_usd FROM productos WHERE id = ?',
        [linea.producto_id]
      )
      if (!prodRes.rows?.length) throw new Error('Producto no encontrado')
      const prod = prodRes.rows.item(0) as { stock: string; costo_usd: string }
      const currentStock = new Decimal(prod.stock)
      const currentCosto = new Decimal(prod.costo_usd)

      if (currentStock.lt(qty.minus(0.001))) {
        throw new Error(
          `Stock insuficiente para reversar. Disponible: ${currentStock.toFixed(3)}, requerido: ${qty.toFixed(3)}. Es posible que el inventario ya haya sido consumido.`
        )
      }

      const newStock = Decimal.max(0, currentStock.minus(qty))

      // Recalcular costo promedio ponderado (reverso de la contribucion de esta compra)
      let newCosto = currentCosto
      if (newStock.gt(0.001)) {
        const rawCosto = currentStock.times(currentCosto).minus(qty.times(costoSistema)).dividedBy(newStock)
        newCosto = Decimal.max(0, rawCosto)
      }

      // Kardex: salida por devolucion de compra
      await tx.execute(
        `INSERT INTO movimientos_inventario
           (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo,
            costo_unitario, lote_id, doc_origen_id, doc_origen_ref, motivo,
            usuario_id, fecha, empresa_id, created_at)
         VALUES (?, ?, ?, 'S', 'DEV', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          linea.producto_id,
          linea.deposito_id,
          toStorageString(qty),
          toStorageString(currentStock),
          toStorageString(newStock),
          toStorageString(costoSistema),
          linea.lote_id ?? null,
          compraId,
          `DEV-${compra.nro_factura}`,
          `Devolucion de compra ${compra.nro_factura}`,
          usuarioId,
          now,
          empresaId,
          now,
        ]
      )

      // Actualizar stock y costo del producto
      await tx.execute(
        'UPDATE productos SET stock = ?, costo_usd = ?, updated_at = ? WHERE id = ?',
        [toStorageString(newStock), toStorageString(newCosto), now, linea.producto_id]
      )
    }

    // 6. Movimiento CxP: cancelar deuda pendiente (CREDITO sin abonos)
    const saldoPend = new Decimal(compra.saldo_pend_usd)
    if (saldoPend.gt(0.01)) {
      const provRes = await tx.execute(
        'SELECT saldo_actual FROM proveedores WHERE id = ? AND empresa_id = ?',
        [compra.proveedor_id, empresaId]
      )
      const saldoProvActual = new Decimal((provRes.rows?.item(0) as { saldo_actual: string })?.saldo_actual ?? '0')
      const nuevoSaldoProv = Decimal.max(0, saldoProvActual.minus(saldoPend))

      await tx.execute(
        `INSERT INTO movimientos_cuenta_proveedor
           (id, empresa_id, proveedor_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
            observacion, factura_compra_id, doc_origen_id, doc_origen_tipo, fecha, created_at, created_by)
         VALUES (?, ?, ?, 'DEV', ?, ?, ?, ?, ?, ?, ?, 'DEV_COMPRA', ?, ?, ?)`,
        [
          uuidv4(), empresaId, compra.proveedor_id,
          `DEV-${compra.nro_factura}`,
          toStorageString(saldoPend),
          toStorageString(saldoProvActual),
          toStorageString(nuevoSaldoProv),
          `Devolucion de factura de compra ${compra.nro_factura}`,
          compraId, compraId,
          now, now, usuarioId,
        ]
      )
    }

    // 7. Marcar factura como REVERSADA y saldo en 0
    await tx.execute(
      'UPDATE facturas_compra SET status = ?, saldo_pend_usd = ?, updated_at = ? WHERE id = ?',
      ['REVERSADA', '0.00', now, compraId]
    )
  })
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

  // ─── Pre-check: número de factura único por proveedor ────────────────────────
  // Se consulta ANTES de abrir la transacción para fallar rápido y mantener
  // el formulario abierto. No protege contra conflictos offline con otro
  // dispositivo (eso lo cubre el UNIQUE constraint en Supabase + uploadFailed).
  const dupCheck = await db.execute(
    `SELECT id FROM facturas_compra
     WHERE empresa_id = ? AND proveedor_id = ? AND nro_factura = ? LIMIT 1`,
    [empresa_id, proveedor_id, nro_factura]
  )
  if (dupCheck.rows && dupCheck.rows.length > 0) {
    throw new Error(
      `Ya existe una factura con el número "${nro_factura}" para este proveedor. ` +
      `Cambiá el número antes de registrar.`
    )
  }

  // ─── Pre-fetch: deposito, moneda y stocks ANTES de la transaccion ──────────
  // Hacemos los SELECTs fuera del writeTransaction para evitar mezclar
  // lecturas y escrituras dentro del loop, lo que puede causar que solo
  // el primer producto se procese en algunas implementaciones de wa-sqlite.

  // 0. Deposito principal
  let depositoId: string
  const depResult = await db.execute(
    'SELECT id FROM depositos WHERE empresa_id = ? AND es_principal = 1 AND is_active = 1 LIMIT 1',
    [empresa_id]
  )
  if (depResult.rows && depResult.rows.length > 0) {
    depositoId = (depResult.rows.item(0) as { id: string }).id
  } else {
    const depFallback = await db.execute(
      'SELECT id FROM depositos WHERE empresa_id = ? AND is_active = 1 LIMIT 1',
      [empresa_id]
    )
    if (!depFallback.rows || depFallback.rows.length === 0) {
      throw new Error('No hay depositos configurados. Cree un deposito primero.')
    }
    depositoId = (depFallback.rows.item(0) as { id: string }).id
  }

  // 0b. Moneda
  const monedaCode = moneda === 'BS' ? 'VES' : 'USD'
  const monedaResult = await db.execute(
    'SELECT id FROM monedas WHERE codigo_iso = ? LIMIT 1',
    [monedaCode]
  )
  if (!monedaResult.rows?.length) {
    throw new Error(`No se encontro la moneda ${monedaCode} en el catalogo`)
  }
  const monedaId = (monedaResult.rows.item(0) as { id: string }).id

  // 0c. Stocks y precios actuales de todos los productos de las lineas
  const stocksMap = new Map<string, Decimal>()
  type PreciosActuales = {
    costo_usd: Decimal
    precio_venta_usd: Decimal
    precio_mayor_usd: Decimal | null
    precio_especial_usd: Decimal | null
  }
  const preciosMap = new Map<string, PreciosActuales>()

  for (const linea of lineas) {
    const prodRes = await db.execute(
      'SELECT stock, costo_usd, precio_venta_usd, precio_mayor_usd, precio_especial_usd FROM productos WHERE id = ? LIMIT 1',
      [linea.producto_id]
    )
    if (!prodRes.rows || prodRes.rows.length === 0) {
      throw new Error('Producto no encontrado. Verifique que todos los productos esten sincronizados.')
    }
    const p = prodRes.rows.item(0) as {
      stock: string
      costo_usd: string
      precio_venta_usd: string
      precio_mayor_usd: string | null
      precio_especial_usd: string | null
    }
    stocksMap.set(linea.producto_id, new Decimal(p.stock || '0'))
    preciosMap.set(linea.producto_id, {
      costo_usd: new Decimal(p.costo_usd || '0'),
      precio_venta_usd: new Decimal(p.precio_venta_usd || '0'),
      precio_mayor_usd: p.precio_mayor_usd != null ? new Decimal(p.precio_mayor_usd) : null,
      precio_especial_usd: p.precio_especial_usd != null ? new Decimal(p.precio_especial_usd) : null,
    })
  }

  let compraId = ''

  await db.writeTransaction(async (tx) => {
    const now = localNow()
    compraId = uuidv4()

    // 1. Calcular totales con desglose fiscal (lineas ya vienen en USD)
    const dTasa = new Decimal(tasa)
    let totalExentoUsd = new Decimal(0)
    let totalBaseUsd = new Decimal(0)
    let totalIvaUsd = new Decimal(0)
    for (const linea of lineas) {
      const subtotal = new Decimal(linea.cantidad).times(linea.costo_unitario_usd)
      const tipoImp = linea.tipo_impuesto ?? 'Exento'
      if (tipoImp === 'Exento') {
        totalExentoUsd = totalExentoUsd.plus(subtotal)
      } else {
        // Gravable o Exonerado: contribuye a la base imponible
        totalBaseUsd = totalBaseUsd.plus(subtotal)
        const pct = new Decimal(linea.impuesto_pct ?? 0)
        totalIvaUsd = totalIvaUsd.plus(subtotal.times(pct).dividedBy(100))
      }
    }
    const totalUsd = totalExentoUsd.plus(totalBaseUsd).plus(totalIvaUsd)
    const totalBs = totalUsd.times(dTasa)

    // 2. Calcular pagos inmediatos y saldo pendiente
    let totalAbonadoUsd = new Decimal(0)
    for (const pago of pagos) {
      const montoUsd = pago.moneda === 'BS'
        ? new Decimal(pago.monto).dividedBy(dTasa)
        : new Decimal(pago.monto)
      totalAbonadoUsd = totalAbonadoUsd.plus(montoUsd)
    }
    const pendienteUsd = Decimal.max(0, totalUsd.minus(totalAbonadoUsd))
    const tipo: 'CONTADO' | 'CREDITO' = pendienteUsd.lte(0.01) ? 'CONTADO' : 'CREDITO'
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
        toStorageString(tasa),
        tasa_costo ? toStorageString(tasa_costo) : null,
        toStorageString(totalExentoUsd),
        toStorageString(totalBaseUsd),
        toStorageString(totalIvaUsd),
        '0.00000000',
        toStorageString(totalUsd),
        toStorageString(totalBs),
        toStorageString(saldoPendUsd),
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
      const dCantidad = new Decimal(linea.cantidad)
      const dCostoUnit = new Decimal(linea.costo_unitario_usd)
      const subtotalUsd = dCantidad.times(dCostoUnit)
      const subtotalBs = subtotalUsd.times(dTasa)
      // costoSistema: BCV-adjusted cost for inventory valuation.
      // Equals costo_unitario_usd when not using tasa paralela.
      const costoSistema = new Decimal(linea.costo_usd_sistema ?? linea.costo_unitario_usd)

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
            toStorageString(dCantidad),
            toStorageString(dCantidad),
            toStorageString(costoSistema),
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
          toStorageString(dCantidad),
          toStorageString(dCostoUnit),
          toStorageString(costoSistema),
          linea.tipo_impuesto ?? 'Exento',
          toStorageString(linea.impuesto_pct ?? 0),
          toStorageString(subtotalUsd),
          toStorageString(subtotalBs),
          loteId,
          empresa_id,
          now,
        ]
      )

      // 4c. Stock actual (pre-cargado; se actualiza localmente para acumular lineas del mismo producto)
      const stockActual = stocksMap.get(linea.producto_id) ?? new Decimal(0)

      // 4d. Calcular nuevo stock y actualizar mapa para proximas iteraciones
      const stockNuevo = stockActual.plus(dCantidad)
      stocksMap.set(linea.producto_id, stockNuevo)

      // 4e. INSERT movimiento de inventario (entrada por compra) — usa costo sistema (BCV)
      const movId = uuidv4()
      await tx.execute(
        `INSERT INTO movimientos_inventario (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, costo_unitario, lote_id, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, empresa_id, created_at)
         VALUES (?, ?, ?, 'E', 'COM', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movId,
          linea.producto_id,
          depositoId,
          toStorageString(dCantidad),
          toStorageString(stockActual),
          toStorageString(stockNuevo),
          toStorageString(costoSistema),
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

      // 4f. UPDATE producto: stock + costo + precios (según decisión del usuario).
      //
      // costo_cambio = false → solo actualizar stock (el costo no cambió)
      // no_actualizar_pvp = true → actualizar costo pero mantener pvp
      // nuevo_precio_venta_usd provisto → usar pvp elegido por el usuario
      // ninguna de las anteriores → auto-calcular pvp desde el margen actual
      const precios = preciosMap.get(linea.producto_id)
      const costoActual = precios?.costo_usd ?? new Decimal(0)
      const pvpActual = precios?.precio_venta_usd ?? new Decimal(0)
      const mayorActual = precios?.precio_mayor_usd ?? null
      const especialActual = precios?.precio_especial_usd ?? null
      // pvpNuevoAudit: captura el pvp final para el registro de auditoria de precios
      let pvpNuevoAudit: Decimal | null = null

      if (!linea.costo_cambio) {
        // Costo no cambio: solo actualizar stock
        await tx.execute(
          'UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?',
          [toStorageString(stockNuevo), now, linea.producto_id]
        )
      } else if (linea.no_actualizar_pvp) {
        // Costo cambio pero usuario eligio mantener el pvp actual
        await tx.execute(
          'UPDATE productos SET stock = ?, costo_usd = ?, updated_at = ? WHERE id = ?',
          [toStorageString(stockNuevo), toStorageString(costoSistema), now, linea.producto_id]
        )
        pvpNuevoAudit = pvpActual
      } else {
        // Determinar nuevo pvp (nivel 1)
        let nuevoPvp: Decimal
        if (linea.nuevo_precio_venta_usd !== undefined && linea.nuevo_precio_venta_usd > 0) {
          const dNuevoPvp = new Decimal(linea.nuevo_precio_venta_usd)
          // Guard: PVP no puede ser menor al costo
          if (dNuevoPvp.lt(costoSistema)) {
            throw new Error(
              `El PVP ($${dNuevoPvp.toFixed(2)}) es menor al costo ($${costoSistema.toFixed(2)}). Corrija el precio antes de guardar.`
            )
          }
          nuevoPvp = dNuevoPvp
        } else if (costoActual.gt(0) && pvpActual.gt(0)) {
          const margen = pvpActual.minus(costoActual).dividedBy(costoActual)
          nuevoPvp = Decimal.max(costoSistema, costoSistema.times(new Decimal(1).plus(margen)))
        } else {
          nuevoPvp = costoSistema
        }

        pvpNuevoAudit = nuevoPvp

        // Precio mayor: usar provisto o auto-calcular con margen propio (siempre >= pvp)
        let nuevoMayor: Decimal | null = null
        if (linea.nuevo_precio_mayor_usd !== undefined && linea.nuevo_precio_mayor_usd > 0) {
          nuevoMayor = new Decimal(linea.nuevo_precio_mayor_usd)
        } else if (mayorActual !== null && mayorActual.gt(0) && costoActual.gt(0)) {
          const margenMayor = mayorActual.minus(costoActual).dividedBy(costoActual)
          nuevoMayor = costoSistema.times(new Decimal(1).plus(margenMayor))
          if (nuevoMayor.lt(nuevoPvp)) nuevoMayor = nuevoPvp
        }

        // Precio especial: usar provisto o auto-calcular con margen propio (siempre >= pvp)
        let nuevoEspecial: Decimal | null = null
        if (linea.nuevo_precio_especial_usd !== undefined && linea.nuevo_precio_especial_usd > 0) {
          nuevoEspecial = new Decimal(linea.nuevo_precio_especial_usd)
        } else if (especialActual !== null && especialActual.gt(0) && costoActual.gt(0)) {
          const margenEspecial = especialActual.minus(costoActual).dividedBy(costoActual)
          nuevoEspecial = costoSistema.times(new Decimal(1).plus(margenEspecial))
          if (nuevoEspecial.lt(nuevoPvp)) nuevoEspecial = nuevoPvp
        }

        if (nuevoMayor !== null && nuevoEspecial !== null) {
          await tx.execute(
            'UPDATE productos SET stock = ?, costo_usd = ?, precio_venta_usd = ?, precio_mayor_usd = ?, precio_especial_usd = ?, updated_at = ? WHERE id = ?',
            [toStorageString(stockNuevo), toStorageString(costoSistema), toStorageString(nuevoPvp), toStorageString(nuevoMayor), toStorageString(nuevoEspecial), now, linea.producto_id]
          )
        } else if (nuevoMayor !== null) {
          await tx.execute(
            'UPDATE productos SET stock = ?, costo_usd = ?, precio_venta_usd = ?, precio_mayor_usd = ?, updated_at = ? WHERE id = ?',
            [toStorageString(stockNuevo), toStorageString(costoSistema), toStorageString(nuevoPvp), toStorageString(nuevoMayor), now, linea.producto_id]
          )
        } else if (nuevoEspecial !== null) {
          await tx.execute(
            'UPDATE productos SET stock = ?, costo_usd = ?, precio_venta_usd = ?, precio_especial_usd = ?, updated_at = ? WHERE id = ?',
            [toStorageString(stockNuevo), toStorageString(costoSistema), toStorageString(nuevoPvp), toStorageString(nuevoEspecial), now, linea.producto_id]
          )
        } else {
          await tx.execute(
            'UPDATE productos SET stock = ?, costo_usd = ?, precio_venta_usd = ?, updated_at = ? WHERE id = ?',
            [toStorageString(stockNuevo), toStorageString(costoSistema), toStorageString(nuevoPvp), now, linea.producto_id]
          )
        }
      }

      // 4g. Registrar historico de precios cuando el costo cambio
      if (linea.costo_cambio && pvpNuevoAudit !== null) {
        await tx.execute(
          `INSERT INTO historico_precios
             (id, empresa_id, factura_compra_id, producto_id, usuario_id,
              costo_anterior, costo_nuevo, pvp_anterior, pvp_nuevo, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            empresa_id,
            compraId,
            linea.producto_id,
            usuario_id,
            toStorageString(costoActual),
            toStorageString(costoSistema),
            toStorageString(pvpActual),
            toStorageString(pvpNuevoAudit),
            now,
          ]
        )
      }
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
    const sumAfterInsert = new Decimal((sumResult.rows?.item(0) as { saldo: string }).saldo || '0')
    // saldo antes de esta factura = sum actual - pendienteUsd (contribucion de la nueva factura)
    let saldoProv = Decimal.max(0, sumAfterInsert.minus(pendienteUsd))

    // 5b. Si hay deuda pendiente: crear entrada FAC
    if (pendienteUsd.gt(0.01)) {
      const nuevoSaldo = saldoProv.plus(pendienteUsd)
      const movFacId = uuidv4()
      await tx.execute(
        `INSERT INTO movimientos_cuenta_proveedor
           (id, empresa_id, proveedor_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
            observacion, factura_compra_id, doc_origen_id, doc_origen_tipo, fecha, created_at, created_by)
         VALUES (?, ?, ?, 'FAC', ?, ?, ?, ?, ?, ?, ?, 'FACTURA_COMPRA', ?, ?, ?)`,
        [
          movFacId, empresa_id, proveedor_id,
          `FAC-${nro_factura}`,
          toStorageString(pendienteUsd),
          toStorageString(saldoProv),
          toStorageString(nuevoSaldo),
          `Factura compra ${nro_factura}`,
          compraId, compraId,
          now, now, usuario_id,
        ]
      )
      saldoProv = nuevoSaldo
    }

    // 5c. Por cada pago inmediato: crear entrada PAG
    // tasa_interna: para pagos iniciales usar tasa_costo si existe, sino tasa del proveedor
    const dTasaInterna = tasa_costo ? new Decimal(tasa_costo) : dTasa

    for (const pago of pagos) {
      const dMontoPago = new Decimal(pago.monto)
      const montoUsd = pago.moneda === 'BS' ? dMontoPago.dividedBy(dTasa) : dMontoPago
      if (montoUsd.lte(0)) continue
      // monto a tasa interna (para contabilidad)
      const montoUsdInterno = pago.moneda === 'BS'
        ? dMontoPago.dividedBy(dTasaInterna)
        : dMontoPago
      const nuevoSaldo = Decimal.max(0, saldoProv.minus(montoUsd))
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
          toStorageString(montoUsd),
          toStorageString(saldoProv),
          toStorageString(nuevoSaldo),
          `Pago inicial compra ${nro_factura}`,
          compraId, compraId,
          pago.moneda,
          toStorageString(dMontoPago),
          toStorageString(dTasa),
          toStorageString(montoUsdInterno),
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
            toStorageString(montoUsd),
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
        monto_usd: p.moneda === 'BS'
          ? new Decimal(p.monto).dividedBy(dTasa).toNumber()
          : p.monto,
        banco_empresa_id: p.banco_empresa_id,
      }))
      await generarAsientosCompra(tx, {
        empresaId: empresa_id,
        compraId,
        nroFactura: nro_factura,
        totalUsd: totalUsd.toNumber(),
        esContado: tipo === 'CONTADO',
        banco_empresa_id: null,
        pagos: pagosContabilidad,
        cuentas,
        usuarioId: usuario_id,
        monedaContable: 'BS',
        tasa,
      })

      await tx.execute('UPDATE facturas_compra SET contabilidad_ok = 1 WHERE id = ?', [compraId])
    } catch (err: unknown) {
      console.warn('⚠️ contabilidad: fallo en asientos para compra', compraId, err)
      try {
        await tx.execute(
          `INSERT INTO errores_contabilidad
             (id, empresa_id, tabla_origen, doc_origen_id, error_msg, created_at)
           VALUES (?, ?, 'facturas_compra', ?, ?, ?)`,
          [
            uuidv4(),
            empresa_id,
            compraId,
            err instanceof Error ? err.message : String(err),
            now,
          ]
        )
      } catch {
        // El log de errores_contabilidad es best-effort — nunca bloquea la compra
      }
    }
  })

  return { compraId, nroFactura: nro_factura }
}
