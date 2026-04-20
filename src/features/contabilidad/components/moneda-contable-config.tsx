import { useState } from 'react'
import { toast } from 'sonner'
import { useCompany, setMonedaContable, parseEmpresaConfig } from '@/features/configuracion/hooks/use-company'
import { useCurrentUser } from '@/core/hooks/use-current-user'

export function MonedaContableConfig() {
  const { user } = useCurrentUser()
  const { company, isLoading } = useCompany()
  const [saving, setSaving] = useState(false)

  const config = parseEmpresaConfig(company?.config)
  const current = config.moneda_contable ?? 'USD'

  async function handleChange(moneda: 'USD' | 'BS') {
    if (!user?.empresa_id || !company) return
    setSaving(true)
    try {
      await setMonedaContable(user.empresa_id, moneda, company.config)
      toast.success(`Moneda contable cambiada a ${moneda}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return <div className="h-20 bg-gray-100 rounded animate-pulse" />
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Moneda de Contabilidad
      </h3>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => handleChange('USD')}
          disabled={saving || current === 'USD'}
          className={`flex-1 rounded-lg border-2 p-3 text-left transition-colors ${
            current === 'USD'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300 bg-white'
          } disabled:opacity-60`}
        >
          <div className="font-medium text-sm text-gray-900">USD — Dolares</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Los asientos se registran en dolares. Sin calculo de diferencial cambiario.
          </div>
        </button>
        <button
          onClick={() => handleChange('BS')}
          disabled={saving || current === 'BS'}
          className={`flex-1 rounded-lg border-2 p-3 text-left transition-colors ${
            current === 'BS'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300 bg-white'
          } disabled:opacity-60`}
        >
          <div className="font-medium text-sm text-gray-900">BS — Bolivares</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Los asientos se registran en bolivares. Calcula automaticamente el diferencial cambiario en cobros y pagos.
          </div>
        </button>
      </div>
      {current === 'BS' && (
        <p className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Modo BS activo. Configura las cuentas de diferencial cambiario en la seccion de abajo para habilitar el calculo automatico.
        </p>
      )}
    </div>
  )
}
