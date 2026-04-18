import { createFileRoute } from '@tanstack/react-router'
import { ServicioList } from '@/features/inventario/components/recetas/servicio-list'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/inventario/recetas')({
  component: RecetasPage,
})

function RecetasPage() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Servicios y Recetas" descripcion="Gestion de servicios y sus recetas de insumos" />
        <ServicioList />
      </div>
    </RequirePermission>
  )
}
