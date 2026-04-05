import { createFileRoute } from '@tanstack/react-router'
import { ProductoList } from '@/features/inventario/components/productos/producto-list'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/inventario/productos')({
  component: ProductosPage,
})

function ProductosPage() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Productos y Servicios" descripcion="Catalogo maestro de productos y servicios" />
        <ProductoList />
      </div>
    </RequirePermission>
  )
}
