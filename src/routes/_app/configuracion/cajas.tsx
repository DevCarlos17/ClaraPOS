import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { CajaList } from '@/features/configuracion/components/cajas/caja-list'

export const Route = createFileRoute('/_app/configuracion/cajas')({
  component: CajasPage,
})

function CajasPage() {
  return (
    <RequirePermission permission={PERMISSIONS.CONFIG_RATES} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Cajas" descripcion="Gestion de cajas registradoras" />
        <CajaList />
      </div>
    </RequirePermission>
  )
}
