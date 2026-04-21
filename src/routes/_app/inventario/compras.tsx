import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { CompraList } from '@/features/inventario/components/compras/compra-list'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/inventario/compras')({
  component: ComprasPage,
})

function ComprasPage() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_ADJUST} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Facturas de Compra" descripcion="Registro y seguimiento de facturas de compra a proveedores" />
        <CompraList />
      </div>
    </RequirePermission>
  )
}
