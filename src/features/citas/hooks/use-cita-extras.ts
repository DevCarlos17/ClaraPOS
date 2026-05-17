import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface CitaItemExtra {
  id: string
  empresa_id: string
  cita_id: string
  producto_id: string
  producto_nombre: string
  cantidad: string
  precio_usd: string
  status_cobro: string
  venta_id: string | null
  created_at: string
  created_by: string | null
}

export function useCitaExtras(citaId: string) {
  const { data, isLoading } = useQuery(
    citaId
      ? `SELECT cie.*, p.nombre as producto_nombre
         FROM cita_items_extras cie
         LEFT JOIN productos p ON p.id = cie.producto_id
         WHERE cie.cita_id = ?
         ORDER BY cie.created_at ASC`
      : '',
    citaId ? [citaId] : []
  )
  return { extras: (data ?? []) as CitaItemExtra[], isLoading }
}

export function calcularTotalExtras(extras: CitaItemExtra[]): number {
  return extras
    .filter((e) => e.status_cobro === 'PENDIENTE')
    .reduce((sum, e) => sum + parseFloat(e.precio_usd) * parseFloat(e.cantidad), 0)
}

export async function agregarItemExtra(data: {
  citaId: string
  empresaId: string
  productoId: string
  cantidad: number
  precioUsd: number
  userId: string
}) {
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO cita_items_extras (id, empresa_id, cita_id, producto_id, cantidad, precio_usd, status_cobro, venta_id, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDIENTE', NULL, ?, ?)`,
      [
        uuidv4(),
        data.empresaId,
        data.citaId,
        data.productoId,
        data.cantidad.toFixed(3),
        data.precioUsd.toFixed(2),
        localNow(),
        data.userId,
      ]
    )
  })
}

export async function removerItemExtra(itemExtraId: string) {
  await db.writeTransaction(async (tx) => {
    await tx.execute('DELETE FROM cita_items_extras WHERE id = ?', [itemExtraId])
  })
}

export async function cobrarExtras(citaId: string, ventaId: string) {
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `UPDATE cita_items_extras SET status_cobro = 'COBRADO', venta_id = ?
       WHERE cita_id = ? AND status_cobro = 'PENDIENTE'`,
      [ventaId, citaId]
    )
  })
}
