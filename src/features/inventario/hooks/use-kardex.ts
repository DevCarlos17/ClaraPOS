import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface MovimientoInventario {
  id: string
  producto_id: string
  tipo: string
  origen: string
  cantidad: string
  stock_anterior: string
  stock_nuevo: string
  motivo: string | null
  usuario_id: string
  fecha: string
  venta_id: string | null
  created_at: string
}

export interface MovimientoConProducto extends MovimientoInventario {
  prod_codigo: string
  prod_nombre: string
  departamento_id: string
}

export function useMovimientos(limit = 50) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT * FROM movimientos_inventario WHERE empresa_id = ? ORDER BY fecha DESC LIMIT ${limit}`,
    [empresaId]
  )
  return { movimientos: (data ?? []) as MovimientoInventario[], isLoading }
}

export function useMovimientosFiltrados(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT mi.*, p.codigo as prod_codigo, p.nombre as prod_nombre, p.departamento_id
     FROM movimientos_inventario mi
     LEFT JOIN productos p ON p.id = mi.producto_id
     WHERE mi.empresa_id = ? AND mi.fecha >= ? AND mi.fecha <= ?
     ORDER BY mi.fecha DESC LIMIT 500`,
    [empresaId, fechaDesde, fechaHasta + ' 23:59:59']
  )
  return { movimientos: (data ?? []) as MovimientoConProducto[], isLoading }
}

export function useMovimientosPorProducto(productoId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM movimientos_inventario WHERE empresa_id = ? AND producto_id = ? ORDER BY fecha DESC',
    [empresaId, productoId]
  )
  return { movimientos: (data ?? []) as MovimientoInventario[], isLoading }
}

export async function registrarMovimiento(params: {
  producto_id: string
  tipo: 'E' | 'S'
  cantidad: number
  motivo?: string
  usuario_id: string
  empresa_id: string
  /** Si se provee, se usa en lugar del deposito principal auto-detectado */
  deposito_id?: string
  /** Lote existente a actualizar (SALIDA: descuenta; ENTRADA: incrementa) */
  lote_id?: string
  /** Nuevo lote a crear al registrar una ENTRADA */
  lote_nro?: string
  lote_fecha_fab?: string
  lote_fecha_venc?: string
}) {
  const { producto_id, tipo, cantidad, motivo, usuario_id, empresa_id } = params

  await db.writeTransaction(async (tx) => {
    const now = localNow()

    // 0. Resolver deposito
    let depositoId: string
    if (params.deposito_id) {
      depositoId = params.deposito_id
    } else {
      const depResult = await tx.execute(
        'SELECT id FROM depositos WHERE empresa_id = ? AND es_principal = 1 AND is_active = 1 LIMIT 1',
        [empresa_id]
      )
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
    }

    // 1. Leer stock actual
    const result = await tx.execute('SELECT stock FROM productos WHERE id = ?', [producto_id])
    if (!result.rows || result.rows.length === 0) {
      throw new Error('Producto no encontrado')
    }
    const stockActual = parseFloat((result.rows.item(0) as { stock: string }).stock)

    // 2. Calcular nuevo stock
    const stockNuevo = tipo === 'E' ? stockActual + cantidad : stockActual - cantidad

    // 3. Validar no negativo
    if (stockNuevo < 0) {
      throw new Error(`Stock insuficiente. Stock actual: ${stockActual}, intentando sacar: ${cantidad}`)
    }

    // 4. Manejar lote (atomico dentro de la transaccion)
    let loteIdMovimiento: string | null = params.lote_id ?? null

    if (tipo === 'S' && params.lote_id) {
      // SALIDA: descontar del lote especificado
      const loteResult = await tx.execute(
        'SELECT cantidad_actual FROM lotes WHERE id = ?',
        [params.lote_id]
      )
      if (loteResult.rows && loteResult.rows.length > 0) {
        const cantLote = parseFloat((loteResult.rows.item(0) as { cantidad_actual: string }).cantidad_actual)
        if (cantLote < cantidad) {
          throw new Error(
            `Stock insuficiente en lote. Disponible: ${cantLote.toFixed(3)}, Solicitado: ${cantidad.toFixed(3)}`
          )
        }
        const nuevaCant = cantLote - cantidad
        await tx.execute(
          'UPDATE lotes SET cantidad_actual = ?, status = ?, updated_at = ? WHERE id = ?',
          [nuevaCant.toFixed(3), nuevaCant <= 0 ? 'AGOTADO' : 'ACTIVO', now, params.lote_id]
        )
      }
    } else if (tipo === 'E' && params.lote_id) {
      // ENTRADA en lote existente: incrementar cantidad_actual
      const loteResult = await tx.execute(
        'SELECT cantidad_actual FROM lotes WHERE id = ?',
        [params.lote_id]
      )
      if (loteResult.rows && loteResult.rows.length > 0) {
        const cantLote = parseFloat((loteResult.rows.item(0) as { cantidad_actual: string }).cantidad_actual)
        await tx.execute(
          'UPDATE lotes SET cantidad_actual = ?, status = ?, updated_at = ? WHERE id = ?',
          [(cantLote + cantidad).toFixed(3), 'ACTIVO', now, params.lote_id]
        )
      }
    } else if (tipo === 'E' && params.lote_nro) {
      // ENTRADA con nuevo lote: crear el lote y registrar el movimiento apuntando a el
      loteIdMovimiento = uuidv4()
      await tx.execute(
        `INSERT INTO lotes (id, empresa_id, producto_id, deposito_id, nro_lote, fecha_fabricacion,
           fecha_vencimiento, cantidad_inicial, cantidad_actual, costo_unitario, factura_compra_id,
           status, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'ACTIVO', ?, ?, ?)`,
        [
          loteIdMovimiento,
          empresa_id,
          producto_id,
          depositoId,
          params.lote_nro.trim().toUpperCase(),
          params.lote_fecha_fab ?? null,
          params.lote_fecha_venc ?? null,
          cantidad.toFixed(3),
          cantidad.toFixed(3),
          now,
          now,
          usuario_id,
        ]
      )
    }

    // 5. Crear movimiento de inventario
    const id = uuidv4()

    await tx.execute(
      `INSERT INTO movimientos_inventario
         (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo,
          lote_id, motivo, usuario_id, fecha, empresa_id, created_at)
       VALUES (?, ?, ?, ?, 'MAN', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        producto_id,
        depositoId,
        tipo,
        cantidad.toFixed(3),
        stockActual.toFixed(3),
        stockNuevo.toFixed(3),
        loteIdMovimiento,
        motivo ?? null,
        usuario_id,
        now,
        empresa_id,
        now,
      ]
    )

    // 6. Actualizar stock del producto
    await tx.execute('UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?', [
      stockNuevo.toFixed(3),
      now,
      producto_id,
    ])
  })
}
