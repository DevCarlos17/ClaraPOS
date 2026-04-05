import { createFileRoute } from '@tanstack/react-router'
import { KardexList } from '@/features/inventario/components/kardex/kardex-list'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/inventario/kardex')({
  component: KardexPage,
})

function KardexPage() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Kardex" descripcion="Movimientos de inventario" />
        <KardexList />
      </div>
    </RequirePermission>
  )
}
