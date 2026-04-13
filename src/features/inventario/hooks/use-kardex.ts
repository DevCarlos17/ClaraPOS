import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

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

export function useMovimientos(limit = 50) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT * FROM movimientos_inventario WHERE empresa_id = ? ORDER BY fecha DESC LIMIT ${limit}`,
    [empresaId]
  )
  return { movimientos: (data ?? []) as MovimientoInventario[], isLoading }
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
}) {
  const { producto_id, tipo, cantidad, motivo, usuario_id, empresa_id } = params

  // Transaccion atomica local via SQLite
  await db.writeTransaction(async (tx) => {
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

    // 4. Crear movimiento
    const id = uuidv4()
    const now = new Date().toISOString()

    await tx.execute(
      `INSERT INTO movimientos_inventario (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id, fecha, empresa_id, created_at)
       VALUES (?, ?, ?, ?, 'MAN', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        producto_id,
        depositoId,
        tipo,
        cantidad.toFixed(3),
        stockActual.toFixed(3),
        stockNuevo.toFixed(3),
        motivo ?? null,
        usuario_id,
        now,
        empresa_id,
        now,
      ]
    )

    // 5. Actualizar stock del producto
    await tx.execute('UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?', [
      stockNuevo.toFixed(3),
      now,
      producto_id,
    ])
  })
}
