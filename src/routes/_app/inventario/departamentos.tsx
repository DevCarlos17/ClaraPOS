import { createFileRoute } from '@tanstack/react-router'
import { DepartamentoList } from '@/features/inventario/components/departamentos/departamento-list'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'

export const Route = createFileRoute('/_app/inventario/departamentos')({
  component: DepartamentosPage,
})

function DepartamentosPage() {
  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Departamentos" descripcion="Gestiona las categorias de productos" />
        <DepartamentoList />
      </div>
    </RequirePermission>
  )
}
