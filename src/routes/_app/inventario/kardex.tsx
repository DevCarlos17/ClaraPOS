import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { KardexList } from '@/features/inventario/components/kardex/kardex-list'
import { AjusteList } from '@/features/inventario/components/ajustes/ajuste-list'
import { AjusteMotivoList } from '@/features/inventario/components/ajuste-motivos/ajuste-motivo-list'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/inventario/kardex')({
  component: KardexPage,
})

type TabActiva = 'movimientos' | 'ajustes' | 'motivos'

function KardexPage() {
  const [tabActiva, setTabActiva] = useState<TabActiva>('movimientos')

  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Kardex" descripcion="Movimientos y ajustes de inventario" />

        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-6">
            <button
              onClick={() => setTabActiva('movimientos')}
              className={`pb-3 text-sm font-medium transition-colors ${
                tabActiva === 'movimientos'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Movimientos
            </button>
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
              Motivos de Ajuste
            </button>
          </nav>
        </div>

        {tabActiva === 'movimientos' && <KardexList />}
        {tabActiva === 'ajustes' && (
          <RequirePermission permission={PERMISSIONS.INVENTORY_ADJUST} fallback={<AccessDeniedPage />}>
            <AjusteList />
          </RequirePermission>
        )}
        {tabActiva === 'motivos' && (
          <RequirePermission permission={PERMISSIONS.INVENTORY_ADJUST} fallback={<AccessDeniedPage />}>
            <AjusteMotivoList />
          </RequirePermission>
        )}
      </div>
    </RequirePermission>
  )
}
