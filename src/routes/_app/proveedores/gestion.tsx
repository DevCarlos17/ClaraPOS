import { createFileRoute } from '@tanstack/react-router'
import { ProveedorList } from '@/features/proveedores/components/proveedor-list'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/proveedores/gestion')({
  component: ProveedoresGestionPage,
})

function ProveedoresGestionPage() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_ADJUST} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Proveedores" descripcion="Gestiona la ficha de proveedores del negocio" />
        <ProveedorList />
      </div>
    </RequirePermission>
  )
}
