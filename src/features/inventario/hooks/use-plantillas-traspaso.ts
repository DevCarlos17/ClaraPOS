import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface TraspasoPlantilla {
  id: string
  empresa_id: string
  nombre: string
  descripcion: string | null
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface PlantillaConProductos extends TraspasoPlantilla {
  items_count: number
}

export interface PlantillaProducto {
  id: string
  producto_id: string
  producto_nombre: string
  producto_codigo: string
  producto_is_active: number
}

/**
 * Listado de plantillas activas de la empresa actual, con conteo de
 * productos por plantilla — mismo shape que `useTraspasos()` (items_count
 * via subquery COUNT). Ver openspec/changes/plantillas-de-traslado/design.md.
 */
export function usePlantillasTraspaso() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT p.*,
            (SELECT COUNT(*) FROM traspaso_plantillas_det d WHERE d.plantilla_id = p.id) AS items_count
     FROM traspaso_plantillas p
     WHERE p.empresa_id = ? AND p.is_active = 1
     ORDER BY p.nombre ASC`,
    [empresaId]
  )
  return { plantillas: (data ?? []) as PlantillaConProductos[], isLoading }
}

/**
 * Productos de una plantilla especifica, resueltos con nombre/codigo/estado
 * del producto — fetch lazy per-id (no eager-joined en el listado), consumido
 * al seleccionar una plantilla para cargarla en el formulario de traspaso.
 */
export function usePlantillaProductos(plantillaId: string) {
  const { data, isLoading } = useQuery(
    `SELECT d.id, d.producto_id,
            pr.nombre AS producto_nombre, pr.codigo AS producto_codigo, pr.is_active AS producto_is_active
     FROM traspaso_plantillas_det d
     JOIN productos pr ON pr.id = d.producto_id
     WHERE d.plantilla_id = ?`,
    [plantillaId]
  )
  return { productos: (data ?? []) as PlantillaProducto[], isLoading }
}

export interface CrearPlantillaParams {
  nombre: string
  descripcion?: string
  empresa_id: string
  productoIds: string[]
}

/**
 * Crea una plantilla de traslado: cabecera + N filas de detalle
 * (solo membresia de producto, sin cantidad), atomicamente en una unica
 * `writeTransaction`. Rechaza sin nombre o sin productos ANTES de abrir la
 * tx (defensa en profundidad — el CHECK/NOT NULL de la DB tambien protege).
 */
export async function crearPlantilla(params: CrearPlantillaParams): Promise<string> {
  const { nombre, descripcion, empresa_id, productoIds } = params

  if (!nombre.trim()) {
    throw new Error('El nombre de la plantilla es obligatorio')
  }
  if (productoIds.length === 0) {
    throw new Error('La plantilla debe tener al menos un producto')
  }

  const id = uuidv4()
  const now = localNow()

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO traspaso_plantillas
         (id, empresa_id, nombre, descripcion, is_active, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [id, empresa_id, nombre.toUpperCase(), descripcion ?? null, 1, now, now]
    )

    for (const productoId of productoIds) {
      const detId = uuidv4()
      await tx.execute(
        `INSERT INTO traspaso_plantillas_det (id, empresa_id, plantilla_id, producto_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [detId, empresa_id, id, productoId, now]
      )
    }
  })

  return id
}

export interface ActualizarPlantillaParams {
  nombre?: string
  descripcion?: string
  productoIds?: string[]
  empresa_id: string
  updated_by?: string
}

/**
 * Edita una plantilla existente: actualiza nombre/descripcion (si se
 * proveen) y, si se provee `productoIds`, reemplaza el detalle completo
 * (delete-and-reinsert, patron `use-recetas.ts`/`recetas`) — todo en una
 * unica `writeTransaction`.
 */
export async function actualizarPlantilla(id: string, params: ActualizarPlantillaParams): Promise<void> {
  const { nombre, descripcion, productoIds, empresa_id, updated_by } = params
  const now = localNow()

  await db.writeTransaction(async (tx) => {
    const setClauses: string[] = ['updated_at = ?']
    const setParams: unknown[] = [now]

    if (nombre !== undefined) {
      setClauses.push('nombre = ?')
      setParams.push(nombre.toUpperCase())
    }
    if (descripcion !== undefined) {
      setClauses.push('descripcion = ?')
      setParams.push(descripcion)
    }
    if (updated_by !== undefined) {
      setClauses.push('updated_by = ?')
      setParams.push(updated_by)
    }

    await tx.execute(
      `UPDATE traspaso_plantillas SET ${setClauses.join(', ')} WHERE id = ? AND empresa_id = ?`,
      [...setParams, id, empresa_id]
    )

    if (productoIds !== undefined) {
      // DELETE scopeado por empresa_id (defensa en profundidad multi-tenant,
      // igual que el UPDATE del header): nunca tocar el detalle de una
      // plantilla de otra empresa aunque el plantilla_id coincidiera.
      await tx.execute(
        'DELETE FROM traspaso_plantillas_det WHERE plantilla_id = ? AND empresa_id = ?',
        [id, empresa_id]
      )

      for (const productoId of productoIds) {
        const detId = uuidv4()
        await tx.execute(
          `INSERT INTO traspaso_plantillas_det (id, empresa_id, plantilla_id, producto_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [detId, empresa_id, id, productoId, now]
        )
      }
    }
  })
}

/**
 * Desactiva una plantilla (soft-delete via UPDATE is_active=0). No toca el
 * detalle ni afecta traspasos ya creados con esa plantilla (decoupled —
 * `traspasos_inventario`/`_det` no referencian `traspaso_plantillas`).
 * El UPDATE filtra por `empresa_id` (defensa en profundidad multi-tenant,
 * mismo criterio que `actualizarPlantilla`; nunca desactivar una plantilla
 * de otra empresa aunque el id coincidiera).
 */
export async function desactivarPlantilla(id: string, empresa_id: string): Promise<void> {
  const now = localNow()

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      'UPDATE traspaso_plantillas SET is_active = 0, updated_at = ? WHERE id = ? AND empresa_id = ?',
      [now, id, empresa_id]
    )
  })
}
