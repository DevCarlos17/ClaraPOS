import { createFileRoute } from '@tanstack/react-router'
import { RecetaManager } from '@/features/inventario/components/recetas/receta-manager'
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
        <PageHeader titulo="Recetas" descripcion="Bill of Materials - Ingredientes por servicio" />
        <RecetaManager />
      </div>
    </RequirePermission>
  )
}
