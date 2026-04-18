import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

const UNIDADES_PREFABRICADAS = [
  { nombre: 'UNIDAD', abreviatura: 'UND', es_decimal: false },
  { nombre: 'KILOGRAMO', abreviatura: 'KG', es_decimal: true },
  { nombre: 'GRAMO', abreviatura: 'GR', es_decimal: true },
  { nombre: 'LITRO', abreviatura: 'LT', es_decimal: true },
  { nombre: 'MILILITRO', abreviatura: 'ML', es_decimal: true },
  { nombre: 'METRO', abreviatura: 'MT', es_decimal: true },
  { nombre: 'CENTIMETRO', abreviatura: 'CM', es_decimal: true },
  { nombre: 'CAJA', abreviatura: 'CJ', es_decimal: false },
  { nombre: 'DOCENA', abreviatura: 'DOC', es_decimal: false },
  { nombre: 'PAQUETE', abreviatura: 'PQ', es_decimal: false },
  { nombre: 'BOLSA', abreviatura: 'BLS', es_decimal: false },
  { nombre: 'FRASCO', abreviatura: 'FR', es_decimal: false },
]

// Conversiones: [mayor_abrev, menor_abrev, factor]
const CONVERSIONES_PREFABRICADAS: [string, string, number][] = [
  ['KG', 'GR', 1000],
  ['LT', 'ML', 1000],
  ['MT', 'CM', 100],
  ['DOC', 'UND', 12],
]

export interface Unidad {
  id: string
  empresa_id: string
  nombre: string
  abreviatura: string
  es_decimal: number
  is_active: number
  created_at: string
  updated_at: string
  updated_by: string | null
}

export function useUnidades() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM unidades WHERE empresa_id = ? ORDER BY nombre ASC',
    [empresaId]
  )
  return { unidades: (data ?? []) as Unidad[], isLoading }
}

export function useUnidadesActivas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM unidades WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre ASC',
    [empresaId]
  )
  return { unidades: (data ?? []) as Unidad[], isLoading }
}

export async function crearUnidad(data: {
  nombre: string
  abreviatura: string
  es_decimal: boolean
  empresa_id: string
}) {
  const id = uuidv4()
  const now = localNow()

  await kysely
    .insertInto('unidades')
    .values({
      id,
      nombre: data.nombre.toUpperCase(),
      abreviatura: data.abreviatura.toUpperCase(),
      es_decimal: data.es_decimal ? 1 : 0,
      is_active: 1,
      empresa_id: data.empresa_id,
      created_at: now,
      updated_at: now,
    })
    .execute()

  return id
}

/**
 * Inserta las unidades prefabricadas del sistema que no existan aun (por abreviatura).
 * Tambien crea las conversiones basicas si no existen.
 * Retorna el numero de unidades insertadas.
 */
export async function cargarUnidadesPrefabricadas(empresaId: string): Promise<number> {
  const now = localNow()

  // Leer unidades existentes
  const existentes = await kysely
    .selectFrom('unidades')
    .select(['abreviatura', 'id'])
    .where('empresa_id', '=', empresaId)
    .execute()

  const existentesMap = new Map(existentes.map((u) => [u.abreviatura.toUpperCase(), u.id]))
  const insertadas: string[] = []

  for (const u of UNIDADES_PREFABRICADAS) {
    if (!existentesMap.has(u.abreviatura)) {
      const id = uuidv4()
      await kysely
        .insertInto('unidades')
        .values({
          id,
          nombre: u.nombre,
          abreviatura: u.abreviatura,
          es_decimal: u.es_decimal ? 1 : 0,
          is_active: 1,
          empresa_id: empresaId,
          created_at: now,
          updated_at: now,
        })
        .execute()
      existentesMap.set(u.abreviatura, id)
      insertadas.push(u.abreviatura)
    }
  }

  // Crear conversiones basicas si no existen
  for (const [mayorAbrev, menorAbrev, factor] of CONVERSIONES_PREFABRICADAS) {
    const mayorId = existentesMap.get(mayorAbrev)
    const menorId = existentesMap.get(menorAbrev)
    if (!mayorId || !menorId) continue

    const convExistente = await kysely
      .selectFrom('unidades_conversion')
      .select('id')
      .where('empresa_id', '=', empresaId)
      .where('unidad_mayor_id', '=', mayorId)
      .where('unidad_menor_id', '=', menorId)
      .executeTakeFirst()

    if (!convExistente) {
      await kysely
        .insertInto('unidades_conversion')
        .values({
          id: uuidv4(),
          empresa_id: empresaId,
          unidad_mayor_id: mayorId,
          unidad_menor_id: menorId,
          factor: factor.toString(),
          is_active: 1,
          created_at: now,
          updated_at: now,
        })
        .execute()
    }
  }

  return insertadas.length
}

export async function actualizarUnidad(
  id: string,
  data: {
    nombre?: string
    abreviatura?: string
    es_decimal?: boolean
    is_active?: boolean
    updated_by?: string
  }
) {
  const now = localNow()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.abreviatura !== undefined) updates.abreviatura = data.abreviatura.toUpperCase()
  if (data.es_decimal !== undefined) updates.es_decimal = data.es_decimal ? 1 : 0
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0
  if (data.updated_by !== undefined) updates.updated_by = data.updated_by

  await kysely.updateTable('unidades').set(updates).where('id', '=', id).execute()
}
