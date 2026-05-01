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

        <div className="rounded-xl bg-card shadow-md p-6">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-border mb-4">
            <button
              onClick={() => setTabActiva('iva')}
              className={
                tabActiva === 'iva'
                  ? 'px-3 pb-3 pt-1 text-sm font-medium border-b-2 border-blue-600 text-blue-600 cursor-pointer'
                  : 'px-3 pb-3 pt-1 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-t-md transition-colors cursor-pointer'
              }
            >
              IVA
            </button>
            <button
              onClick={() => setTabActiva('islr')}
              className={
                tabActiva === 'islr'
                  ? 'px-3 pb-3 pt-1 text-sm font-medium border-b-2 border-blue-600 text-blue-600 cursor-pointer'
                  : 'px-3 pb-3 pt-1 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-t-md transition-colors cursor-pointer'
              }
            >
              ISLR
            </button>
          </div>

          {/* Panel activo */}
          {tabActiva === 'iva' ? <RetIvaCompraList /> : <RetIslrCompraList />}
        </div>
      </div>
    </RequirePermission>
  )
}
