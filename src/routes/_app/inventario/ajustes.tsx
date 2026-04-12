import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { AjusteMotivoList } from '@/features/inventario/components/ajuste-motivos/ajuste-motivo-list'
import { AjusteList } from '@/features/inventario/components/ajustes/ajuste-list'

export const Route = createFileRoute('/_app/inventario/ajustes')({
  component: AjustesPage,
})

type TabActiva = 'ajustes' | 'motivos'

function AjustesPage() {
  const [tabActiva, setTabActiva] = useState<TabActiva>('ajustes')

  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_ADJUST} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Ajustes de Inventario" descripcion="Entradas y salidas de ajuste de inventario" />

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-6">
            <button
              onClick={() => setTabActiva('ajustes')}
              className={`pb-3 text-sm font-medium transition-colors ${
                tabActiva === 'ajustes'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Ajustes
            </button>
            <button
              onClick={() => setTabActiva('motivos')}
              className={`pb-3 text-sm font-medium transition-colors ${
                tabActiva === 'motivos'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Motivos
            </button>
          </nav>
        </div>

        {/* Contenido del tab activo */}
        {tabActiva === 'ajustes' && (
          <AjusteList />
        )}

        {tabActiva === 'motivos' && (
          <AjusteMotivoList />
        )}
      </div>
    </RequirePermission>
  )
}
