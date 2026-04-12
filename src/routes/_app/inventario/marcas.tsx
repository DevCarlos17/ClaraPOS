import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { MarcaList } from '@/features/inventario/components/marcas/marca-list'

export const Route = createFileRoute('/_app/inventario/marcas')({
  component: MarcasPage,
})

function MarcasPage() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Marcas" descripcion="Catalogo de marcas de productos" />
        <MarcaList />
      </div>
    </RequirePermission>
  )
}
