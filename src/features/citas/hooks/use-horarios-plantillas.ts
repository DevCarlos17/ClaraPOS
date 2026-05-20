import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface PlantillaData {
  diaSemana: number
  horaInicio: string
  horaFin: string
  isActive: boolean
  tiempoPreparacionMin: number
}

export interface HorarioPlantilla {
  id: string
  empresa_id: string
  nombre: string
  data: string // JSON serializado de PlantillaData[]
  created_at: string
  updated_at: string
}

export function parsePlantillaData(dataStr: string): PlantillaData[] {
  try {
    return JSON.parse(dataStr) as PlantillaData[]
  } catch {
    return []
  }
}

export function buildPlantillaPreview(data: PlantillaData[]): string {
  const activos = data.filter((d) => d.isActive)
  if (activos.length === 0) return 'Sin dias activos'

  const NOMBRES = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
  const dias = activos.map((d) => NOMBRES[d.diaSemana] ?? '?').join(', ')

  // Si todos los activos tienen el mismo horario, resumir en una linea
  const horarios = [...new Set(activos.map((d) => `${d.horaInicio}-${d.horaFin}`))]
  const horarioStr = horarios.length === 1 ? horarios[0] : 'Horario variable'

  return `${dias}\n${horarioStr}`
}

export const MAX_PLANTILLAS = 5

export function usePlantillas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    empresaId
      ? 'SELECT * FROM horarios_plantillas WHERE empresa_id = ? ORDER BY created_at ASC'
      : '',
    empresaId ? [empresaId] : []
  )

  return { plantillas: (data ?? []) as HorarioPlantilla[], isLoading, empresaId }
}

export async function crearPlantilla(
  empresaId: string,
  nombre: string,
  data: PlantillaData[]
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO horarios_plantillas (id, empresa_id, nombre, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), empresaId, nombre, JSON.stringify(data), localNow(), localNow()]
    )
  })
}

export async function actualizarPlantilla(
  id: string,
  nombre: string,
  data: PlantillaData[]
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      'UPDATE horarios_plantillas SET nombre = ?, data = ?, updated_at = ? WHERE id = ?',
      [nombre, JSON.stringify(data), localNow(), id]
    )
  })
}

export async function renombrarPlantilla(id: string, nombre: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      'UPDATE horarios_plantillas SET nombre = ?, updated_at = ? WHERE id = ?',
      [nombre, localNow(), id]
    )
  })
}

export async function eliminarPlantilla(id: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await tx.execute('DELETE FROM horarios_plantillas WHERE id = ?', [id])
  })
}
