import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

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

export interface LineaCompra {
  producto_id: string
  cantidad: number
  costo_unitario_usd: number
}

export interface CrearCompraParams {
  proveedor_id: string
  tasa: number
  fecha_factura: string
  nro_factura: string
  nro_control?: string
  moneda: 'USD' | 'BS'
  tipo: 'CONTADO' | 'CREDITO'
  lineas: LineaCompra[]
  usuario_id: string
  empresa_id: string
}

export interface CrearCompraResult {
  compraId: string
  nroFactura: string
}

export function useCompras() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT c.*, p.razon_social as proveedor_nombre
     FROM facturas_compra c
     LEFT JOIN proveedores p ON c.proveedor_id = p.id
     WHERE c.empresa_id = ?
     ORDER BY c.fecha_factura DESC`,
    [empresaId]
  )
  return { compras: (data ?? []) as (Compra & { proveedor_nombre: string })[], isLoading }
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

export async function crearCompra(params: CrearCompraParams): Promise<CrearCompraResult> {
  const {
    proveedor_id,
    tasa,
    fecha_factura,
    nro_factura,
    nro_control,
    moneda,
    tipo,
    lineas,
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
    const now = new Date().toISOString()
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

    // 2. Determinar saldo pendiente segun tipo
    const saldoPendUsd = tipo === 'CREDITO' ? totalUsd : 0

    // 3. INSERT facturas_compra (cabecera)
    await tx.execute(
      `INSERT INTO facturas_compra (id, proveedor_id, nro_factura, nro_control, deposito_id, moneda_id, tasa, total_exento_usd, total_base_usd, total_iva_usd, total_igtf_usd, total_usd, total_bs, saldo_pend_usd, tipo, status, fecha_factura, fecha_recepcion, usuario_id, empresa_id, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        compraId,
        proveedor_id,
        nro_factura,
        nro_control ?? null,
        depositoId,
        monedaId,
        tasa.toFixed(4),
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

      // 4a. INSERT facturas_compra_det
      await tx.execute(
        `INSERT INTO facturas_compra_det (id, factura_compra_id, producto_id, deposito_id, cantidad, costo_unitario_usd, tipo_impuesto, impuesto_pct, subtotal_usd, subtotal_bs, empresa_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          detalleId,
          compraId,
          linea.producto_id,
          depositoId,
          linea.cantidad.toFixed(3),
          linea.costo_unitario_usd.toFixed(2),
          'Exento',
          '0.00',
          subtotalUsd.toFixed(2),
          subtotalBs.toFixed(2),
          empresa_id,
          now,
        ]
      )

      // 4b. Leer stock actual del producto
      const prodResult = await tx.execute(
        'SELECT stock FROM productos WHERE id = ?',
        [linea.producto_id]
      )
      if (!prodResult.rows || prodResult.rows.length === 0) {
        throw new Error('Producto no encontrado')
      }
      const stockActual = parseFloat((prodResult.rows.item(0) as { stock: string }).stock)

      // 4c. Calcular nuevo stock
      const stockNuevo = stockActual + linea.cantidad

      // 4d. INSERT movimiento de inventario (entrada por compra)
      const movId = uuidv4()
      await tx.execute(
        `INSERT INTO movimientos_inventario (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, costo_unitario, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, empresa_id, created_at)
         VALUES (?, ?, ?, 'E', 'COM', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movId,
          linea.producto_id,
          depositoId,
          linea.cantidad.toFixed(3),
          stockActual.toFixed(3),
          stockNuevo.toFixed(3),
          linea.costo_unitario_usd.toFixed(4),
          compraId,
          `COM-${nro_factura}`,
          `Compra ${nro_factura}`,
          usuario_id,
          now,
          empresa_id,
          now,
        ]
      )

      // 4e. UPDATE producto: stock y costo_usd
      await tx.execute(
        'UPDATE productos SET stock = ?, costo_usd = ?, updated_at = ? WHERE id = ?',
        [
          stockNuevo.toFixed(3),
          linea.costo_unitario_usd.toFixed(2),
          now,
          linea.producto_id,
        ]
      )
    }
  })

  return { compraId, nroFactura: nro_factura }
}
