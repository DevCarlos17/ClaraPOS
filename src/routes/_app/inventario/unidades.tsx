import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { UnidadList } from '@/features/inventario/components/unidades/unidad-list'

export const Route = createFileRoute('/_app/inventario/unidades')({
  component: UnidadesPage,
})

function UnidadesPage() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Unidades" descripcion="Unidades de medida y conversiones" />
        <UnidadList />
      </div>
    </RequirePermission>
  )
}
