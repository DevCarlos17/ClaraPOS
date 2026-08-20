import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { TraspasoList } from '@/features/inventario/components/traspasos/traspaso-list'

export const Route = createFileRoute('/_app/inventario/traspasos')({
  component: TraspasosPage,
})

function TraspasosPage() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_ADJUST} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Traspasos de Inventario" descripcion="Movimientos de stock entre depositos" />
        <TraspasoList />
      </div>
    </RequirePermission>
  )
}
