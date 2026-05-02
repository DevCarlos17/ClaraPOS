import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { PrestamosPage } from '@/features/ventas/components/prestamos-page'

export const Route = createFileRoute('/_app/ventas/prestamos' as never)({
  component: PrestamosRouteComponent,
})

function PrestamosRouteComponent() {
  return (
    <RequirePermission
      permission={PERMISSIONS.CLIENTS_CREDIT}
      fallback={<AccessDeniedPage />}
    >
      <div className="space-y-6">
        <PageHeader titulo="Prestamos" descripcion="Consulta y seguimiento de prestamos vigentes y vencidos" />
        <PrestamosPage />
      </div>
    </RequirePermission>
  )
}
