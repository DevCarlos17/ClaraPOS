import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { CompraList } from '@/features/inventario/components/compras/compra-list'

export const Route = createFileRoute('/_app/compras/facturas')({
  component: FacturasCompraPage,
})

function FacturasCompraPage() {
  return (
    <RequirePermission permission={PERMISSIONS.PURCHASES_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Facturas de Compra" descripcion="Registro de facturas de compra a proveedores" />
        <CompraList />
      </div>
    </RequirePermission>
  )
}
