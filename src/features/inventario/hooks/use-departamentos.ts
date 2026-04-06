import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

export interface Departamento {
  id: string
  codigo: string
  nombre: string
  activo: number
  created_at: string
  updated_at: string
}

export interface DepartamentoConConteo extends Departamento {
  articulos_activos: number
}

export function useDepartamentos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT d.*, (
       SELECT COUNT(*) FROM productos p
       WHERE p.departamento_id = d.id AND p.activo = 1
     ) AS articulos_activos
     FROM departamentos d
     WHERE d.empresa_id = ?
     ORDER BY CAST(d.codigo AS INTEGER) ASC`,
    [empresaId]
  )
  return { departamentos: (data ?? []) as DepartamentoConConteo[], isLoading }
}

export function useDepartamentosActivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM departamentos WHERE empresa_id = ? AND activo = 1 ORDER BY CAST(codigo AS INTEGER) ASC',
    [empresaId]
  )
  return { departamentos: (data ?? []) as Departamento[], isLoading }
}

export async function getSiguienteCodigoDepartamento(empresaId: string): Promise<string> {
  const rows = await kysely
    .selectFrom('departamentos')
    .select('codigo')
    .where('empresa_id', '=', empresaId)
    .execute()

  let maxNum = 0
  for (const r of rows) {
    if (/^\d+$/.test(r.codigo)) {
      const n = parseInt(r.codigo, 10)
      if (n > maxNum) maxNum = n
    }
  }
  return String(maxNum + 1)
}

export async function crearDepartamento(nombre: string, empresaId: string) {
  const id = uuidv4()
  const now = new Date().toISOString()
  const codigo = await getSiguienteCodigoDepartamento(empresaId)

  await kysely
    .insertInto('departamentos')
    .values({
      id,
      codigo,
      nombre: nombre.toUpperCase(),
      activo: 1,
      empresa_id: empresaId,
      created_at: now,
      updated_at: now,
    })
    .execute()

  return id
}

export async function actualizarDepartamento(
  id: string,
  data: { nombre?: string; activo?: boolean }
) {
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.activo !== undefined) updates.activo = data.activo ? 1 : 0

  await kysely.updateTable('departamentos').set(updates).where('id', '=', id).execute()
}

export async function tieneProductosActivos(departamentoId: string): Promise<boolean> {
  const result = await kysely
    .selectFrom('productos')
    .select(kysely.fn.count('id').as('count'))
    .where('departamento_id', '=', departamentoId)
    .where('activo', '=', 1)
    .executeTakeFirst()

  return Number(result?.count ?? 0) > 0
}

export async function tieneProductosConExistencia(departamentoId: string): Promise<boolean> {
  const productos = await kysely
    .selectFrom('productos')
    .select('stock')
    .where('departamento_id', '=', departamentoId)
    .where('activo', '=', 1)
    .where('tipo', '=', 'P')
    .execute()

  return productos.some((p) => parseFloat(p.stock) > 0)
}

export function useProductosPorDepartamento(departamentoId: string | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT id, codigo, nombre, activo, created_at
     FROM productos
     WHERE empresa_id = ? AND departamento_id = ?
     ORDER BY nombre ASC`,
    [empresaId, departamentoId ?? '']
  )

  const productos = (data ?? []) as {
    id: string
    codigo: string
    nombre: string
    activo: number
    created_at: string
  }[]

  return { productos, isLoading }
}
