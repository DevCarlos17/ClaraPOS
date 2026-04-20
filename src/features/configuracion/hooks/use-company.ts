import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import {
  useMonedaContableStore,
  getMonedaContable,
  type MonedaContable,
} from '@/stores/moneda-contable-store'

export type { MonedaContable }

export interface EmpresaConfig {
  moneda_contable?: 'USD' | 'BS'
}

export function parseEmpresaConfig(configJson: string | null | undefined): EmpresaConfig {
  if (!configJson) return {}
  try {
    return JSON.parse(configJson) as EmpresaConfig
  } catch {
    return {}
  }
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

export function useMonedaContable(): MonedaContable {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  return useMonedaContableStore((s) => s.monedas[empresaId] ?? 'USD')
}

export function setMonedaContable(empresaId: string, moneda: MonedaContable): void {
  useMonedaContableStore.getState().setMoneda(empresaId, moneda)
}

/** @deprecated Use setMonedaContable(empresaId, moneda) - no longer needs currentConfig */
export function getMonedaContableForEmpresa(empresaId: string): MonedaContable {
  return getMonedaContable(empresaId)
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
