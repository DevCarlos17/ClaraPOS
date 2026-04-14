import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { localNow } from '@/lib/dates'

export interface EmpresaFiscal {
  id: string
  empresa_id: string
  tipo_contribuyente: string | null
  es_agente_retencion: number
  documento_identidad: string | null
  tipo_documento: string | null
  nro_providencia: string | null
  porcentaje_retencion_iva: string | null
  codigo_sucursal_seniat: string | null
  usa_maquina_fiscal: number
  aplica_igtf: number
  created_at: string
  updated_at: string
}

export function useEmpresaFiscal() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM empresas_fiscal_ve WHERE empresa_id = ?',
    [empresaId]
  )

  return {
    fiscal: (data?.[0] as EmpresaFiscal | undefined) ?? null,
    isLoading,
  }
}

export async function actualizarEmpresaFiscal(
  id: string,
  data: {
    tipo_contribuyente?: string
    es_agente_retencion?: boolean
    documento_identidad?: string
    tipo_documento?: string
    nro_providencia?: string
    porcentaje_retencion_iva?: number
    codigo_sucursal_seniat?: string
    usa_maquina_fiscal?: boolean
    aplica_igtf?: boolean
  }
) {
  const now = localNow()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.tipo_contribuyente !== undefined) updates.tipo_contribuyente = data.tipo_contribuyente || null
  if (data.es_agente_retencion !== undefined) updates.es_agente_retencion = data.es_agente_retencion ? 1 : 0
  if (data.documento_identidad !== undefined) updates.documento_identidad = data.documento_identidad || null
  if (data.tipo_documento !== undefined) updates.tipo_documento = data.tipo_documento || null
  if (data.nro_providencia !== undefined) updates.nro_providencia = data.nro_providencia || null
  if (data.porcentaje_retencion_iva !== undefined) updates.porcentaje_retencion_iva = data.porcentaje_retencion_iva?.toFixed(2) ?? null
  if (data.codigo_sucursal_seniat !== undefined) updates.codigo_sucursal_seniat = data.codigo_sucursal_seniat || null
  if (data.usa_maquina_fiscal !== undefined) updates.usa_maquina_fiscal = data.usa_maquina_fiscal ? 1 : 0
  if (data.aplica_igtf !== undefined) updates.aplica_igtf = data.aplica_igtf ? 1 : 0

  await kysely.updateTable('empresas_fiscal_ve').set(updates).where('id', '=', id).execute()
}
