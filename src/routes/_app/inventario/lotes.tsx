import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { LoteList } from '@/features/inventario/components/lotes/lote-list'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/inventario/lotes')({
  component: LotesPage,
})

function LotesPage() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Lotes" descripcion="Gestion de lotes y vencimientos" />
        <LoteList />
      </div>
    </RequirePermission>
  )
}
