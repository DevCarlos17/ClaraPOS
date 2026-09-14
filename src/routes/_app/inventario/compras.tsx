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
      {/* Altura acotada al viewport restante (TopBar h-16 + padding vertical
          de <main>) para que CompraList controle su propio scroll interno en
          vez de hacer crecer la pagina completa (mismo patron que cxc/cxp). */}
      <div className="flex h-[calc(100vh-6.5rem)] min-h-0 flex-col gap-6">
        <PageHeader titulo="Facturas de Compra" descripcion="Registro y seguimiento de facturas de compra a proveedores" />
        <CompraList />
      </div>
    </RequirePermission>
  )
}
