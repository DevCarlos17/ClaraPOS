import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { DepositoList } from '@/features/inventario/components/depositos/deposito-list'

export const Route = createFileRoute('/_app/inventario/depositos')({
  component: DepositosPage,
})

function DepositosPage() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Depositos" descripcion="Almacenes y depositos de inventario" />
        <DepositoList />
      </div>
    </RequirePermission>
  )
}
