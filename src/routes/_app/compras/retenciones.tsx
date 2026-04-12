import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { RetIvaCompraList } from '@/features/compras/components/ret-iva-compra-list'
import { RetIslrCompraList } from '@/features/compras/components/ret-islr-compra-list'

export const Route = createFileRoute('/_app/compras/retenciones')({
  component: RetencionesCompraPage,
})

type TabActiva = 'iva' | 'islr'

function RetencionesCompraPage() {
  const [tabActiva, setTabActiva] = useState<TabActiva>('iva')

  return (
    <RequirePermission permission={PERMISSIONS.PURCHASES_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Retenciones" descripcion="Retenciones de IVA e ISLR en compras" />

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6" aria-label="Pestanas de retenciones">
            <button
              onClick={() => setTabActiva('iva')}
              className={`pb-3 text-sm transition-colors ${
                tabActiva === 'iva'
                  ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              IVA
            </button>
            <button
              onClick={() => setTabActiva('islr')}
              className={`pb-3 text-sm transition-colors ${
                tabActiva === 'islr'
                  ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              ISLR
            </button>
          </nav>
        </div>

        {/* Panel activo */}
        {tabActiva === 'iva' ? <RetIvaCompraList /> : <RetIslrCompraList />}
      </div>
    </RequirePermission>
  )
}
