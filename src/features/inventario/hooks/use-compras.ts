import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

export interface Compra {
  id: string
  proveedor_id: string
  nro_factura: string
  tasa: string
  total_usd: string
  total_bs: string
  usuario_id: string
  fecha: string
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
     ORDER BY c.fecha DESC`,
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
  const { proveedor_id, tasa, lineas, usuario_id, empresa_id } = params

  if (lineas.length === 0) {
    throw new Error('Debe agregar al menos una linea a la compra')
  }

  if (tasa <= 0) {
    throw new Error('La tasa de cambio debe ser mayor a 0')
  }

  let compraId = ''
  let nroFactura = ''

  await db.writeTransaction(async (tx) => {
    const now = new Date().toISOString()
    compraId = uuidv4()

    // 1. Calcular totales
    let totalUsd = 0
    for (const linea of lineas) {
      totalUsd += linea.cantidad * linea.costo_unitario_usd
    }
    totalUsd = Number(totalUsd.toFixed(2))
    const totalBs = Number((totalUsd * tasa).toFixed(2))

    // 2. Generar nro_factura (por empresa)
    const countResult = await tx.execute(
      'SELECT COUNT(*) as cnt FROM facturas_compra WHERE empresa_id = ?',
      [empresa_id]
    )
    const count = Number((countResult.rows?.item(0) as { cnt: number })?.cnt ?? 0)
    nroFactura = String(count + 1).padStart(6, '0')

    // 3. INSERT facturas_compra (cabecera)
    await tx.execute(
      `INSERT INTO facturas_compra (id, proveedor_id, nro_factura, tasa, total_usd, total_bs, usuario_id, fecha, empresa_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        compraId,
        proveedor_id,
        nroFactura,
        tasa.toFixed(4),
        totalUsd.toFixed(2),
        totalBs.toFixed(2),
        usuario_id,
        now,
        empresa_id,
        now,
      ]
    )

    // 4. Por cada linea: detalle + kardex + actualizar producto
    for (const linea of lineas) {
      const detalleId = uuidv4()

      // 4a. INSERT facturas_compra_det
      await tx.execute(
        `INSERT INTO facturas_compra_det (id, factura_compra_id, producto_id, cantidad, costo_unitario_usd, empresa_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          detalleId,
          compraId,
          linea.producto_id,
          linea.cantidad.toFixed(3),
          linea.costo_unitario_usd.toFixed(2),
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
        `INSERT INTO movimientos_inventario (id, producto_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id, fecha, empresa_id, created_at)
         VALUES (?, ?, 'E', 'COM', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movId,
          linea.producto_id,
          linea.cantidad.toFixed(3),
          stockActual.toFixed(3),
          stockNuevo.toFixed(3),
          `Compra ${nroFactura}`,
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

  return { compraId, nroFactura }
}
