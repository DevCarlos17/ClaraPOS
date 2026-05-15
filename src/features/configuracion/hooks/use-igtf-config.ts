import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

export function useIgtfConfig() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data: fiscalData, isLoading: isLoadingFiscal } = useQuery(
    'SELECT aplica_igtf FROM empresas_fiscal_ve WHERE empresa_id = ?',
    [empresaId]
  )

  const { data: impuestoData, isLoading: isLoadingImpuesto } = useQuery(
    "SELECT porcentaje FROM impuestos_ve WHERE empresa_id = ? AND tipo_tributo = 'IGTF' AND is_active = 1 LIMIT 1",
    [empresaId]
  )

  const fiscal = (fiscalData?.[0] as { aplica_igtf: number } | undefined)
  const impuesto = (impuestoData?.[0] as { porcentaje: string } | undefined)

  const aplicaIgtf = (fiscal?.aplica_igtf ?? 0) === 1
  const tasaIgtf = impuesto ? parseFloat(impuesto.porcentaje) : 3

  return {
    aplicaIgtf,
    tasaIgtf,
    isLoading: isLoadingFiscal || isLoadingImpuesto,
  }
}
