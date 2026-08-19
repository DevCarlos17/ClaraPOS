import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'

export interface EmpresaConfig {
  moneda_contable?: 'USD' | 'BS'
  moneda_presentacion_documentos?: 'USD' | 'BS'
}

const MONEDAS_PRESENTACION_VALIDAS = new Set(['USD', 'BS'])
const MONEDAS_CONTABLE_VALIDAS = new Set(['USD', 'BS'])
/** Profundidad maxima de re-parseo al intentar recuperar config corrupto/doblemente codificado. */
const MAX_RECOVERY_DEPTH = 3
/** Claves puramente numericas (ej. "0", "1", "12"): SIEMPRE son residuo del bug de spread caracter por caracter, nunca una clave legitima de config. */
const CLAVE_NUMERICA = /^\d+$/

/** Resuelve `moneda_presentacion_documentos`: ausente o invalida siempre cae a 'USD'. */
function resolveMonedaPresentacion(valor: unknown): 'USD' | 'BS' {
  return typeof valor === 'string' && MONEDAS_PRESENTACION_VALIDAS.has(valor) ? (valor as 'USD' | 'BS') : 'USD'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Detecta el patron de corrupcion observado en produccion: un objeto cuyas claves
 * son indices numericos consecutivos ("0", "1", "2", ...) con valores de 1 caracter,
 * producto de haber hecho `{ ...unStringJSON }` (spread caracter por caracter).
 */
function isCharIndexedObject(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value)
  if (keys.length === 0) return false
  return keys.every((key, index) => key === String(index) && typeof value[key] === 'string' && value[key].length === 1)
}

/** Reconstruye el string original a partir de un objeto indexado por caracter. */
function reconstructFromCharIndexed(value: Record<string, unknown>): string {
  return Object.keys(value)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => value[key] as string)
    .join('')
}

/**
 * Normaliza el resultado de `JSON.parse` a un Record plano libre de corrupcion,
 * sanando los patrones conocidos en lugar de propagarlos:
 * - Si el parseo dio un string (config doblemente codificado), reintenta parsear ese string.
 * - Si el parseo dio un objeto indexado por caracter (spread de un string), reconstruye
 *   el string original y lo vuelve a parsear.
 * - Cualquier otro valor no-objeto (numero, array, null) cae a un record vacio.
 * - En un objeto "normal", descarta SOLO las claves puramente numericas (residuo de
 *   corrupciones parciales); preserva intacto cualquier otro namespace legitimo
 *   (ej. `agenda`, usado por `use-agenda-config.ts` en la misma columna `config`).
 */
function normalizeConfigRecord(parsed: unknown, depth = 0): Record<string, unknown> {
  if (depth > MAX_RECOVERY_DEPTH) return {}

  if (typeof parsed === 'string') {
    try {
      return normalizeConfigRecord(JSON.parse(parsed), depth + 1)
    } catch {
      return {}
    }
  }

  if (!isPlainObject(parsed)) return {}

  if (isCharIndexedObject(parsed)) {
    try {
      return normalizeConfigRecord(JSON.parse(reconstructFromCharIndexed(parsed)), depth + 1)
    } catch {
      return {}
    }
  }

  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (CLAVE_NUMERICA.test(key)) continue
    clean[key] = value
  }
  return clean
}

/** Parsea y sanea `configJson` a un Record plano, sin filtrar por claves conocidas. */
function sanitizeConfigRecord(configJson: string | null | undefined): Record<string, unknown> {
  if (!configJson) return {}
  try {
    return normalizeConfigRecord(JSON.parse(configJson))
  } catch {
    return {}
  }
}

/** Extrae y valida SOLO las claves tipadas de `EmpresaConfig` desde un record ya saneado. */
function pickKnownFields(record: Record<string, unknown>): EmpresaConfig {
  const config: EmpresaConfig = {
    moneda_presentacion_documentos: resolveMonedaPresentacion(record.moneda_presentacion_documentos),
  }
  if (typeof record.moneda_contable === 'string' && MONEDAS_CONTABLE_VALIDAS.has(record.moneda_contable)) {
    config.moneda_contable = record.moneda_contable as 'USD' | 'BS'
  }
  return config
}

export function parseEmpresaConfig(configJson: string | null | undefined): EmpresaConfig {
  return pickKnownFields(sanitizeConfigRecord(configJson))
}

/**
 * Reserializa `configJson` a un string JSON limpio, aplicando `updates` sobre las
 * claves tipadas conocidas (`moneda_contable`, `moneda_presentacion_documentos`).
 *
 * Preserva cualquier otro namespace presente en el config original (ej. `agenda`)
 * sin tocarlo, pero SIEMPRE descarta claves puramente numericas — el patron de
 * corrupcion — cerrando el ciclo en el punto de escritura: el string persistido
 * nunca puede volver a crecer por el bug de spread caracter por caracter.
 */
export function serializeEmpresaConfig(
  configJson: string | null | undefined,
  updates: Partial<EmpresaConfig> = {}
): string {
  const record = sanitizeConfigRecord(configJson)
  const knownFields = pickKnownFields({ ...record, ...updates })
  return JSON.stringify({ ...record, ...knownFields })
}

export interface Company {
  id: string
  tenant_id: string
  nombre: string
  rif: string | null
  direccion: string | null
  telefono: string | null
  email: string | null
  logo_url: string | null
  timezone: string
  moneda_base: string
  config: string
  is_active: number
  created_at: string
  updated_at: string
}

export function useCompany() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM empresas WHERE id = ?',
    [empresaId]
  )

  return {
    company: (data?.[0] as Company | undefined) ?? null,
    isLoading,
  }
}

export async function updateCompany(
  id: string,
  data: {
    nombre?: string
    rif?: string
    direccion?: string
    telefono?: string
    email?: string
    logo_url?: string
    timezone?: string
    moneda_base?: string
    config?: string
  }
) {
  const updates: Record<string, unknown> = {}

  if (data.nombre !== undefined) updates.nombre = data.nombre
  if (data.rif !== undefined) updates.rif = data.rif || null
  if (data.direccion !== undefined) updates.direccion = data.direccion || null
  if (data.telefono !== undefined) updates.telefono = data.telefono || null
  if (data.email !== undefined) updates.email = data.email || null
  if (data.logo_url !== undefined) updates.logo_url = data.logo_url || null
  if (data.timezone !== undefined) updates.timezone = data.timezone
  if (data.moneda_base !== undefined) updates.moneda_base = data.moneda_base
  if (data.config !== undefined) updates.config = data.config

  await kysely.updateTable('empresas').set(updates).where('id', '=', id).execute()
}
